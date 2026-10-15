-- =====================================================================
-- schema_v31_desconto.sql — desconto na despesa (à vista, negociado).
-- Rodar no SQL Editor depois do v30. Idempotente.
--
-- A nota fecha num valor, mas o que a sociedade pagou foi menos. O
-- `valor` da despesa continua sendo **o que saiu do bolso** (é ele que
-- rateia); `desconto` guarda o abatimento, para a conta bater com a nota.
-- =====================================================================

alter table despesas add column if not exists desconto numeric(14,2) not null default 0 check (desconto >= 0);

comment on column despesas.desconto is 'Abatimento sobre a nota (à vista, negociado). O valor da despesa já é o líquido pago.';

notify pgrst, 'reload schema';
