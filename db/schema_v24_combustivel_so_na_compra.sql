-- =====================================================================
-- schema_v24_combustivel_so_na_compra.sql — combustível cobrado uma vez.
-- Rodar no SQL Editor depois do v23. Idempotente.
--
-- Havia cobrança dupla: o sócio pagava a sua parte na COMPRA do tanque e
-- ainda levava, no extrato, o débito do saldo de litros (consumido menos
-- abastecido). Como o app controla a retirada de cada um, o combustível
-- do tanque é pago UMA VEZ, na compra seguinte, rateada pelos litros que
-- cada sócio retirou desde a compra anterior.
--
-- O saldo de litros por sócio continua calculado (tela Combustível e
-- relatórios), só não vira dinheiro no extrato.
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
  and not d.pago_pelos_socios
union all
-- fundo de reserva do mês
select f.socio_id, f.mes, 'FUNDO', f.descricao, 0, f.valor, f.id, 'fundo_reserva_movimentos'
from fundo_reserva_movimentos f where f.tipo = 'ENTRADA' and f.socio_id is not null;
-- (o saldo de litros não entra mais: o combustível é pago na compra do tanque,
--  rateada pelos litros retirados por cada sócio desde a compra anterior)

notify pgrst, 'reload schema';
