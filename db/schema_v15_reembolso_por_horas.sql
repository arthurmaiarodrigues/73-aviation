-- =====================================================================
-- schema_v15_reembolso_por_horas.sql — reembolso de todos, conforme o uso.
-- Rodar no SQL Editor depois do schema_v14. Idempotente.
--
-- O piloto passa a escolher como a despesa divide:
--   um sócio            → DIRETO (ele paga o piloto)
--   todos, partes iguais→ IGUAL     (uniforme, salário, CVA, IFR, revisão)
--   todos, pelo uso     → POR_HORAS (manutenção, peças)
-- Nos dois casos "de todos" o caixa devolve ao piloto.
-- =====================================================================

drop policy if exists despesas_piloto_lancar on despesas;
create policy despesas_piloto_lancar on despesas for insert
  with check (
    meu_perfil() = 'piloto' and autor_id = auth.uid() and reembolso_piloto_id = meu_piloto_id()
    and (
      (criterio = 'DIRETO' and socio_direto_id is not null and pagador_socio_id = socio_direto_id)
      or (criterio in ('IGUAL', 'POR_HORAS') and socio_direto_id is null and pagador_socio_id is null)
    )
  );

notify pgrst, 'reload schema';
