-- =====================================================================
-- schema_v4b_escalas.sql — voo com escalas num registro só.
-- Rodar no SQL Editor depois do schema_v4_fechamento.sql. Idempotente.
-- =====================================================================

-- Aeródromos intermediários, na ordem (SNTF → SDIY → SIFC: escalas = {SDIY}).
alter table voos add column if not exists escalas text[] not null default '{}';

create or replace function escalas_validas(p text[]) returns boolean
  language sql immutable as
$$ select coalesce(bool_and(e ~ '^[A-Z0-9]{4}$'), true) from unnest(p) e $$;

do $$ begin
  alter table voos add constraint voos_escalas_icao check (escalas_validas(escalas));
exception when duplicate_object then null; end $$;

-- Escala nova entra no cadastro de aeródromos como origem/destino.
create or replace function cadastrar_aerodromo_do_voo() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare e text;
begin
  if new.origem is not null then insert into aerodromos (icao) values (new.origem) on conflict do nothing; end if;
  if new.destino is not null then insert into aerodromos (icao) values (new.destino) on conflict do nothing; end if;
  foreach e in array new.escalas loop
    insert into aerodromos (icao) values (e) on conflict do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists voos_aerodromo on voos;
create trigger voos_aerodromo after insert or update of origem, destino, escalas on voos
  for each row execute function cadastrar_aerodromo_do_voo();

-- Trecho completo no PDF do fechamento.
create or replace function linhas_mes(p_aeronave uuid, p_mes date)
  returns table (data date, tipo text, descricao text, trecho text, horas numeric, valor numeric, pagador text, criterio text, por_socio jsonb)
  language sql stable security invoker as
$$
  with m as (select date_trunc('month', p_mes)::date as ini, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as fim)
  select v.data, 'VOO', coalesce(s.apelido, 'SOCIEDADE') || case when v.natureza <> 'PARTICULAR' then ' · ' || v.natureza::text else '' end,
         array_to_string(array[coalesce(v.origem, '?')] || v.escalas || array[coalesce(v.destino, '?')], ' → '), v.horas, null, null, null,
         (select jsonb_object_agg(so.apelido, vs.horas) from v_voo_socio vs join socios so on so.id = vs.socio_id where vs.voo_id = v.id)
  from voos v left join socios s on s.id = v.socio_id, m
  where v.aeronave_id = p_aeronave and v.deleted_at is null and v.data between m.ini and m.fim
  union all
  select d.data, 'DESPESA', d.descricao || coalesce(' · ' || f.nome, ''), c.nome, null, d.valor,
         coalesce(p.apelido, 'CAIXA'),
         case when d.pago_pelo_fundo then 'FUNDO' else d.criterio::text end,
         (select jsonb_object_agg(so.apelido, r.valor) from rateios r join socios so on so.id = r.socio_id where r.despesa_id = d.id)
  from despesas d
  join categorias_despesa c on c.id = d.categoria_id
  left join fornecedores f on f.id = d.fornecedor_id
  left join socios p on p.id = d.pagador_socio_id, m
  where d.aeronave_id = p_aeronave and d.deleted_at is null and d.data between m.ini and m.fim
  union all
  select a.data, 'APORTE', 'APORTE ' || s.apelido || coalesce(' · ' || a.descricao, ''), null, null, a.valor, s.apelido, null,
         jsonb_build_object(s.apelido, -a.valor)
  from aportes a join socios s on s.id = a.socio_id, m
  where a.deleted_at is null and a.data between m.ini and m.fim
  order by 1, 2
$$;

notify pgrst, 'reload schema';
