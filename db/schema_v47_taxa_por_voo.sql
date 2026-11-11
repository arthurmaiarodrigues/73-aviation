-- =====================================================================
-- schema_v47_taxa_por_voo.sql — cada linha da nota pode ser cobrada de
-- quem estava no voo. Rodar no SQL Editor depois do v46. Idempotente.
--
-- A fatura do DECEA traz uma linha por voo (PAN, PAT ADR, PAT APP). Até
-- aqui a fatura inteira seguia um rateio só (igual, por horas…). Agora
-- cada item de `despesas.itens` pode ter `voo_id`: o valor daquele item
-- vai para o sócio do voo — e, no voo da sociedade ou dividido, para a
-- parte de cada um nas horas do voo (`v_voo_socio`). O que sobra (itens
-- sem voo) segue o critério escolhido na despesa.
--
-- De carona, restaura em `calcular_rateio` duas regras que o v16 apagou
-- sem querer ao reescrever a função: despesa paga pelo fundo de reserva
-- não rateia, e compra do tanque divide pelos litros retirados desde a
-- compra anterior (schema_v9). Até hoje só houve uma compra do tanque —
-- a primeira, que é igual de qualquer jeito —, então nada saiu errado.
-- =====================================================================

-- Itens da despesa ligados a um voo que existe e tem horas, já com o
-- desconto da nota na proporção. Voo apagado ou ainda em aberto fica de
-- fora: o item segue o rateio da despesa até o voo fechar.
create or replace function itens_de_voo(p_despesa uuid)
  returns table (voo_id uuid, valor numeric)
  language sql stable security definer set search_path = public as
$$
  select (i->>'voo_id')::uuid,
         round((i->>'valor')::numeric
               * case when coalesce(d.desconto, 0) > 0 and d.valor + d.desconto > 0
                      then d.valor / (d.valor + d.desconto) else 1 end, 2)
  from despesas d
  cross join lateral jsonb_array_elements(coalesce(d.itens, '[]'::jsonb)) i
  where d.id = p_despesa
    and coalesce(i->>'voo_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and jsonb_typeof(i->'valor') = 'number'
    and exists (select 1 from v_voo_socio x
                where x.voo_id = (i->>'voo_id')::uuid and x.aeronave_id = d.aeronave_id and x.horas > 0)
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

    -- Cada item de voo vai para quem estava no voo, pela parte de cada um nas horas.
    if v_voos > 0 then
      insert into rateios (despesa_id, socio_id, percentual, valor)
      select p_despesa, p.socio_id, 0, round(p.valor, 2)
      from (
        select vs.socio_id, sum(it.valor * vs.horas / vs.total) as valor
        from itens_de_voo(p_despesa) it
        join (select x.voo_id, x.socio_id, x.horas, sum(x.horas) over (partition by x.voo_id) as total
              from v_voo_socio x where x.horas > 0) vs on vs.voo_id = it.voo_id
        group by vs.socio_id
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

-- Mudar os itens (ligar ou desligar um voo) recalcula o rateio.
drop trigger if exists despesas_ratear on despesas;
create trigger despesas_ratear after insert or update of valor, criterio, socio_direto_id, periodo_inicio, periodo_fim, data, deleted_at, pago_pelo_fundo, tanque, itens, desconto
  on despesas for each row execute function despesas_ratear();

-- Despesas com item ligado a este voo (mês aberto) são recalculadas.
create or replace function recalcular_despesas_do_voo(p_voo uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare r record;
begin
  for r in
    select d.id from despesas d
    where d.deleted_at is null
      and d.itens @> jsonb_build_array(jsonb_build_object('voo_id', p_voo::text))
      and not mes_fechado(d.aeronave_id, d.data)
  loop
    perform calcular_rateio(r.id);
  end loop;
end $$;

-- Voo novo ou alterado: POR_HORAS do período, fundo do mês e itens ligados ao voo.
create or replace function voos_recalcular_rateios() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare r record; v_data date; v_aeronave uuid;
begin
  v_data := coalesce(new.data, old.data);
  v_aeronave := coalesce(new.aeronave_id, old.aeronave_id);
  for r in
    select id from despesas
    where aeronave_id = v_aeronave and deleted_at is null and criterio = 'POR_HORAS'
      and v_data between coalesce(periodo_inicio, date_trunc('month', data)::date)
                     and coalesce(periodo_fim, (date_trunc('month', data) + interval '1 month - 1 day')::date)
      and not mes_fechado(aeronave_id, data)
  loop
    perform calcular_rateio(r.id);
  end loop;
  perform recalcular_despesas_do_voo(coalesce(new.id, old.id));
  perform provisionar_fundo_reserva(v_aeronave, date_trunc('month', v_data)::date);
  if tg_op = 'UPDATE' and old.data <> new.data then
    perform provisionar_fundo_reserva(v_aeronave, date_trunc('month', old.data)::date);
  end if;
  return null;
end $$;

-- Voo dividido entre sócios mudou: os itens ligados a ele também.
create or replace function voo_socios_recalcular() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  perform recalcular_despesas_do_voo(coalesce(new.voo_id, old.voo_id));
  return null;
end $$;

drop trigger if exists voo_socios_recalcular on voo_socios;
create trigger voo_socios_recalcular after insert or update or delete on voo_socios
  for each row execute function voo_socios_recalcular();

-- Despesa que já tenha item ligado a voo (mês aberto) passa a valer pela regra nova.
select calcular_rateio(d.id)
from despesas d
where d.deleted_at is null
  and exists (select 1 from jsonb_array_elements(coalesce(d.itens, '[]'::jsonb)) i where i ? 'voo_id')
  and not mes_fechado(d.aeronave_id, d.data);

notify pgrst, 'reload schema';
