-- =====================================================================
-- schema_v5_revisao_50h.sql — item REVISÃO 50 H no plano e última execução
-- das revisões de 50 h e 100 h (inspeção de 100 h aprovada em 15/09/2026,
-- carimbo na pág. 36 do diário de bordo 003).
-- Rodar no SQL Editor depois do schema_v4e. Idempotente.
--
-- O Início mostra as horas por sócio "desde a última revisão" de cada item
-- cujo nome é REVISÃO <n> H — é o ciclo que o rateio POR_USO da nota da
-- oficina vai usar.
-- =====================================================================

insert into plano_manutencao (aeronave_id, descricao, gatilho, intervalo_horas, intervalo_meses, tipo_custo, ordem)
select a.id, 'REVISÃO 50 H', 'POR_HORAS', 50, null, 'POR_USO', 2
from aeronaves a
where a.ativo
on conflict (aeronave_id, descricao) do nothing;

update plano_manutencao set ordem = 3 where descricao = 'REVISÃO 100 H' and ordem = 2;

-- Só preenche onde ainda não há última execução (o admin pode corrigir na tela).
update plano_manutencao
   set ultima_data = '2026-09-15'
 where descricao in ('REVISÃO 50 H', 'REVISÃO 100 H')
   and ultima_data is null;

notify pgrst, 'reload schema';
