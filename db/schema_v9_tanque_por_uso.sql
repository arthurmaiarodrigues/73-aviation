-- =====================================================================
-- schema_v9_tanque_por_uso.sql — combustível do hangar pago por uso
-- (Arthur, 19/09/2026). Rodar no SQL Editor depois do schema_v8. Idempotente.
--
-- Modelo:
--   · RETIRADA do tanque NÃO gera despesa nem débito: só registra os litros
--     de cada sócio (uso). Continua contando como "abastecido" por ele no
--     saldo de combustível (regra do tanque cheio).
--   · COMPRA para o tanque é a despesa. A primeira (estoque inicial) é
--     dividida igual. Cada compra seguinte é rateada POR LITROS: a parte de
--     cada sócio nas retiradas feitas desde a compra anterior (as retiradas
--     da sociedade divididas em partes iguais). Sem retirada no período →
--     igual.
--   · Nova retirada recalcula o rateio da compra seguinte, se já existir.
-- =====================================================================

alter table rateios add column if not exists litros_base numeric(8,1);

-- ---------------------------------------------------------------------
-- Abastecimento de origem TANQUE: sem despesa (a despesa é a compra).
-- ---------------------------------------------------------------------
create or replace function abastecimento_gerar_despesa() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare v_cat int; v_desc text;
begin
  if new.origem = 'TANQUE' then
    -- retirada do tanque: só litros; a despesa antiga (se houver) sai de cena
    if new.despesa_id is not null then
      update despesas set deleted_at = coalesce(new.deleted_at, now()), deleted_by = coalesce(new.deleted_by, new.autor_id) where id = new.despesa_id;
      new.despesa_id := null;
    end if;
    return new;
  end if;

  select id into v_cat from categorias_despesa where nome = 'COMBUSTÍVEL';
  v_desc := 'ABASTECIMENTO ' || new.litros || ' L' || coalesce(' EM ' || new.aerodromo, '');

  if new.deleted_at is not null then
    if new.despesa_id is not null then
      update despesas set deleted_at = new.deleted_at, deleted_by = new.deleted_by where id = new.despesa_id;
    end if;
    return new;
  end if;

  if new.despesa_id is null then
    insert into despesas (aeronave_id, data, descricao, categoria_id, valor, comprovante_path, pagador_socio_id,
                          criterio, socio_direto_id, voo_id, autor_id)
    values (new.aeronave_id, new.data, v_desc, v_cat, new.valor, new.comprovante_path, new.pagador_socio_id,
            case when new.pagador_socio_id is null then 'IGUAL' else 'DIRETO' end::criterio_rateio,
            new.pagador_socio_id, new.voo_id, new.autor_id)
    returning id into new.despesa_id;
  else
    update despesas set
      data = new.data, descricao = v_desc, valor = new.valor, comprovante_path = new.comprovante_path,
      pagador_socio_id = new.pagador_socio_id,
      criterio = case when new.pagador_socio_id is null then 'IGUAL' else 'DIRETO' end::criterio_rateio,
      socio_direto_id = new.pagador_socio_id, voo_id = new.voo_id, deleted_at = null
    where id = new.despesa_id;
  end if;
  return new;
end $$;

-- Retiradas já lançadas: apaga a despesa (mantém os litros).
update abastecimentos a set despesa_id = null
from despesas d
where d.id = a.despesa_id and a.origem = 'TANQUE';
update despesas set deleted_at = now() where tanque = 'RETIRADA' and deleted_at is null;

-- ---------------------------------------------------------------------
-- Litros retirados por sócio entre duas datas (sociedade dividida).
-- ---------------------------------------------------------------------
create or replace function litros_tanque_por_socio(p_aeronave uuid, p_depois_de date, p_ate date)
  returns table (socio_id uuid, litros numeric)
  language sql stable as
$$
  with base as (
    select m.socio_id, m.litros
    from tanque_movimentos m
    where m.aeronave_id = p_aeronave and m.tipo = 'RETIRADA' and m.deleted_at is null
      and m.socio_id is not null and (p_depois_de is null or m.data > p_depois_de) and m.data <= p_ate
    union all
    select s.socio_id, round(m.litros / n.qt, 1)
    from tanque_movimentos m
    cross join lateral (select count(*) as qt from socios_ativos_em(m.data)) n
    cross join lateral socios_ativos_em(m.data) s
    where m.aeronave_id = p_aeronave and m.tipo = 'RETIRADA' and m.deleted_at is null
      and m.socio_id is null and n.qt > 0 and (p_depois_de is null or m.data > p_depois_de) and m.data <= p_ate
  )
  select socio_id, sum(litros) from base group by socio_id
$$;

-- Data da compra anterior a uma compra (ou null se é a primeira).
create or replace function compra_anterior(p_despesa uuid) returns date
  language sql stable as
$$
  select max(m2.data)
  from tanque_movimentos m join tanque_movimentos m2 on m2.aeronave_id = m.aeronave_id
  where m.despesa_id = p_despesa and m2.tipo = 'COMPRA' and m2.deleted_at is null
    and (m2.data < m.data or (m2.data = m.data and m2.created_at < m.created_at))
$$;

-- ---------------------------------------------------------------------
-- Rateio: compra do tanque = POR LITROS desde a compra anterior.
-- ---------------------------------------------------------------------
create or replace function calcular_rateio(p_despesa uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare
  d despesas%rowtype;
  v_total numeric(7,4);
  v_soma numeric(14,2);
  v_maior uuid;
  v_ant date;
  v_data date;
begin
  select * into d from despesas where id = p_despesa;
  if not found or d.deleted_at is not null then return; end if;

  if d.pago_pelo_fundo then
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

    if d.tanque = 'COMPRA' then
      v_ant := compra_anterior(p_despesa);
      select m.data into v_data from tanque_movimentos m where m.despesa_id = p_despesa;
      insert into rateios (despesa_id, socio_id, percentual, valor, litros_base)
      select p_despesa, l.socio_id,
             round(100 * l.litros / t.total, 4),
             round(d.valor * l.litros / t.total, 2),
             l.litros
      from litros_tanque_por_socio(d.aeronave_id, v_ant, coalesce(v_data, d.data)) l
      cross join (select sum(litros) as total from litros_tanque_por_socio(d.aeronave_id, v_ant, coalesce(v_data, d.data))) t
      where t.total > 0 and l.litros > 0;

    elsif d.criterio = 'DIRETO' then
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

    -- IGUAL; POR_HORAS sem hora; compra do tanque sem retirada no período (estoque inicial)
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

-- ---------------------------------------------------------------------
-- Retirada nova/alterada: reprecifica e recalcula o rateio das compras.
-- ---------------------------------------------------------------------
create or replace function tanque_reprecificar() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare c record;
begin
  if new.tipo = 'COMPRA' then
    update tanque_movimentos set valor = valor
    where aeronave_id = new.aeronave_id and tipo = 'RETIRADA' and deleted_at is null and data >= new.data;
  end if;
  -- toda compra com data >= esta retirada/compra tem o rateio refeito
  for c in select despesa_id from tanque_movimentos where aeronave_id = new.aeronave_id and tipo = 'COMPRA' and deleted_at is null and despesa_id is not null and data >= new.data loop
    perform calcular_rateio(c.despesa_id);
  end loop;
  return null;
end $$;

-- Recalcula as compras já lançadas com a regra nova.
do $$
declare c record;
begin
  for c in select despesa_id from tanque_movimentos where tipo = 'COMPRA' and deleted_at is null and despesa_id is not null loop
    perform calcular_rateio(c.despesa_id);
  end loop;
end $$;

notify pgrst, 'reload schema';
