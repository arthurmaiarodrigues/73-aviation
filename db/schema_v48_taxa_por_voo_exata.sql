-- =====================================================================
-- schema_v48_taxa_por_voo_exata.sql — item de voo da sociedade divide
-- igual de verdade. Rodar no SQL Editor depois do v47. Idempotente.
--
-- O v47 repartia o item pelas horas de `v_voo_socio`, que arredonda cada
-- parte em décimos (para o total de horas fechar). Em voo curto isso
-- distorce o dinheiro: no voo de teste de 0,3 h a parte de cada um vira
-- 0,1 / 0,1 / 0,1 / 0,0 e um sócio não paga nada da taxa. Agora o item
-- usa frações exatas (`partes_do_voo`):
--   voo de um sócio           → 100% dele
--   voo da sociedade          → pela cota (25% cada)
--   voo dividido              → horas de cada um / horas da divisão;
--                               a parte "sociedade" da divisão, pela cota
-- As horas por sócio (uso, fundo, revisão) não mudam: continuam em
-- `v_voo_socio`.
-- =====================================================================

create or replace function partes_do_voo(p_voo uuid)
  returns table (socio_id uuid, fracao numeric)
  language sql stable security definer set search_path = public as
$$
  with v as (
    select id, data, socio_id from voos where id = p_voo and deleted_at is null
  ),
  dv as (
    select d.socio_id, d.horas from voo_socios d join v on d.voo_id = v.id where d.horas > 0
  ),
  tot as (select sum(horas) as t from dv),
  ativos as (
    select s.socio_id, s.cota, sum(s.cota) over () as total
    from v cross join socios_ativos_em(v.data) s
  )
  select x.socio_id, sum(x.fracao)
  from (
    -- voo de um sócio
    select v.socio_id, 1::numeric as fracao
    from v where v.socio_id is not null and not exists (select 1 from dv)
    union all
    -- voo da sociedade: pela cota
    select a.socio_id, a.cota / a.total
    from v cross join ativos a where v.socio_id is null and not exists (select 1 from dv)
    union all
    -- voo dividido: parte de cada sócio
    select dv.socio_id, dv.horas / tot.t
    from dv cross join tot where dv.socio_id is not null and tot.t > 0
    union all
    -- voo dividido: parte da sociedade, pela cota
    select a.socio_id, dv.horas / tot.t * a.cota / a.total
    from dv cross join tot cross join ativos a where dv.socio_id is null and tot.t > 0
  ) x
  group by x.socio_id
$$;

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
  v_voos numeric(14,2) := 0;
  v_resto numeric(14,2);
begin
  select * into d from despesas where id = p_despesa;
  if not found or d.deleted_at is not null then return; end if;

  -- Aguardando conferência (lançamentos antigos do piloto): sem rateio.
  if d.status = 'PENDENTE' then
    delete from rateios where despesa_id = p_despesa;
    return;
  end if;

  -- Pago pelo fundo de reserva: não é de ninguém (schema_v3).
  if d.pago_pelo_fundo then
    delete from rateios where despesa_id = p_despesa;
    update despesas set status = 'RATEADA' where id = p_despesa;
    return;
  end if;

  if d.criterio = 'MANUAL' then
    select coalesce(sum(percentual), 0) into v_total from rateios where despesa_id = p_despesa;
    if round(v_total, 2) <> 100 then
      raise exception 'Rateio manual soma % por cento; precisa somar 100.', v_total;
    end if;
    update rateios set valor = round(d.valor * percentual / 100, 2) where despesa_id = p_despesa;

  elsif d.tanque = 'COMPRA' then
    -- Compra do tanque: pelos litros retirados desde a compra anterior (schema_v9).
    delete from rateios where despesa_id = p_despesa;
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
    -- primeira compra (estoque inicial): igual
    if not exists (select 1 from rateios where despesa_id = p_despesa) then
      insert into rateios (despesa_id, socio_id, percentual, valor)
      select p_despesa, s.socio_id, round(100 * s.cota / t.total, 4), round(d.valor * s.cota / t.total, 2)
      from socios_ativos_em(d.data) s
      cross join (select sum(cota) as total from socios_ativos_em(d.data)) t;
    end if;

  else
    delete from rateios where despesa_id = p_despesa;

    -- Itens ligados a um voo (itens_de_voo); o resto segue o critério.
    select coalesce(sum(valor), 0) into v_voos from itens_de_voo(p_despesa);
    if v_voos > d.valor then v_voos := d.valor; end if;
    v_resto := d.valor - v_voos;

    if v_resto > 0 then
      if d.criterio = 'DIRETO' then
        insert into rateios (despesa_id, socio_id, percentual, valor)
        values (p_despesa, d.socio_direto_id, 0, v_resto);

      elsif d.criterio = 'POR_HORAS' then
        insert into rateios (despesa_id, socio_id, percentual, valor, horas_base)
        select p_despesa, h.socio_id, 0, round(v_resto * h.horas / t.total, 2), h.horas
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
        select p_despesa, s.socio_id, 0, round(v_resto * s.cota / t.total, 2)
        from socios_ativos_em(d.data) s
        cross join (select sum(cota) as total from socios_ativos_em(d.data)) t;
      end if;
    end if;

    -- Cada item de voo vai para quem estava no voo, em frações exatas (partes_do_voo).
    if v_voos > 0 then
      insert into rateios (despesa_id, socio_id, percentual, valor)
      select p_despesa, p.socio_id, 0, round(p.valor, 2)
      from (
        select pv.socio_id, sum(it.valor * pv.fracao) as valor
        from itens_de_voo(p_despesa) it
        cross join lateral partes_do_voo(it.voo_id) pv
        group by pv.socio_id
      ) p
      where p.valor > 0
      on conflict (despesa_id, socio_id) do update set valor = rateios.valor + excluded.valor;
    end if;

    -- percentual = a parte de cada um no total
    if d.valor > 0 then
      update rateios set percentual = least(100, round(100 * valor / d.valor, 4))
      where despesa_id = p_despesa;
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

-- Refaz as despesas que têm item ligado a voo (mês aberto).
select calcular_rateio(d.id)
from despesas d
where d.deleted_at is null
  and exists (select 1 from jsonb_array_elements(coalesce(d.itens, '[]'::jsonb)) i where i ? 'voo_id')
  and not mes_fechado(d.aeronave_id, d.data);

notify pgrst, 'reload schema';
