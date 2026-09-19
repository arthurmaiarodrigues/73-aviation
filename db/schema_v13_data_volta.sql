-- =====================================================================
-- schema_v13_data_volta.sql — ida e volta num voo só, com a data da volta.
-- Rodar no SQL Editor depois do schema_v12. Idempotente.
--
-- Quando o piloto registra ida e volta juntas sem o horímetro do pouso
-- intermediário, entra um voo só (SNTF → SDC4 → SNTF) com as horas totais;
-- data_volta guarda o dia em que voltou (nulo = mesmo dia / voo simples).
-- =====================================================================
alter table voos add column if not exists data_volta date;
alter table voos drop constraint if exists voos_data_volta_check;
alter table voos add constraint voos_data_volta_check check (data_volta is null or data_volta >= data);
notify pgrst, 'reload schema';
