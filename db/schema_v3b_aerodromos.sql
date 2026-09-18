-- =====================================================================
-- schema_v3b_aerodromos.sql — cadastro completo de aeródromos (ANAC).
-- Rodar no SQL Editor; depois `npm run importar-aerodromos` carrega as
-- listas públicas e privadas da ANAC (dados/aerodromos/*.csv).
-- =====================================================================

create extension if not exists pg_trgm;

alter table aerodromos add column if not exists uf            text;
alter table aerodromos add column if not exists tipo          text;          -- PUBLICO | PRIVADO | (null = cadastrado à mão)
alter table aerodromos add column if not exists latitude      numeric(9,6);
alter table aerodromos add column if not exists longitude     numeric(9,6);
alter table aerodromos add column if not exists altitude_m    numeric(7,1);
alter table aerodromos add column if not exists noturno       boolean;
alter table aerodromos add column if not exists pista_m       int;
alter table aerodromos add column if not exists superficie    text;
alter table aerodromos add column if not exists fonte         text;
alter table aerodromos add column if not exists atualizado_em date;

create index if not exists aerodromos_nome_trgm on aerodromos using gin (nome gin_trgm_ops);
create index if not exists aerodromos_cidade_trgm on aerodromos using gin (cidade gin_trgm_ops);

-- Busca para o preenchimento automático: ICAO por prefixo primeiro, depois
-- nome e cidade por trecho. Devolve poucos, ordenados por relevância.
create or replace function buscar_aerodromos(p_texto text, p_limite int default 12)
  returns table (icao text, nome text, cidade text, uf text, tipo text, pista_m int, noturno boolean)
  language sql stable security invoker as
$$
  with q as (select upper(btrim(coalesce(p_texto, ''))) as t)
  select a.icao, a.nome, a.cidade, a.uf, a.tipo, a.pista_m, a.noturno
  from aerodromos a, q
  where q.t <> '' and (a.icao like q.t || '%' or a.nome ilike '%' || q.t || '%' or a.cidade ilike '%' || q.t || '%')
  order by (a.icao = q.t) desc, (a.icao like q.t || '%') desc, (a.tipo = 'PUBLICO') desc, similarity(coalesce(a.nome, ''), q.t) desc, a.icao
  limit p_limite
$$;

notify pgrst, 'reload schema';
