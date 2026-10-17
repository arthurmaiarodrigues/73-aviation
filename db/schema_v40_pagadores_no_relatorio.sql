-- =====================================================================
-- schema_v40_pagadores_no_relatorio.sql — a coluna "Pagou" do relatório
-- do fechamento passa a mostrar quem pagou de verdade.
--
-- `linhas_mes` é de antes da lista de vários pagadores (v30/v35): ela
-- lia só `despesas.pagador_socio_id` e, quando era nulo, escrevia
-- "CAIXA". A aferição de aviônicos (14/09, R$ 7.600) aparecia como
-- paga pelo CAIXA, quando na verdade ARTHUR, WANDERSON e CAETANO
-- pagaram R$ 1.900 cada direto ao fornecedor e só a parte do MARCELINO
-- saiu do caixa. O lançamento sempre esteve certo (cada um que pagou
-- tem o crédito e o débito da parte dele, dando zero) — era só o
-- rótulo do relatório.
--
-- Agora mostra, nesta ordem: o pagador único → a lista de pagadores
-- (sócios e CAIXA) → "CADA SÓCIO" quando cada um pagou a sua parte →
-- "CAIXA".
-- Rodar no SQL Editor depois do v39. Idempotente.
-- =====================================================================

create or replace function linhas_mes(p_aeronave uuid, p_mes date)
  returns table (data date, tipo text, descricao text, trecho text, horas numeric, valor numeric, pagador text, criterio text, por_socio jsonb)
  language sql stable security invoker as
$$
  with m as (select date_trunc('month', p_mes)::date as ini, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as fim)
  select v.data, 'VOO', coalesce(s.apelido, 'SOCIEDADE') || case when v.natureza <> 'PARTICULAR' then ' · ' || v.natureza::text else '' end,
         coalesce(v.origem, '?') || ' → ' || coalesce(v.destino, '?'), v.horas, null, null, null,
         (select jsonb_object_agg(so.apelido, vs.horas) from v_voo_socio vs join socios so on so.id = vs.socio_id where vs.voo_id = v.id)
  from voos v left join socios s on s.id = v.socio_id, m
  where v.aeronave_id = p_aeronave and v.deleted_at is null and v.data between m.ini and m.fim
  union all
  select d.data, 'DESPESA', d.descricao || coalesce(' · ' || f.nome, ''), c.nome, null, d.valor,
         coalesce(
           p.apelido,
           -- vários pagaram: os sócios e, quando entrou, o caixa
           (select string_agg(coalesce(sp.apelido, 'CAIXA'), ' · ' order by dp.valor desc, coalesce(sp.apelido, 'CAIXA'))
              from despesa_pagadores dp left join socios sp on sp.id = dp.socio_id
             where dp.despesa_id = d.id),
           case when d.pago_pelos_socios then 'CADA SÓCIO' end,
           'CAIXA'
         ),
         case when d.pago_pelo_fundo then 'FUNDO' else d.criterio::text end,
         (select jsonb_object_agg(so.apelido, r.valor) from rateios r join socios so on so.id = r.socio_id where r.despesa_id = d.id)
  from despesas d
  join categorias_despesa c on c.id = d.categoria_id
  left join fornecedores f on f.id = d.fornecedor_id
  left join socios p on p.id = d.pagador_socio_id, m
  where d.aeronave_id = p_aeronave and d.deleted_at is null and d.data between m.ini and m.fim
  union all
  select a.data, 'APORTE', 'APORTE ' || s.apelido || coalesce(' · ' || a.descricao, ''), null, null, a.valor, s.apelido, null,
         jsonb_build_object(s.apelido, -a.valor)
  from aportes a join socios s on s.id = a.socio_id, m
  where a.deleted_at is null and a.data between m.ini and m.fim
  order by 1, 2
$$;

notify pgrst, 'reload schema';
