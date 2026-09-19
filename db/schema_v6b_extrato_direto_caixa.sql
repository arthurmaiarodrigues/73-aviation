-- =====================================================================
-- schema_v6b_extrato_direto_caixa.sql — correção no extrato do sócio.
-- Rodar no SQL Editor depois do schema_v6. Idempotente.
--
-- Despesa DIRETO paga pelo caixa (taxa de pouso paga pelo caixa, retirada
-- do tanque) não aparecia como débito do sócio: a comparação
-- `socio_direto_id = pagador_socio_id` com pagador nulo dá NULL e o
-- `not (...)` descartava a linha. Agora usa `is not distinct from`.
-- =====================================================================

create or replace view v_extrato_socio with (security_invoker = true) as
select a.socio_id, a.data, 'APORTE'::text as tipo, coalesce(a.descricao, 'APORTE') as descricao,
       a.valor as credito, 0::numeric(14,2) as debito, a.id as origem_id, 'aportes'::text as origem
from aportes a where a.deleted_at is null
union all
-- despesa paga pelo sócio: crédito do valor inteiro
select d.pagador_socio_id, d.data, 'PAGOU', d.descricao, d.valor, 0, d.id, 'despesas'
from despesas d
where d.deleted_at is null and d.pagador_socio_id is not null
  and not (d.criterio = 'DIRETO' and d.socio_direto_id is not distinct from d.pagador_socio_id)
union all
-- a parte de cada um em cada despesa: débito
select r.socio_id, d.data, 'RATEIO', d.descricao, 0, r.valor, d.id, 'despesas'
from rateios r join despesas d on d.id = r.despesa_id
where d.deleted_at is null
  and not (d.criterio = 'DIRETO' and d.socio_direto_id is not distinct from d.pagador_socio_id)
union all
-- fundo de reserva do mês
select f.socio_id, f.mes, 'FUNDO', f.descricao, 0, f.valor, f.id, 'fundo_reserva_movimentos'
from fundo_reserva_movimentos f where f.tipo = 'ENTRADA' and f.socio_id is not null
union all
-- combustível do mês: saldo em litros valorado
select c.socio_id, c.mes, 'COMBUSTÍVEL',
       'COMBUSTÍVEL ' || to_char(c.mes, 'MM/YYYY') || ': ' || c.litros_abastecidos || ' L ABASTECIDOS − '
         || c.litros_consumidos || ' L USADOS = ' || c.saldo_litros || ' L'
         || case when c.tem_estimativa then ' (PARTE ESTIMADA)' else '' end,
       case when c.valor > 0 then c.valor else 0 end,
       case when c.valor < 0 then -c.valor else 0 end,
       null::uuid, 'v_combustivel_socio_mes'
from v_combustivel_socio_mes c where c.valor <> 0;

create or replace view v_saldo_socio with (security_invoker = true) as
select s.id as socio_id, s.apelido, s.nome, s.cor,
       coalesce(sum(e.credito), 0)::numeric(14,2) as creditos,
       coalesce(sum(e.debito), 0)::numeric(14,2) as debitos,
       (coalesce(sum(e.credito), 0) - coalesce(sum(e.debito), 0))::numeric(14,2) as saldo
from socios s left join v_extrato_socio e on e.socio_id = s.id
where ve_valores()
group by s.id, s.apelido, s.nome, s.cor;


notify pgrst, 'reload schema';
