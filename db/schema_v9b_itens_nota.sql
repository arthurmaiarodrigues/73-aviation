-- =====================================================================
-- schema_v9b_itens_nota.sql — itens discriminados na nota ficam na
-- própria despesa (registro; o rateio continua sendo do total).
-- Rodar no SQL Editor depois do schema_v9. Idempotente.
-- =====================================================================
alter table despesas add column if not exists itens jsonb not null default '[]';
notify pgrst, 'reload schema';
