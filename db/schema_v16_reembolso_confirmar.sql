-- =====================================================================
-- schema_v16_reembolso_confirmar.sql — o admin confirma a divisão antes
-- de o reembolso entrar nas contas. Rodar depois do v15. Idempotente.
--
-- O piloto lança e a despesa fica PENDENTE: sem rateio, fora do caixa e
-- fora do extrato. O admin confere quem paga (um sócio, todos em partes
-- iguais ou conforme as horas), confirma, e só então distribui.
-- =====================================================================

-- 1. Despesa PENDENTE não distribui.
create or replace function calcular_rateio(p_despesa uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare
  d despesas%rowtype;
  v_total numeric(7,4);
  v_soma numeric(14,2);
  v_maior uuid;
begin
  select * into d from despesas where id = p_despesa;
  if not found or d.deleted_at is not null then return; end if;

  -- Aguardando o admin: nada de rateio enquanto não confirma.
  if d.status = 'PENDENTE' then
    delete from rateios where despesa_id = p_despesa;
    return;
  end if;

  if d.criterio = 'MANUAL' then
    select coalesce(sum(percentual), 0) into v_total from rateios where despesa_id = p_despesa;
    if round(v_total, 2) <> 100 then
      raise exception 'Rateio manual soma % por cento; precisa somar 100.', v_total;
    end if;
    update rateios set valor = round(d.valor * percentual / 100, 2) where despesa_id = p_despesa;
  else
    delete from rateios where despesa_id = p_despesa;

    if d.criterio = 'DIRETO' then
      insert into rateios (despesa_id, socio_id, percentual, valor)
      values (p_despesa, d.socio_direto_id, 100, d.valor);

    elsif d.criterio = 'POR_HORAS' then
      insert into rateios (despesa_id, socio_id, percentual, valor, horas_base)
      select p_despesa, h.socio_id,
             round(100 * h.horas / t.total, 4),
             round(d.valor * h.horas / t.total, 2),
             h.horas
      from horas_por_socio(d.aeronave_id,
                           coalesce(d.periodo_inicio, date_trunc('month', d.data)::date),
                           coalesce(d.periodo_fim, (date_trunc('month', d.data) + interval '1 month - 1 day')::date)) h
      cross join (select sum(horas) as total from horas_por_socio(d.aeronave_id,
                           coalesce(d.periodo_inicio, date_trunc('month', d.data)::date),
                           coalesce(d.periodo_fim, (date_trunc('month', d.data) + interval '1 month - 1 day')::date))) t
      where t.total > 0 and h.horas > 0;
    end if;

    -- IGUAL, ou POR_HORAS sem nenhuma hora no período
    if not exists (select 1 from rateios where despesa_id = p_despesa) then
      insert into rateios (despesa_id, socio_id, percentual, valor)
      select p_despesa, s.socio_id,
             round(100 * s.cota / t.total, 4),
             round(d.valor * s.cota / t.total, 2)
      from socios_ativos_em(d.data) s
      cross join (select sum(cota) as total from socios_ativos_em(d.data)) t;
    end if;
  end if;

  -- Fecha os centavos na maior parte.
  select coalesce(sum(valor), 0) into v_soma from rateios where despesa_id = p_despesa;
  if v_soma <> d.valor then
    select socio_id into v_maior from rateios where despesa_id = p_despesa order by valor desc, socio_id limit 1;
    update rateios set valor = valor + (d.valor - v_soma) where despesa_id = p_despesa and socio_id = v_maior;
  end if;

  update despesas set status = 'RATEADA' where id = p_despesa and status <> 'PENDENTE';
end $$;

-- 2. Despesa pendente também fica fora do caixa.
create or replace view v_caixa with (security_invoker = true) as
select a.data, 'APORTE ' || s.apelido as descricao, a.valor as entrada, 0::numeric(14,2) as saida, a.id as origem_id
from aportes a join socios s on s.id = a.socio_id where a.deleted_at is null
union all
select d.data, d.descricao, 0, d.valor, d.id
from despesas d
where d.deleted_at is null and d.pagador_socio_id is null
  and d.tanque is distinct from 'RETIRADA'
  and d.status <> 'PENDENTE';

-- 3. O admin confirma (e corrige, se precisar) a divisão do reembolso.
create or replace function confirmar_reembolso(
  p_despesa uuid,
  p_criterio text default null,   -- 'IGUAL' | 'POR_HORAS' | 'DIRETO' (null = mantém)
  p_socio uuid default null       -- obrigatório no DIRETO
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
                        status = 'APROVADA'
    where id = p_despesa;
  else
    -- de todos: o caixa devolve ao piloto
    update despesas set criterio = v_criterio::criterio_rateio,
                        socio_direto_id = null,
                        pagador_socio_id = null,
                        status = 'APROVADA'
    where id = p_despesa;
  end if;

  perform calcular_rateio(p_despesa);
end $$;

-- 4. O piloto lança sempre como PENDENTE.
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

notify pgrst, 'reload schema';
