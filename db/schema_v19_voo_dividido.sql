-- =====================================================================
-- schema_v19_voo_dividido.sql — voo dividido entre sócios.
-- Rodar no SQL Editor depois do v18. Idempotente.
--
-- Até aqui o voo era de UM sócio (ou da sociedade, dividido igual). Agora
-- as horas podem ser repartidas: 3,0 h do ARTHUR + 1,0 h do CAETANO, ou
-- uma parte da sociedade (dividida igual entre os ativos).
--   voo_socios.socio_id null = parte da sociedade
-- Sem linhas em voo_socios, tudo continua como antes.
-- =====================================================================

create table if not exists voo_socios (
  id        uuid primary key default gen_random_uuid(),
  voo_id    uuid not null references voos(id) on delete cascade,
  socio_id  uuid references socios(id),
  horas     numeric(8,1) not null check (horas > 0),
  created_at timestamptz not null default now()
);
create index if not exists voo_socios_voo on voo_socios(voo_id);
-- uma linha por sócio (e uma única linha "sociedade")
create unique index if not exists voo_socios_unico on voo_socios(voo_id, coalesce(socio_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table voo_socios enable row level security;
drop policy if exists voo_socios_ler on voo_socios;
create policy voo_socios_ler on voo_socios for select using (meu_perfil() is not null);

-- ---------------------------------------------------------------------
-- Horas e litros por sócio: divisão do voo quando houver, senão a regra
-- antiga (sócio responsável, ou rateio igual no uso comum).
-- ---------------------------------------------------------------------
create or replace view v_voo_socio with (security_invoker = true) as
with base as (
  select
    v.id as voo_id, v.aeronave_id, v.data, v.natureza, v.horas,
    case
      when v.combustivel_inicial_l is not null and v.combustivel_final_l is not null
        then v.combustivel_inicial_l - v.combustivel_final_l
      else round(coalesce(a.consumo_medio_lh, 0) * v.horas, 1)
    end as litros,
    (v.combustivel_inicial_l is null or v.combustivel_final_l is null) as litros_estimados,
    v.socio_id,
    exists (select 1 from voo_socios d where d.voo_id = v.id) as dividido
  from voos v
  join aeronaves a on a.id = v.aeronave_id
  where v.deleted_at is null
)
-- voo de um sócio só
select b.voo_id, b.aeronave_id, b.data, b.natureza, b.socio_id, b.horas, b.litros, b.litros_estimados, false as uso_comum
from base b where b.socio_id is not null and not b.dividido
union all
-- uso comum: parte igual para cada sócio ativo
select b.voo_id, b.aeronave_id, b.data, b.natureza, s.socio_id, round(b.horas / n.qt, 1), round(b.litros / n.qt, 1), b.litros_estimados, true
from base b
cross join lateral (select count(*) as qt from socios_ativos_em(b.data)) n
cross join lateral socios_ativos_em(b.data) s
where b.socio_id is null and not b.dividido and n.qt > 0
union all
-- voo dividido: a parte de cada sócio
select b.voo_id, b.aeronave_id, b.data, b.natureza, d.socio_id, d.horas,
       round(b.litros * d.horas / nullif(b.horas, 0), 1), b.litros_estimados, false
from base b
join voo_socios d on d.voo_id = b.voo_id
where b.dividido and d.socio_id is not null
union all
-- voo dividido: a parte da sociedade, igual entre os ativos
select b.voo_id, b.aeronave_id, b.data, b.natureza, s.socio_id, round(d.horas / n.qt, 1),
       round(b.litros * d.horas / nullif(b.horas, 0) / n.qt, 1), b.litros_estimados, true
from base b
join voo_socios d on d.voo_id = b.voo_id and d.socio_id is null
cross join lateral (select count(*) as qt from socios_ativos_em(b.data)) n
cross join lateral socios_ativos_em(b.data) s
where b.dividido and n.qt > 0;

-- ---------------------------------------------------------------------
-- Define (ou apaga) a divisão do voo. Admin ou quem lançou o voo.
-- p_partes: [{"socio_id": "uuid ou null", "horas": 1.5}, ...]
-- Lista vazia volta o voo para o sócio responsável.
-- ---------------------------------------------------------------------
create or replace function definir_divisao_voo(p_voo uuid, p_partes jsonb) returns void
  language plpgsql security definer set search_path = public as
$$
declare v voos%rowtype; v_soma numeric(8,1); v_qt int;
begin
  select * into v from voos where id = p_voo and deleted_at is null;
  if not found then raise exception 'Voo não encontrado.'; end if;
  if not (sou_admin() or v.autor_id = auth.uid()) then
    raise exception 'Só o administrador ou quem lançou o voo divide as horas.';
  end if;
  if mes_fechado(v.aeronave_id, v.data) then
    raise exception 'O mês do voo está fechado.';
  end if;

  delete from voo_socios where voo_id = p_voo;

  if p_partes is null or jsonb_array_length(p_partes) = 0 then
    perform provisionar_fundo_reserva(v.aeronave_id, date_trunc('month', v.data)::date);
    return;
  end if;

  select count(*), coalesce(sum((x->>'horas')::numeric), 0) into v_qt, v_soma
  from jsonb_array_elements(p_partes) x;
  if v_soma is null or abs(v_soma - v.horas) > 0.05 then
    raise exception 'As partes somam % h e o voo tem % h.', coalesce(v_soma, 0), v.horas;
  end if;

  insert into voo_socios (voo_id, socio_id, horas)
  select p_voo, nullif(x->>'socio_id', '')::uuid, (x->>'horas')::numeric
  from jsonb_array_elements(p_partes) x
  where (x->>'horas')::numeric > 0;

  -- as despesas POR_HORAS do período e o fundo do mês mudam de proporção
  perform provisionar_fundo_reserva(v.aeronave_id, date_trunc('month', v.data)::date);
  perform calcular_rateio(d.id)
  from despesas d
  where d.aeronave_id = v.aeronave_id and d.deleted_at is null and d.criterio = 'POR_HORAS'
    and v.data between coalesce(d.periodo_inicio, date_trunc('month', d.data)::date)
                   and coalesce(d.periodo_fim, (date_trunc('month', d.data) + interval '1 month - 1 day')::date)
    and not mes_fechado(d.aeronave_id, d.data);
end $$;

notify pgrst, 'reload schema';
