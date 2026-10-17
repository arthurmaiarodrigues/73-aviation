-- =====================================================================
-- schema_v36_busca_sem_acento.sql — a busca das despesas ignora acento.
-- Rodar no SQL Editor depois do v35. Idempotente.
--
-- "manutencao" passa a achar MANUTENÇÃO, "almoco" acha ALMOÇO e "vitoria"
-- acha VITÓRIA. Cada despesa ganha uma coluna `busca` (calculada pelo
-- próprio banco) com descrição + observação + cidade em CAIXA ALTA e sem
-- acento; o fornecedor ganha a mesma coisa no nome. A tela procura nessas
-- colunas, com o texto digitado também sem acento.
-- =====================================================================

-- Tira o acento sem depender de extensão (precisa ser IMMUTABLE para
-- servir de coluna calculada).
create or replace function sem_acento(t text) returns text
  language sql immutable strict parallel safe as
$$
  select translate(
    t,
    'áàâãäéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
    'aaaaaeeeeiiiiooooouuuucnyAAAAAEEEEIIIIOOOOOUUUUCNY'
  )
$$;

-- Despesa: o texto todo onde a busca procura.
alter table despesas add column if not exists busca text
  generated always as (
    upper(sem_acento(coalesce(descricao, '') || ' ' || coalesce(observacao, '') || ' ' || coalesce(cidade, '')))
  ) stored;

-- Fornecedor: o nome sem acento (a busca casa a despesa pelo fornecedor).
alter table fornecedores add column if not exists busca text
  generated always as (upper(sem_acento(coalesce(nome, '')))) stored;

notify pgrst, 'reload schema';
