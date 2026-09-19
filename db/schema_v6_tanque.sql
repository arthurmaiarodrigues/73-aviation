-- =====================================================================
-- schema_v6_tanque.sql — tanque de combustível do hangar (2.000 L).
-- Rodar no SQL Editor depois do schema_v5c. Idempotente.
--
-- Como funciona:
--   COMPRA    — combustível que entra no tanque. Vira despesa COMBUSTÍVEL
--               SEM rateio (`despesas.tanque = 'COMPRA'`): quem pagou (caixa
--               ou sócio) fica com o crédito; o custo é cobrado nas retiradas.
--   RETIRADA  — litros que saem do tanque para o avião, em nome de um sócio
--               (ou da sociedade). Vira um `abastecimentos` de origem TANQUE
--               valorado pelo preço médio das compras até aquela data, e a
--               despesa correspondente é paga "pelo tanque": DIRETO ao sócio
--               (débito no extrato) ou IGUAL quando é da sociedade. Não sai do
--               caixa de novo (o caixa já pagou na compra).
--   AJUSTE    — acerto de medição (régua): só mexe nos litros do estoque.
-- Os litros retirados entram no saldo de combustível do sócio como
-- "abastecidos", igual a um abastecimento pago no posto.
-- =====================================================================

alter table aeronaves add column if not exists tanque_hangar_l numeric(8,1) not null default 2000;

alter table despesas add column if not exists tanque text check (tanque in ('COMPRA', 'RETIRADA'));
alter table abastecimentos add column if not exists origem text not null default 'POSTO' check (origem in ('POSTO', 'TANQUE'));

create table if not exists tanque_movimentos (
  id                uuid primary key default gen_random_uuid(),
  aeronave_id       uuid not null references aeronaves(id),
  data              date not null,
  tipo              text not null check (tipo in ('COMPRA', 'RETIRADA', 'AJUSTE')),
  litros            numeric(8,1) not null,
  valor             numeric(14,2),                 -- COMPRA: total pago
  preco_litro       numeric(10,4),                 -- RETIRADA: preço médio na data
  -- COMPRA: quem pagou (null = caixa). RETIRADA: sócio responsável (null = sociedade)
  socio_id          uuid references socios(id),
  fornecedor_id     uuid references fornecedores(id),
  comprovante_path  text,
  voo_id            uuid references voos(id),
  abastecimento_id  uuid unique references abastecimentos(id),
  despesa_id        uuid unique references despesas(id),
  observacao        text,
  autor_id          uuid references usuarios(id),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  deleted_by        uuid references usuarios(id),
  constraint tanque_litros check (tipo = 'AJUSTE' or litros > 0),
  constraint tanque_valor check (tipo <> 'COMPRA' or valor >= 0)
);
create index if not exists tanque_movimentos_data_idx on tanque_movimentos (aeronave_id, data) where deleted_at is null;

drop trigger if exists tanque_movimentos_mes_fechado on tanque_movimentos;
create trigger tanque_movimentos_mes_fechado before insert or update on tanque_movimentos for each row execute function barrar_mes_fechado();

-- Preço médio das compras até a data (R$/L).
create or replace function preco_tanque_em(p_aeronave uuid, p_data date) returns numeric
  language sql stable security invoker as
$$
  select round(sum(valor) / nullif(sum(litros), 0), 4)
  from tanque_movimentos
  where aeronave_id = p_aeronave and tipo = 'COMPRA' and deleted_at is null and data <= p_data
$$;

-- ---------------------------------------------------------------------
-- Movimento do tanque → despesa (COMPRA) ou abastecimento (RETIRADA)
-- ---------------------------------------------------------------------
create or replace function tanque_movimento_refletir() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare v_cat int; v_desc text; v_base text; v_preco numeric(10,4);
begin
  select id into v_cat from categorias_despesa where nome = 'COMBUSTÍVEL';
  select coalesce(base_icao, 'SNTF') into v_base from aeronaves where id = new.aeronave_id;

  if new.deleted_at is not null then
    if new.despesa_id is not null then
      update despesas set deleted_at = new.deleted_at, deleted_by = new.deleted_by where id = new.despesa_id;
    end if;
    if new.abastecimento_id is not null then
      update abastecimentos set deleted_at = new.deleted_at, deleted_by = new.deleted_by where id = new.abastecimento_id;
    end if;
    return new;
  end if;

  if new.tipo = 'COMPRA' then
    new.preco_litro := case when new.litros > 0 then round(new.valor / new.litros, 4) end;
    v_desc := 'COMPRA DE COMBUSTÍVEL PARA O TANQUE — ' || new.litros || ' L';
    if new.despesa_id is null then
      insert into despesas (aeronave_id, data, descricao, fornecedor_id, categoria_id, valor, comprovante_path, pagador_socio_id,
                            criterio, tanque, autor_id)
      values (new.aeronave_id, new.data, v_desc, new.fornecedor_id, v_cat, new.valor, new.comprovante_path, new.socio_id,
              'IGUAL', 'COMPRA', new.autor_id)
      returning id into new.despesa_id;
    else
      update despesas set data = new.data, descricao = v_desc, fornecedor_id = new.fornecedor_id, valor = new.valor,
        comprovante_path = new.comprovante_path, pagador_socio_id = new.socio_id, deleted_at = null
      where id = new.despesa_id;
    end if;

  elsif new.tipo = 'RETIRADA' then
    v_preco := preco_tanque_em(new.aeronave_id, new.data);
    if v_preco is null then
      raise exception 'Registre a compra do combustível do tanque (com data até %) antes da retirada.', to_char(new.data, 'DD/MM/YYYY');
    end if;
    new.preco_litro := v_preco;
    new.valor := round(new.litros * v_preco, 2);
    if new.abastecimento_id is null then
      insert into abastecimentos (aeronave_id, data, aerodromo, litros, valor, pagador_socio_id, voo_id, observacao, origem, autor_id)
      values (new.aeronave_id, new.data, v_base, new.litros, new.valor, new.socio_id, new.voo_id,
              coalesce(new.observacao, 'DO TANQUE DO HANGAR'), 'TANQUE', new.autor_id)
      returning id into new.abastecimento_id;
    else
      update abastecimentos set data = new.data, litros = new.litros, valor = new.valor, pagador_socio_id = new.socio_id,
        voo_id = new.voo_id, observacao = coalesce(new.observacao, 'DO TANQUE DO HANGAR'), deleted_at = null
      where id = new.abastecimento_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tanque_movimentos_refletir on tanque_movimentos;
create trigger tanque_movimentos_refletir before insert or update on tanque_movimentos
  for each row execute function tanque_movimento_refletir();

-- Compra nova (ou alterada) muda o preço médio: reprecifica as retiradas dali em diante.
create or replace function tanque_reprecificar() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  if new.tipo = 'COMPRA' then
    update tanque_movimentos set valor = valor
    where aeronave_id = new.aeronave_id and tipo = 'RETIRADA' and deleted_at is null and data >= new.data;
  end if;
  return null;
end $$;
drop trigger if exists tanque_movimentos_reprecificar on tanque_movimentos;
create trigger tanque_movimentos_reprecificar after insert or update of valor, litros, data, deleted_at on tanque_movimentos
  for each row execute function tanque_reprecificar();

-- ---------------------------------------------------------------------
-- Abastecimento de origem TANQUE: a despesa é "paga pelo tanque"
-- (pagador = caixa), DIRETO ao sócio ou IGUAL quando é da sociedade.
-- ---------------------------------------------------------------------
create or replace function abastecimento_gerar_despesa() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare v_cat int; v_desc text; v_pagador uuid; v_criterio criterio_rateio; v_tanque text;
begin
  select id into v_cat from categorias_despesa where nome = 'COMBUSTÍVEL';
  v_desc := 'ABASTECIMENTO ' || new.litros || ' L' || case when new.origem = 'TANQUE' then ' DO TANQUE DO HANGAR' else coalesce(' EM ' || new.aerodromo, '') end;

  if new.deleted_at is not null then
    if new.despesa_id is not null then
      update despesas set deleted_at = new.deleted_at, deleted_by = new.deleted_by where id = new.despesa_id;
    end if;
    return new;
  end if;

  if new.origem = 'TANQUE' then
    v_pagador := null; v_tanque := 'RETIRADA';
    v_criterio := case when new.pagador_socio_id is null then 'IGUAL' else 'DIRETO' end;
  else
    v_pagador := new.pagador_socio_id; v_tanque := null;
    v_criterio := case when new.pagador_socio_id is null then 'IGUAL' else 'DIRETO' end;
  end if;

  if new.despesa_id is null then
    insert into despesas (aeronave_id, data, descricao, categoria_id, valor, comprovante_path, pagador_socio_id,
                          criterio, socio_direto_id, voo_id, tanque, autor_id)
    values (new.aeronave_id, new.data, v_desc, v_cat, new.valor, new.comprovante_path, v_pagador,
            v_criterio, new.pagador_socio_id, new.voo_id, v_tanque, new.autor_id)
    returning id into new.despesa_id;
  else
    update despesas set
      data = new.data, descricao = v_desc, valor = new.valor, comprovante_path = new.comprovante_path,
      pagador_socio_id = v_pagador, criterio = v_criterio, socio_direto_id = new.pagador_socio_id,
      voo_id = new.voo_id, tanque = v_tanque, deleted_at = null
    where id = new.despesa_id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Rateio: compra para o tanque não rateia (o custo entra pelas retiradas).
-- ---------------------------------------------------------------------
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

  if d.pago_pelo_fundo or d.tanque = 'COMPRA' then
    delete from rateios where despesa_id = p_despesa;
    update despesas set status = 'RATEADA' where id = p_despesa and status <> 'PENDENTE';
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

    if not exists (select 1 from rateios where despesa_id = p_despesa) then
      insert into rateios (despesa_id, socio_id, percentual, valor)
      select p_despesa, s.socio_id,
             round(100 * s.cota / t.total, 4),
             round(d.valor * s.cota / t.total, 2)
      from socios_ativos_em(d.data) s
      cross join (select sum(cota) as total from socios_ativos_em(d.data)) t;
    end if;
  end if;

  select coalesce(sum(valor), 0) into v_soma from rateios where despesa_id = p_despesa;
  if v_soma <> d.valor then
    select socio_id into v_maior from rateios where despesa_id = p_despesa order by valor desc, socio_id limit 1;
    update rateios set valor = valor + (d.valor - v_soma) where despesa_id = p_despesa and socio_id = v_maior;
  end if;

  update despesas set status = 'RATEADA' where id = p_despesa and status <> 'PENDENTE';
end $$;

drop trigger if exists despesas_ratear on despesas;
create trigger despesas_ratear after insert or update of valor, criterio, socio_direto_id, periodo_inicio, periodo_fim, data, deleted_at, pago_pelo_fundo, tanque
  on despesas for each row execute function despesas_ratear();

-- ---------------------------------------------------------------------
-- Caixa: retirada do tanque não é saída de dinheiro (a compra já foi).
-- ---------------------------------------------------------------------
create or replace view v_caixa with (security_invoker = true) as
select a.data, 'APORTE ' || s.apelido as descricao, a.valor as entrada, 0::numeric(14,2) as saida, a.id as origem_id
from aportes a join socios s on s.id = a.socio_id where a.deleted_at is null
union all
select d.data, d.descricao, 0, d.valor, d.id
from despesas d where d.deleted_at is null and d.pagador_socio_id is null and d.tanque is distinct from 'RETIRADA';

-- ---------------------------------------------------------------------
-- Saldo de combustível: abastecimento pago pelo caixa (ou retirada da
-- sociedade) conta os litros divididos entre os sócios — senão o consumo
-- do voo da sociedade cobraria duas vezes.
-- ---------------------------------------------------------------------
create or replace view v_combustivel_socio_mes with (security_invoker = true) as
with consumo as (
  select aeronave_id, socio_id, date_trunc('month', data)::date as mes,
         sum(litros) as litros_consumidos, bool_or(litros_estimados) as tem_estimativa
  from v_voo_socio group by 1, 2, 3
), abastecido_base as (
  select a.aeronave_id, a.pagador_socio_id as socio_id, date_trunc('month', a.data)::date as mes, a.litros
  from abastecimentos a where a.deleted_at is null and a.pagador_socio_id is not null
  union all
  select a.aeronave_id, s.socio_id, date_trunc('month', a.data)::date, round(a.litros / n.qt, 1)
  from abastecimentos a
  cross join lateral (select count(*) as qt from socios_ativos_em(a.data)) n
  cross join lateral socios_ativos_em(a.data) s
  where a.deleted_at is null and a.pagador_socio_id is null and n.qt > 0
), abastecido as (
  select aeronave_id, socio_id, mes, sum(litros) as litros_abastecidos from abastecido_base group by 1, 2, 3
)
select
  coalesce(c.aeronave_id, a.aeronave_id) as aeronave_id,
  coalesce(c.socio_id, a.socio_id) as socio_id,
  coalesce(c.mes, a.mes) as mes,
  coalesce(a.litros_abastecidos, 0) as litros_abastecidos,
  coalesce(c.litros_consumidos, 0) as litros_consumidos,
  coalesce(a.litros_abastecidos, 0) - coalesce(c.litros_consumidos, 0) as saldo_litros,
  coalesce(c.tem_estimativa, false) as tem_estimativa,
  preco_combustivel_em(coalesce(c.aeronave_id, a.aeronave_id), coalesce(c.mes, a.mes)) as preco_litro,
  round((coalesce(a.litros_abastecidos, 0) - coalesce(c.litros_consumidos, 0))
        * coalesce(preco_combustivel_em(coalesce(c.aeronave_id, a.aeronave_id), coalesce(c.mes, a.mes)), 0), 2) as valor
from consumo c
full join abastecido a on a.aeronave_id = c.aeronave_id and a.socio_id = c.socio_id and a.mes = c.mes;

-- ---------------------------------------------------------------------
-- Views do tanque
-- ---------------------------------------------------------------------
create or replace view v_tanque_movimentos with (security_invoker = true) as
select m.id, m.aeronave_id, m.data, m.tipo, m.litros, m.valor, m.preco_litro, m.socio_id, s.apelido as socio,
       f.nome as fornecedor, m.comprovante_path, m.voo_id, m.observacao, m.created_at,
       sum(case m.tipo when 'RETIRADA' then -m.litros else m.litros end)
         over (partition by m.aeronave_id order by m.data, m.created_at rows unbounded preceding) as saldo_litros
from tanque_movimentos m
left join socios s on s.id = m.socio_id
left join fornecedores f on f.id = m.fornecedor_id
where m.deleted_at is null;

create or replace view v_tanque_saldo with (security_invoker = true) as
select a.id as aeronave_id, a.tanque_hangar_l as capacidade_l,
       coalesce(sum(case m.tipo when 'RETIRADA' then -m.litros else m.litros end), 0)::numeric(8,1) as litros,
       preco_tanque_em(a.id, current_date) as preco_litro,
       round(coalesce(sum(case m.tipo when 'RETIRADA' then -m.litros else m.litros end), 0) * coalesce(preco_tanque_em(a.id, current_date), 0), 2) as valor_estoque,
       max(m.data) filter (where m.tipo = 'COMPRA') as ultima_compra,
       max(m.data) filter (where m.tipo = 'AJUSTE') as ultima_medicao
from aeronaves a
left join tanque_movimentos m on m.aeronave_id = a.id and m.deleted_at is null
group by a.id, a.tanque_hangar_l;

-- Litros retirados por sócio e mês (a parte da sociedade dividida).
create or replace view v_tanque_socio_mes with (security_invoker = true) as
with base as (
  select m.aeronave_id, m.socio_id, date_trunc('month', m.data)::date as mes, m.litros, m.valor
  from tanque_movimentos m where m.tipo = 'RETIRADA' and m.deleted_at is null and m.socio_id is not null
  union all
  select m.aeronave_id, s.socio_id, date_trunc('month', m.data)::date, round(m.litros / n.qt, 1), round(m.valor / n.qt, 2)
  from tanque_movimentos m
  cross join lateral (select count(*) as qt from socios_ativos_em(m.data)) n
  cross join lateral socios_ativos_em(m.data) s
  where m.tipo = 'RETIRADA' and m.deleted_at is null and m.socio_id is null and n.qt > 0
)
select b.aeronave_id, b.socio_id, so.apelido, so.cor, b.mes, sum(b.litros)::numeric(8,1) as litros, sum(b.valor)::numeric(14,2) as valor
from base b join socios so on so.id = b.socio_id
group by 1, 2, 3, 4, 5;

-- ---------------------------------------------------------------------
-- RLS: quem vê valores lê e lança; altera o próprio; admin tudo.
-- ---------------------------------------------------------------------
alter table tanque_movimentos enable row level security;
drop policy if exists tanque_ler on tanque_movimentos;
create policy tanque_ler on tanque_movimentos for select using (ve_valores());
drop policy if exists tanque_lancar on tanque_movimentos;
create policy tanque_lancar on tanque_movimentos for insert with check (ve_valores() and autor_id = auth.uid());
drop policy if exists tanque_proprio on tanque_movimentos;
create policy tanque_proprio on tanque_movimentos for update using (autor_id = auth.uid() or sou_admin()) with check (autor_id = auth.uid() or sou_admin());

notify pgrst, 'reload schema';
