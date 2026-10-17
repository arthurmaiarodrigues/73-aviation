-- =====================================================================
-- schema_v35_pagador_caixa.sql — pagamento misto: alguns sócios pagaram
-- direto ao fornecedor e o restante saiu do caixa da sociedade.
-- Rodar no SQL Editor depois do v34. Idempotente.
--
-- Até aqui "vários pagadores" (v30) só aceitava sócios. A nota do óleo
-- foi paga por três sócios e o quarto pedaço saiu do saldo do caixa —
-- agora a lista de pagadores aceita uma linha do CAIXA (socio_id nulo):
--   · cada sócio da lista continua com crédito do que colocou;
--   · a parte do caixa vira saída em v_caixa (como qualquer despesa paga
--     pela sociedade);
--   · o rateio do custo não muda — segue o critério escolhido.
-- =====================================================================

-- Linha do caixa = socio_id nulo. Uma só por despesa.
alter table despesa_pagadores alter column socio_id drop not null;
create unique index if not exists despesa_pagadores_caixa_uk
  on despesa_pagadores (despesa_id) where socio_id is null;

-- ---------------------------------------------------------------------
-- Quem pagou e quanto. socio_id = 'CAIXA' (ou vazio) é o caixa.
-- A soma tem de bater com o valor da despesa. Lista vazia desfaz.
-- ---------------------------------------------------------------------
create or replace function definir_pagadores(p_despesa uuid, p_partes jsonb)
  returns void
  language plpgsql security definer set search_path = public as
$$
declare
  d despesas%rowtype;
  v_soma numeric(14,2) := 0;
  v_item jsonb;
  v_bruto text;
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
    v_bruto := coalesce(v_item->>'socio_id', '');
    v_valor := round((v_item->>'valor')::numeric, 2);
    if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor de cada pagamento.'; end if;

    if v_bruto in ('', 'CAIXA') then
      insert into despesa_pagadores (despesa_id, socio_id, valor) values (p_despesa, null, v_valor)
        on conflict (despesa_id) where socio_id is null
        do update set valor = despesa_pagadores.valor + excluded.valor;
    else
      v_socio := v_bruto::uuid;
      insert into despesa_pagadores (despesa_id, socio_id, valor) values (p_despesa, v_socio, v_valor)
        on conflict (despesa_id, socio_id) do update set valor = despesa_pagadores.valor + excluded.valor;
    end if;
    v_soma := v_soma + v_valor;
  end loop;

  if abs(v_soma - d.valor) > 0.01 then
    delete from despesa_pagadores where despesa_id = p_despesa;
    -- em português: 29280.00 vira 29280,00 (o to_char do banco usa ponto)
    raise exception 'A soma do que cada um pagou (R$ %) não bate com o valor da despesa (R$ %).',
      replace(to_char(v_soma, 'FM9999999990.00'), '.', ','), replace(to_char(d.valor, 'FM9999999990.00'), '.', ',');
  end if;

  -- Com vários pagadores não existe um pagador único nem "cada um a sua parte".
  update despesas set pagador_socio_id = null, pago_pelos_socios = false where id = p_despesa;
end $$;

-- ---------------------------------------------------------------------
-- Caixa: a despesa com lista de pagadores entra só pela parte do caixa.
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
  and not exists (select 1 from despesa_pagadores p where p.despesa_id = d.id)
union all
-- parte paga pelo caixa quando a despesa foi dividida entre pagadores
select d.data, d.descricao || ' (parte do caixa)', 0, p.valor, d.id
from despesa_pagadores p
join despesas d on d.id = p.despesa_id
where p.socio_id is null and d.deleted_at is null
  and d.tanque is distinct from 'RETIRADA'
  and d.status <> 'PENDENTE';

-- ---------------------------------------------------------------------
-- Extrato: crédito só para os pagadores que são sócios.
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
where d.deleted_at is null and p.socio_id is not null
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
