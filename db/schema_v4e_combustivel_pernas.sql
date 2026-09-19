-- =====================================================================
-- schema_v4e_combustivel_pernas.sql — combustível na decolagem de cada perna.
-- Rodar no SQL Editor depois do schema_v4d. Idempotente.
--
-- combustivel_pernas[i] = litros no tanque na decolagem da perna i.
-- combustivel_inicial_l continua sendo o da 1ª decolagem e
-- combustivel_final_l o do pouso final: o consumo do voo (usado no saldo
-- de combustível do sócio) não muda de conta.
-- =====================================================================

alter table voos add column if not exists combustivel_pernas numeric(8,1)[] not null default '{}';

notify pgrst, 'reload schema';
