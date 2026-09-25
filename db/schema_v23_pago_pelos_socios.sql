-- =====================================================================
-- schema_v23_pago_pelos_socios.sql — despesa que cada sócio pagou direto.
-- Rodar no SQL Editor depois do v22b. Idempotente.
--
-- Tem gasto em que cada sócio paga a sua parte direto ao fornecedor (ou ao
-- piloto, no reembolso). Nesse caso o dinheiro não passa pelo caixa e
-- ninguém deve nada à sociedade: a despesa continua no custo por sócio,
-- mas sai do caixa e sai do extrato (não vira débito de rateio).
--   despesas.pago_pelos_socios = true
-- =====================================================================

alter table despesas add column if not exists pago_pelos_socios boolean not null default false;

-- Reembolso ao piloto dividido entre todos: quem paga é cada sócio, no PIX.
update despesas
set pago_pelos_socios = true
where reembolso_piloto_id is not null
  and criterio in ('IGUAL', 'POR_HORAS')
  and pagador_socio_id is null
  and deleted_at is null
  and pago_pelos_socios = false;

-- ---------------------------------------------------------------------
-- Caixa: o que os sócios pagaram direto nunca saiu do caixa.
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
  and not d.pago_pelos_socios;

-- ---------------------------------------------------------------------
-- Extrato: rateio de despesa paga direto pelos sócios não é débito —
-- cada um já pagou a parte dele do próprio bolso.
-- ---------------------------------------------------------------------
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

-- O piloto lança reembolso já marcado como pago pelos sócios.
drop policy if exists despesas_piloto_lancar on despesas;
create policy despesas_piloto_lancar on despesas for insert
  with check (
    meu_perfil() = 'piloto' and autor_id = auth.uid() and reembolso_piloto_id = meu_piloto_id()
    and status = 'PENDENTE'
    and (
      (criterio = 'DIRETO' and socio_direto_id is not null and pagador_socio_id = socio_direto_id)
      or (criterio in ('IGUAL', 'POR_HORAS') and socio_direto_id is null and pagador_socio_id is null)
    )
  );

-- Confirmar reembolso de todos = cada sócio paga o piloto direto.
create or replace function confirmar_reembolso(
  p_despesa uuid,
  p_criterio text default null,
  p_socio uuid default null
) returns void
  language plpgsql security definer set search_path = public as
$$
declare d despesas%rowtype; v_criterio text;
begin
  if not sou_admin() then raise exception 'Só o administrador confirma o reembolso.'; end if;
  select * into d from despesas where id = p_despesa and deleted_at is null and reembolso_piloto_id is not null;
  if not found then raise exception 'Reembolso não encontrado.'; end if;

  v_criterio := coalesce(p_criterio, d.criterio::text);
  if v_criterio not in ('IGUAL', 'POR_HORAS', 'DIRETO') then
    raise exception 'Divisão inválida: %.', v_criterio;
  end if;
  if v_criterio = 'DIRETO' and coalesce(p_socio, d.socio_direto_id) is null then
    raise exception 'No reembolso de um sócio só, escolha o sócio.';
  end if;

  if v_criterio = 'DIRETO' then
    update despesas set criterio = 'DIRETO',
                        socio_direto_id = coalesce(p_socio, socio_direto_id),
                        pagador_socio_id = coalesce(p_socio, socio_direto_id),
                        pago_pelos_socios = false,
                        status = 'APROVADA'
    where id = p_despesa;
  else
    update despesas set criterio = v_criterio::criterio_rateio,
                        socio_direto_id = null,
                        pagador_socio_id = null,
                        pago_pelos_socios = true,
                        status = 'APROVADA'
    where id = p_despesa;
  end if;

  perform calcular_rateio(p_despesa);
end $$;

notify pgrst, 'reload schema';
