-- =====================================================================
-- schema_v37_auditoria.sql — correções da auditoria de 17/10/2026.
-- Rodar no SQL Editor depois do v36. Idempotente.
--
-- 1) Horas de voo comum deixam de inflar no arredondamento.
-- 2) Pedido de reserva cujo período já passou sai do limbo.
-- 3) O voo de 26/06 (antes da troca de óleo) sai do ciclo da revisão.
-- 4) Os três aportes de R$ 1.900 da aferição saem (cada sócio pagou
--    direto ao fornecedor; o crédito já está na lista de pagadores).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. v_voo_socio: a soma das partes fecha com as horas do voo.
--
-- Antes, cada parte do voo comum era arredondada por conta própria
-- (4,4 h ÷ 3 = 1,5 + 1,5 + 1,5 = 4,5 h) e o total das horas por sócio
-- ficava maior que o total voado. Agora o piso é de um décimo e a sobra
-- (0,1 h de cada vez) vai para alguns sócios, sorteados pelo próprio
-- voo — então 4,4 h ÷ 3 = 1,5 + 1,5 + 1,4, e cada voo favorece um
-- sócio diferente. Mesma conta para os litros.
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
)
-- voo de um sócio só
select b.voo_id, b.aeronave_id, b.data, b.natureza, b.socio_id, b.horas, b.litros, b.litros_estimados, false as uso_comum
from base b where b.socio_id is not null and not b.dividido
union all
-- uso comum: parte igual para cada sócio ativo, com a sobra distribuída
select b.voo_id, b.aeronave_id, b.data, b.natureza, s.socio_id,
       p.piso_h + case when s.ord <= p.resto_h then 0.1 else 0 end,
       p.piso_l + case when s.ord <= p.resto_l then 0.1 else 0 end,
       b.litros_estimados, true
from base b
cross join lateral (select count(*) as qt from socios_ativos_em(b.data)) n
cross join lateral (
  select x.socio_id, row_number() over (order by md5(b.voo_id::text || x.socio_id::text)) as ord
  from socios_ativos_em(b.data) x
) s
cross join lateral (
  select floor(b.horas / n.qt * 10) / 10 as piso_h,
         round((b.horas - floor(b.horas / n.qt * 10) / 10 * n.qt) * 10)::int as resto_h,
         floor(b.litros / n.qt * 10) / 10 as piso_l,
         round((b.litros - floor(b.litros / n.qt * 10) / 10 * n.qt) * 10)::int as resto_l
) p
where b.socio_id is null and not b.dividido and n.qt > 0
union all
-- voo dividido: a parte de cada sócio
select b.voo_id, b.aeronave_id, b.data, b.natureza, d.socio_id, d.horas,
       round(b.litros * d.horas / nullif(b.horas, 0), 1), b.litros_estimados, false
from base b
join voo_socios d on d.voo_id = b.voo_id
where b.dividido and d.socio_id is not null
union all
-- voo dividido: a parte da sociedade, igual entre os ativos, com a sobra distribuída
select b.voo_id, b.aeronave_id, b.data, b.natureza, s.socio_id,
       p.piso_h + case when s.ord <= p.resto_h then 0.1 else 0 end,
       p.piso_l + case when s.ord <= p.resto_l then 0.1 else 0 end,
       b.litros_estimados, true
from base b
join voo_socios d on d.voo_id = b.voo_id and d.socio_id is null
cross join lateral (select count(*) as qt from socios_ativos_em(b.data)) n
cross join lateral (
  select x.socio_id, row_number() over (order by md5(b.voo_id::text || x.socio_id::text)) as ord
  from socios_ativos_em(b.data) x
) s
cross join lateral (
  select floor(d.horas / n.qt * 10) / 10 as piso_h,
         round((d.horas - floor(d.horas / n.qt * 10) / 10 * n.qt) * 10)::int as resto_h,
         floor(round(b.litros * d.horas / nullif(b.horas, 0), 1) / n.qt * 10) / 10 as piso_l,
         round((round(b.litros * d.horas / nullif(b.horas, 0), 1)
                - floor(round(b.litros * d.horas / nullif(b.horas, 0), 1) / n.qt * 10) / 10 * n.qt) * 10)::int as resto_l
) p
where b.dividido and n.qt > 0;

-- ---------------------------------------------------------------------
-- 2. Pedido de reserva cujo período já passou não fica pendente para
-- sempre. Ninguém disse que precisava do avião e a data passou: vale.
-- (Pedido em feriado continua precisando de resposta enquanto a data
-- não chega.)
-- ---------------------------------------------------------------------
create or replace function resolver_pedidos(p_aeronave uuid) returns uuid[]
  language plpgsql security definer set search_path = public as
$$
declare v_ids uuid[];
begin
  with liberadas as (
    update reservas r set pendente = false
    where r.aeronave_id = p_aeronave and r.status = 'CONFIRMADA' and r.pendente
      and not exists (select 1 from reserva_respostas x where x.reserva_id = r.id and not x.concorda)
      and (
        (r.created_at < now() - interval '48 hours' and not r.feriado)
        or r.fim < current_date
      )
    returning r.id
  )
  select array_agg(id) into v_ids from liberadas;
  return coalesce(v_ids, '{}');
end $$;

-- ---------------------------------------------------------------------
-- 3. Ciclo da revisão: o voo de 26/06/2026 (7,5 h) foi ANTES da troca
-- de óleo daquele dia, então não entra nas horas do ciclo. O marco
-- passa para 27/06 e as despesas por horas do ciclo são recalculadas
-- (o gatilho de rateio dispara na mudança do período).
-- ---------------------------------------------------------------------
update plano_execucoes set data = date '2026-06-27' where data = date '2026-06-26';

update despesas set periodo_inicio = date '2026-06-27'
where periodo_inicio = date '2026-06-26' and criterio = 'POR_HORAS' and deleted_at is null;

-- Com as horas fechando certo, todo rateio por horas de mês aberto é
-- refeito (eram centavos, mas que ninguém some).
do $$
declare r record;
begin
  for r in
    select d.id, d.data, d.aeronave_id from despesas d
    where d.criterio = 'POR_HORAS' and d.deleted_at is null and d.status <> 'PENDENTE'
  loop
    if not mes_fechado(r.aeronave_id, date_trunc('month', r.data)::date) then
      perform calcular_rateio(r.id);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Aferição de aviônicos (14/09, R$ 7.600): ARTHUR, WANDERSON e
-- CAETANO pagaram R$ 1.900 direto para a K-I Avionics e a parte do
-- MARCELINO saiu do caixa — é o que a lista de pagadores já diz. Os
-- três aportes de R$ 1.900 com a mesma descrição eram o mesmo dinheiro
-- contado outra vez (R$ 5.700 de crédito a mais e caixa inflado).
-- Saem por id, com o comprovante preservado.
-- ---------------------------------------------------------------------
update aportes set deleted_at = now(), deleted_by = (select usuario_id from socios where apelido = 'ARTHUR')
where id in (
  'e31b4d71-feb9-4418-825f-8bf8fc5eb8bb',  -- 25/09 ARTHUR R$ 1.900
  '42d24ea0-f01e-43f1-a3b4-6dbd646aa524',  -- 25/09 WANDERSON R$ 1.900
  '92e2841c-f28d-4e3e-bc2b-b769869dbe2b'   -- 01/10 CAETANO R$ 1.900
) and deleted_at is null;

notify pgrst, 'reload schema';
