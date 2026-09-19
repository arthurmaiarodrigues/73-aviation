-- =====================================================================
-- schema_v4d_pernas.sql — horas por perna num voo com escalas.
-- Rodar no SQL Editor depois do schema_v4c. Idempotente.
--
-- horas_pernas[i] são as horas da perna i (origem → 1ª escala, … , última
-- escala → destino). Tem escalas.length + 1 posições quando preenchido.
-- A soma alimenta horas_informadas no voo sem horímetro; com horímetro,
-- vale o horímetro e a soma é só conferência.
-- =====================================================================

alter table voos add column if not exists horas_pernas numeric(8,1)[] not null default '{}';

notify pgrst, 'reload schema';
