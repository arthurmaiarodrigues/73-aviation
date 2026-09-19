-- =====================================================================
-- schema_v12_pernas.sql — pouso perna a perna.
-- Rodar no SQL Editor depois do schema_v11. Idempotente.
--
-- O voo típico é SNTF → destino → SNTF. A cada pouso o piloto registra
-- (foto do horímetro opcional); as horas de cada perna saem da diferença
-- dos horímetros. O último pouso fecha o voo.
--   horimetro_pernas[i]  = leitura do horímetro no pouso da perna i
--   pernas_concluidas    = quantas pernas já pousaram
-- =====================================================================
alter table voos add column if not exists horimetro_pernas numeric(8,1)[] not null default '{}';
alter table voos add column if not exists pernas_concluidas int not null default 0;
notify pgrst, 'reload schema';
