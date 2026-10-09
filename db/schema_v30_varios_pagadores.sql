-- =====================================================================
-- schema_v30_varios_pagadores.sql — despesa paga por mais de um sócio,
-- com valores diferentes.
-- Rodar no SQL Editor depois do v29. Idempotente.
--
-- Até aqui "quem pagou" era um só (um sócio, o caixa, ou cada sócio a sua
-- parte). A compra do tanque foi paga por três sócios, em valores
-- diferentes — agora dá para lançar assim: cada um entra com um crédito
-- do que colocou, e o rateio continua dividindo o custo pela regra.
-- =====================================================================

create table if not exists despesa_pagadores (
  id          uuid primary key default gen_random_uuid(),
  despesa_id  uuid not null references despesas(id) on delete cascade,
  socio_id    uuid not null references socios(id),
  valor       numeric(14,2) not null check (valor > 0),
  created_at  timestamptz not null default now(),
  unique (despesa_id, socio_id)
);
create index if not exists despesa_pagadores_despesa_idx on despesa_pagadores (despesa_id);

alter table despesa_pagadores enable row level security;
drop policy if exists despesa_pagadores_ler on despesa_pagadores;
create policy despesa_pagadores_ler on despesa_pagadores for select using (meu_perfil() in ('admin', 'socio'));

-- ---------------------------------------------------------------------
-- Quem pagou e quanto. A soma tem de bater com o valor da despesa.
-- Lista vazia desfaz (volta a ter um pagador só).
-- ---------------------------------------------------------------------
create or replace function definir_pagadores(p_despesa uuid, p_partes jsonb)
  returns void
  language plpgsql security definer set search_path = public as
$$
declare
  d despesas%rowtype;
  v_soma numeric(14,2) := 0;
  v_item jsonb;
  v_socio uuid;
  v_valor numeric(14,2);
begin
  select * into d from despesas where id = p_despesa and deleted_at is null;
  if not found then raise exception 'Despesa não encontrada.'; end if;
  if not (sou_admin() or d.autor_id = auth.uid()) then
    raise exception 'Só o administrador ou quem lançou muda quem pagou.';
  end if;
  if mes_fechado(d.aeronave_id, date_trunc('month', d.data)::date) then
    raise exception 'O mês de % está fechado.', to_char(d.data, 'MM/YYYY');
  end if;

  delete from despesa_pagadores where despesa_id = p_despesa;

  if p_partes is null or jsonb_array_length(p_partes) = 0 then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_partes) loop
    v_socio := nullif(v_item->>'socio_id', '')::uuid;
    v_valor := round((v_item->>'valor')::numeric, 2);
    if v_socio is null then raise exception 'Escolha o sócio de cada pagamento.'; end if;
    if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor de cada pagamento.'; end if;
    insert into despesa_pagadores (despesa_id, socio_id, valor) values (p_despesa, v_socio, v_valor)
      on conflict (despesa_id, socio_id) do update set valor = despesa_pagadores.valor + excluded.valor;
    v_soma := v_soma + v_valor;
  end loop;

  if abs(v_soma - d.valor) > 0.01 then
    delete from despesa_pagadores where despesa_id = p_despesa;
    raise exception 'A soma do que cada um pagou (%) não bate com o valor da despesa (%).',
      to_char(v_soma, 'FM999G999G990D00'), to_char(d.valor, 'FM999G999G990D00');
  end if;

  -- Com vários pagadores não existe um pagador único nem "cada um a sua parte".
  update despesas set pagador_socio_id = null, pago_pelos_socios = false where id = p_despesa;
end $$;

-- ---------------------------------------------------------------------
-- Caixa: despesa paga pelos sócios (um ou vários) não sai do caixa.
-- ---------------------------------------------------------------------
create or replace view v_caixa with (security_invoker = true) as
select a.data, 'APORTE ' || s.apelido as descricao, a.valor as entrada, 0::numeric(14,2) as saida, a.id as origem_id
from aportes a join socios s on s.id = a.socio_id where a.deleted_at is null
union all
select d.data, d.descricao, 0, d.valor, d.id
from despesas d
where d.deleted_at is null and d.pagador_socio_id is null
  and d.tanque is distinct from 'RETIRADA'
  and d.status <> 'PENDENTE'
  and not d.pago_pelos_socios
  and not exists (select 1 from despesa_pagadores p where p.despesa_id = d.id);

-- ---------------------------------------------------------------------
-- Extrato: cada pagador entra com crédito do que colocou.
-- ---------------------------------------------------------------------
create or replace view v_extrato_socio with (security_invoker = true) as
select a.socio_id, a.data, 'APORTE'::text as tipo, coalesce(a.descricao, 'APORTE') as descricao,
       a.valor as credito, 0::numeric(14,2) as debito, a.id as origem_id, 'aportes'::text as origem
from aportes a where a.deleted_at is null
union all
-- despesa paga por um sócio: crédito do valor inteiro
select d.pagador_socio_id, d.data, 'PAGOU', d.descricao, d.valor, 0, d.id, 'despesas'
from despesas d
where d.deleted_at is null and d.pagador_socio_id is not null
  and not (d.criterio = 'DIRETO' and d.socio_direto_id is not distinct from d.pagador_socio_id)
union all
-- despesa dividida entre vários pagadores: cada um pelo que pagou
select p.socio_id, d.data, 'PAGOU', d.descricao, p.valor, 0, d.id, 'despesas'
from despesa_pagadores p
join despesas d on d.id = p.despesa_id
where d.deleted_at is null
union all
-- a parte de cada um em cada despesa: débito
select r.socio_id, d.data, 'RATEIO', d.descricao, 0, r.valor, d.id, 'despesas'
from rateios r join despesas d on d.id = r.despesa_id
where d.deleted_at is null
  and not (d.criterio = 'DIRETO' and d.socio_direto_id is not distinct from d.pagador_socio_id)
  and not d.pago_pelos_socios
union all
-- fundo de reserva do mês
select f.socio_id, f.mes, 'FUNDO', f.descricao, 0, f.valor, f.id, 'fundo_reserva_movimentos'
from fundo_reserva_movimentos f where f.tipo = 'ENTRADA' and f.socio_id is not null;

notify pgrst, 'reload schema';
