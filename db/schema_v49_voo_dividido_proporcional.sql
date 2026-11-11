-- =====================================================================
-- schema_v49_voo_dividido_proporcional.sql — voo dividido entre alguns
-- sócios, e as despesas do voo seguindo a divisão.
-- Rodar no SQL Editor depois do v48. Idempotente.
--
-- 1. A divisão do voo vira PROPORÇÃO. `voo_socios.horas` passa a ser o
--    peso de cada um (partes iguais = 1 cada; ou as horas de cada trecho).
--    `v_voo_socio` reparte as horas e os litros do voo nessa proporção.
--    Antes a soma tinha de bater com as horas do voo — e não batia desde
--    que o tempo de voo virou a hora oficial (o lançamento dividia pelo
--    horímetro), nem no voo em aberto, nem quando o diário corrigia as
--    horas (foi o que deixou o voo de 20/09 com 2,7 h divididas para
--    1,0 h voada). Voo de um sócio e voo da sociedade: nada muda.
-- 2. Despesa "pelo voo" (`despesas.rateio_pelo_voo` + `voo_id`): o valor
--    inteiro vai para quem estava no voo, na divisão dele — taxa, hangar,
--    reembolso do piloto da viagem. Mesmo cálculo dos itens de nota
--    ligados a voo (v47/v48), sem precisar de itens.
-- 3. Retirada do tanque ligada a voo dividido: os litros seguem a divisão
--    (a compra seguinte do tanque divide por eles).
-- 4. Mudou o voo ou a divisão: tudo isso se refaz (mês aberto).
-- =====================================================================

alter table despesas add column if not exists rateio_pelo_voo boolean not null default false;

-- ---------------------------------------------------------------------
-- 1. Horas e litros por sócio, com a divisão como proporção.
-- Piso de um décimo por sócio e a sobra (0,1 de cada vez) para quem tem
-- a maior fração quebrada; empate (uso comum) sorteado pelo md5 do voo +
-- sócio, como no v37 — voo da sociedade dá exatamente o mesmo de antes.
-- ---------------------------------------------------------------------
create or replace view v_voo_socio with (security_invoker = true) as
with base as (
  select
    v.id as voo_id, v.aeronave_id, v.data, v.natureza, v.horas,
    case
      when v.combustivel_inicial_l is not null and v.combustivel_final_l is not null
        then v.combustivel_inicial_l - v.combustivel_final_l
      else round(coalesce(a.consumo_medio_lh, 0) * v.horas, 1)
    end as litros,
    (v.combustivel_inicial_l is null or v.combustivel_final_l is null) as litros_estimados,
    v.socio_id,
    exists (select 1 from voo_socios d where d.voo_id = v.id) as dividido
  from voos v
  join aeronaves a on a.id = v.aeronave_id
  where v.deleted_at is null
),
pesos as (
  select d.voo_id, sum(d.horas) as total from voo_socios d group by d.voo_id
),
fracoes as (
  -- voo de um sócio
  select b.voo_id, b.socio_id, 1::numeric as num, 1::numeric as den, false as comum
  from base b where b.socio_id is not null and not b.dividido
  union all
  -- uso comum: igual entre os ativos
  select b.voo_id, s.socio_id, 1::numeric, n.qt::numeric, true
  from base b
  cross join lateral (select count(*) as qt from socios_ativos_em(b.data)) n
  cross join lateral socios_ativos_em(b.data) s
  where b.socio_id is null and not b.dividido and n.qt > 0
  union all
  -- dividido: a parte de cada sócio
  select b.voo_id, d.socio_id, d.horas, p.total, false
  from base b
  join voo_socios d on d.voo_id = b.voo_id
  join pesos p on p.voo_id = b.voo_id
  where b.dividido and d.socio_id is not null and p.total > 0
  union all
  -- dividido: a parte da sociedade, igual entre os ativos
  select b.voo_id, s.socio_id, d.horas, p.total * n.qt, true
  from base b
  join voo_socios d on d.voo_id = b.voo_id and d.socio_id is null
  join pesos p on p.voo_id = b.voo_id
  cross join lateral (select count(*) as qt from socios_ativos_em(b.data)) n
  cross join lateral socios_ativos_em(b.data) s
  where b.dividido and p.total > 0 and n.qt > 0
),
por_socio as (
  -- quem tem parte própria e parte na sociedade soma as duas
  select f.voo_id, f.socio_id,
         sum(f.num / f.den) as fracao,
         bool_and(f.comum) as comum
  from fracoes f group by f.voo_id, f.socio_id
),
calc as (
  select b.voo_id, b.aeronave_id, b.data, b.natureza, p.socio_id, b.horas, b.litros, b.litros_estimados, p.comum,
         round(b.horas * p.fracao, 8) as h_exata,
         round(b.litros * p.fracao, 8) as l_exata
  from por_socio p join base b on b.voo_id = p.voo_id
),
piso as (
  select c.*,
         floor(round(c.h_exata * 10, 6)) / 10 as h_piso,
         floor(round(c.l_exata * 10, 6)) / 10 as l_piso
  from calc c
),
ordem as (
  select x.*,
         round((x.horas - sum(x.h_piso) over (partition by x.voo_id)) * 10)::int as resto_h,
         round((x.litros - sum(x.l_piso) over (partition by x.voo_id)) * 10)::int as resto_l,
         row_number() over (partition by x.voo_id order by round(x.h_exata - x.h_piso, 6) desc, md5(x.voo_id::text || x.socio_id::text)) as ord_h,
         row_number() over (partition by x.voo_id order by round(x.l_exata - x.l_piso, 6) desc, md5(x.voo_id::text || x.socio_id::text)) as ord_l
  from piso x
)
select o.voo_id, o.aeronave_id, o.data, o.natureza, o.socio_id,
       o.h_piso + case when o.ord_h <= o.resto_h then 0.1 else 0 end as horas,
       o.l_piso + case when o.ord_l <= o.resto_l then 0.1 else 0 end as litros,
       o.litros_estimados,
       o.comum as uso_comum
from ordem o;

-- A divisão é proporção: não precisa mais somar as horas do voo.
create or replace function definir_divisao_voo(p_voo uuid, p_partes jsonb) returns void
  language plpgsql security definer set search_path = public as
$$
declare v voos%rowtype;
begin
  select * into v from voos where id = p_voo and deleted_at is null;
  if not found then raise exception 'Voo não encontrado.'; end if;
  if not (sou_admin() or v.autor_id = auth.uid()) then
    raise exception 'Só o administrador ou quem lançou o voo divide as horas.';
  end if;
  if mes_fechado(v.aeronave_id, v.data) then
    raise exception 'O mês do voo está fechado.';
  end if;

  delete from voo_socios where voo_id = p_voo;

  if p_partes is not null and jsonb_array_length(p_partes) > 0 then
    insert into voo_socios (voo_id, socio_id, horas)
    select p_voo, nullif(x->>'socio_id', '')::uuid, round((x->>'horas')::numeric, 1)
    from jsonb_array_elements(p_partes) x
    where (x->>'horas')::numeric >= 0.05;
  end if;

  -- as despesas POR_HORAS do período e o fundo do mês mudam de proporção
  -- (as despesas e retiradas ligadas ao voo se refazem pelo gatilho de voo_socios)
  perform provisionar_fundo_reserva(v.aeronave_id, date_trunc('month', v.data)::date);
  perform calcular_rateio(d.id)
  from despesas d
  where d.aeronave_id = v.aeronave_id and d.deleted_at is null and d.criterio = 'POR_HORAS'
    and v.data between coalesce(d.periodo_inicio, date_trunc('month', d.data)::date)
                   and coalesce(d.periodo_fim, (date_trunc('month', d.data) + interval '1 month - 1 day')::date)
    and not mes_fechado(d.aeronave_id, d.data);
end $$;

-- ---------------------------------------------------------------------
-- 2. Item de nota ligado a voo OU a despesa inteira "pelo voo".
-- Basta o voo existir: quem estava nele já se sabe mesmo com o voo em
-- aberto (as frações não dependem das horas).
-- ---------------------------------------------------------------------
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
    and exists (select 1 from voos x where x.id = (i->>'voo_id')::uuid and x.aeronave_id = d.aeronave_id and x.deleted_at is null)
  union all
  -- a despesa inteira pelo voo (quando nenhum item aponta voo)
  select d.voo_id, d.valor
  from despesas d
  where d.id = p_despesa and d.rateio_pelo_voo and d.voo_id is not null
    and not exists (select 1 from jsonb_array_elements(coalesce(d.itens, '[]'::jsonb)) i where coalesce(i->>'voo_id', '') <> '')
    and exists (select 1 from voos x where x.id = d.voo_id and x.aeronave_id = d.aeronave_id and x.deleted_at is null)
$$;

drop trigger if exists despesas_ratear on despesas;
create trigger despesas_ratear after insert or update of valor, criterio, socio_direto_id, periodo_inicio, periodo_fim, data, deleted_at, pago_pelo_fundo, tanque, itens, desconto, rateio_pelo_voo, voo_id
  on despesas for each row execute function despesas_ratear();

-- ---------------------------------------------------------------------
-- 3. Litros retirados do tanque por sócio: retirada de voo dividido segue
-- a divisão do voo; o resto, como antes (por conta de / sociedade igual).
-- ---------------------------------------------------------------------
create or replace function litros_tanque_por_socio(p_aeronave uuid, p_depois_de date, p_ate date)
  returns table (socio_id uuid, litros numeric)
  language sql stable as
$$
  with ret as (
    select m.*, (m.voo_id is not null and exists (select 1 from voo_socios d where d.voo_id = m.voo_id)) as do_dividido
    from tanque_movimentos m
    where m.aeronave_id = p_aeronave and m.tipo = 'RETIRADA' and m.deleted_at is null
      and (p_depois_de is null or m.data > p_depois_de) and m.data <= p_ate
  ),
  base as (
    select pv.socio_id, round(r.litros * pv.fracao, 1) as litros
    from ret r cross join lateral partes_do_voo(r.voo_id) pv
    where r.do_dividido
    union all
    select r.socio_id, r.litros
    from ret r where not r.do_dividido and r.socio_id is not null
    union all
    select s.socio_id, round(r.litros / n.qt, 1)
    from ret r
    cross join lateral (select count(*) as qt from socios_ativos_em(r.data)) n
    cross join lateral socios_ativos_em(r.data) s
    where not r.do_dividido and r.socio_id is null and n.qt > 0
  )
  select socio_id, sum(litros) from base group by socio_id
$$;

-- ---------------------------------------------------------------------
-- 4. Mudou o voo ou a divisão: refaz itens, despesas "pelo voo" e as
-- compras do tanque que dividem pelas retiradas desse voo.
-- ---------------------------------------------------------------------
create or replace function recalcular_despesas_do_voo(p_voo uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare r record;
begin
  for r in
    select d.id from despesas d
    where d.deleted_at is null
      and (d.itens @> jsonb_build_array(jsonb_build_object('voo_id', p_voo::text))
           or (d.rateio_pelo_voo and d.voo_id = p_voo))
      and not mes_fechado(d.aeronave_id, d.data)
  loop
    perform calcular_rateio(r.id);
  end loop;

  for r in
    select distinct c.despesa_id as id
    from tanque_movimentos m
    join tanque_movimentos c on c.aeronave_id = m.aeronave_id and c.tipo = 'COMPRA' and c.deleted_at is null
                            and c.despesa_id is not null and c.data >= m.data
    where m.voo_id = p_voo and m.tipo = 'RETIRADA' and m.deleted_at is null
      and not mes_fechado(c.aeronave_id, c.data)
  loop
    perform calcular_rateio(r.id);
  end loop;
end $$;

-- O ajuste do reembolso pelo admin passa a mandar na divisão (sai do "pelo voo").
create or replace function confirmar_reembolso(
  p_despesa uuid,
  p_criterio text default null,
  p_socio uuid default null
) returns void
  language plpgsql security definer set search_path = public as
$$
declare d despesas%rowtype; v_criterio text;
begin
  if not sou_admin() then raise exception 'Só o administrador ajusta a divisão do reembolso.'; end if;
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
                        rateio_pelo_voo = false,
                        status = 'APROVADA'
    where id = p_despesa;
  else
    update despesas set criterio = v_criterio::criterio_rateio,
                        socio_direto_id = null,
                        pagador_socio_id = null,
                        pago_pelos_socios = true,
                        rateio_pelo_voo = false,
                        status = 'APROVADA'
    where id = p_despesa;
  end if;

  perform calcular_rateio(p_despesa);
end $$;

-- Refaz o que depende de voo dividido (hoje só o de 20/09/2026).
do $$
declare r record;
begin
  for r in select distinct voo_id from voo_socios loop
    perform recalcular_despesas_do_voo(r.voo_id);
  end loop;
end $$;

notify pgrst, 'reload schema';
