-- =====================================================================
-- schema_v4_fechamento.sql — Fase 4a: fechamento do mês.
-- Rodar no SQL Editor DEPOIS do schema_v3. Idempotente.
--
-- Fechar o mês congela: voo, despesa, abastecimento e aporte com data
-- dentro dele não entram mais (trigger barrar_mes_fechado), o rateio
-- POR_HORAS e o fundo de reserva não são recalculados. O resumo por sócio
-- fica gravado em `fechamentos.resumo` (o que cada um viu na hora de
-- fechar), e o acerto sugerido também. Reabrir é do admin e fica no
-- histórico.
-- =====================================================================

alter table fechamentos add column if not exists reaberto_por uuid references usuarios(id);
alter table fechamentos add column if not exists reaberto_em timestamptz;
alter table fechamentos add column if not exists historico jsonb not null default '[]'::jsonb;
alter table fechamentos add column if not exists observacao text;

-- ---------------------------------------------------------------------
-- Resumo do mês por sócio (ao vivo): horas, créditos, débitos, saldo do
-- mês, saldo acumulado até o fim do mês, combustível e fundo.
-- ---------------------------------------------------------------------
create or replace function resumo_mes(p_aeronave uuid, p_mes date)
  returns table (
    socio_id uuid, apelido text, cor text,
    horas numeric, qtd_voos int,
    creditos numeric, debitos numeric, saldo_mes numeric, saldo_acumulado numeric,
    litros_abastecidos numeric, litros_consumidos numeric, saldo_litros numeric, combustivel_valor numeric,
    fundo numeric, rateado numeric
  )
  language sql stable security invoker as
$$
  with m as (select date_trunc('month', p_mes)::date as ini, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as fim)
  select s.id, s.apelido, s.cor,
    coalesce((select sum(v.horas) from v_voo_socio v, m where v.aeronave_id = p_aeronave and v.socio_id = s.id and v.data between m.ini and m.fim), 0),
    coalesce((select count(*) from v_voo_socio v, m where v.aeronave_id = p_aeronave and v.socio_id = s.id and v.data between m.ini and m.fim), 0)::int,
    coalesce((select sum(e.credito) from v_extrato_socio e, m where e.socio_id = s.id and e.data between m.ini and m.fim), 0),
    coalesce((select sum(e.debito) from v_extrato_socio e, m where e.socio_id = s.id and e.data between m.ini and m.fim), 0),
    coalesce((select sum(e.credito - e.debito) from v_extrato_socio e, m where e.socio_id = s.id and e.data between m.ini and m.fim), 0),
    coalesce((select sum(e.credito - e.debito) from v_extrato_socio e, m where e.socio_id = s.id and e.data <= m.fim), 0),
    coalesce((select c.litros_abastecidos from v_combustivel_socio_mes c, m where c.aeronave_id = p_aeronave and c.socio_id = s.id and c.mes = m.ini), 0),
    coalesce((select c.litros_consumidos from v_combustivel_socio_mes c, m where c.aeronave_id = p_aeronave and c.socio_id = s.id and c.mes = m.ini), 0),
    coalesce((select c.saldo_litros from v_combustivel_socio_mes c, m where c.aeronave_id = p_aeronave and c.socio_id = s.id and c.mes = m.ini), 0),
    coalesce((select c.valor from v_combustivel_socio_mes c, m where c.aeronave_id = p_aeronave and c.socio_id = s.id and c.mes = m.ini), 0),
    coalesce((select sum(f.valor) from fundo_reserva_movimentos f, m where f.aeronave_id = p_aeronave and f.socio_id = s.id and f.mes = m.ini and f.tipo = 'ENTRADA'), 0),
    coalesce((select sum(r.valor) from rateios r join despesas d on d.id = r.despesa_id, m where d.aeronave_id = p_aeronave and r.socio_id = s.id and d.deleted_at is null and d.data between m.ini and m.fim), 0)
  from socios s, m
  where s.ativo_desde <= m.fim and (s.ativo_ate is null or s.ativo_ate >= m.ini)
  order by s.apelido
$$;

-- Pendências que impedem ou avisam antes de fechar.
create or replace function pendencias_mes(p_aeronave uuid, p_mes date)
  returns table (tipo text, quantidade int, bloqueia boolean)
  language sql stable security invoker as
$$
  with m as (select date_trunc('month', p_mes)::date as ini, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as fim)
  select 'VOO SEM POUSO', count(*)::int, true from voos v, m
    where v.aeronave_id = p_aeronave and v.deleted_at is null and v.data between m.ini and m.fim and v.horimetro_inicial is not null and v.horimetro_final is null
  union all
  select 'VOO COM HORÍMETRO PENDENTE', count(*)::int, false from voos v, m
    where v.aeronave_id = p_aeronave and v.deleted_at is null and v.data between m.ini and m.fim and v.pendente_horimetro
  union all
  select 'DESPESA PENDENTE DE APROVAÇÃO', count(*)::int, false from despesas d, m
    where d.aeronave_id = p_aeronave and d.deleted_at is null and d.data between m.ini and m.fim and d.status = 'PENDENTE'
  union all
  select 'MANUTENÇÃO EM ABERTO', count(*)::int, false from manutencoes x, m
    where x.aeronave_id = p_aeronave and x.deleted_at is null and x.status <> 'CONCLUIDA' and x.data_inicio <= m.fim
$$;

-- ---------------------------------------------------------------------
-- Fechar: grava o resumo e congela. Reabrir: auditado.
-- ---------------------------------------------------------------------
create or replace function fechar_mes(p_aeronave uuid, p_mes date, p_observacao text default null) returns uuid
  language plpgsql security definer set search_path = public as
$$
declare v_mes date := date_trunc('month', p_mes)::date; v_id uuid; v_resumo jsonb; v_bloq int;
begin
  if not sou_admin() then raise exception 'Só o administrador fecha o mês.'; end if;
  if v_mes >= date_trunc('month', current_date)::date then raise exception 'Só dá para fechar mês já terminado.'; end if;
  if mes_fechado(p_aeronave, v_mes) then raise exception 'O mês de % já está fechado.', to_char(v_mes, 'MM/YYYY'); end if;

  select coalesce(sum(quantidade), 0) into v_bloq from pendencias_mes(p_aeronave, v_mes) where bloqueia;
  if v_bloq > 0 then raise exception 'Há % voo(s) sem pouso registrado no mês. Registre o pouso antes de fechar.', v_bloq; end if;

  -- garante rateios e fundo atualizados antes de congelar
  perform provisionar_fundo_reserva(p_aeronave, v_mes);
  perform calcular_rateio(d.id) from despesas d
    where d.aeronave_id = p_aeronave and d.deleted_at is null and d.criterio <> 'MANUAL'
      and d.data between v_mes and (v_mes + interval '1 month - 1 day')::date;

  select jsonb_agg(to_jsonb(r) order by r.apelido) into v_resumo from resumo_mes(p_aeronave, v_mes) r;

  insert into fechamentos (aeronave_id, mes, status, fechado_por, fechado_em, horimetro_final, resumo, observacao)
  values (p_aeronave, v_mes, 'FECHADO', auth.uid(), now(),
          (select max(horimetro_final) from voos where aeronave_id = p_aeronave and deleted_at is null and data <= (v_mes + interval '1 month - 1 day')::date),
          v_resumo, p_observacao)
  on conflict (aeronave_id, mes) do update
    set status = 'FECHADO', fechado_por = auth.uid(), fechado_em = now(), horimetro_final = excluded.horimetro_final,
        resumo = excluded.resumo, observacao = coalesce(excluded.observacao, fechamentos.observacao),
        historico = fechamentos.historico || jsonb_build_object('acao', 'FECHOU', 'por', auth.uid(), 'em', now())
  returning id into v_id;
  return v_id;
end $$;

create or replace function reabrir_mes(p_aeronave uuid, p_mes date, p_motivo text) returns void
  language plpgsql security definer set search_path = public as
$$
declare v_mes date := date_trunc('month', p_mes)::date;
begin
  if not sou_admin() then raise exception 'Só o administrador reabre o mês.'; end if;
  if not mes_fechado(p_aeronave, v_mes) then raise exception 'O mês de % não está fechado.', to_char(v_mes, 'MM/YYYY'); end if;
  update fechamentos
    set status = 'ABERTO', reaberto_por = auth.uid(), reaberto_em = now(),
        historico = historico || jsonb_build_object('acao', 'REABRIU', 'por', auth.uid(), 'em', now(), 'motivo', p_motivo)
  where aeronave_id = p_aeronave and mes = v_mes;
end $$;

-- Linhas do mês para o PDF: voos e despesas em ordem de data, com a parte
-- de cada sócio (despesa) ou as horas de cada sócio (voo).
create or replace function linhas_mes(p_aeronave uuid, p_mes date)
  returns table (data date, tipo text, descricao text, trecho text, horas numeric, valor numeric, pagador text, criterio text, por_socio jsonb)
  language sql stable security invoker as
$$
  with m as (select date_trunc('month', p_mes)::date as ini, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as fim)
  select v.data, 'VOO', coalesce(s.apelido, 'SOCIEDADE') || case when v.natureza <> 'PARTICULAR' then ' · ' || v.natureza::text else '' end,
         coalesce(v.origem, '?') || ' → ' || coalesce(v.destino, '?'), v.horas, null, null, null,
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
