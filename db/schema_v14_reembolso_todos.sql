-- =====================================================================
-- schema_v14_reembolso_todos.sql — reembolso ao piloto dividido entre todos.
-- Rodar no SQL Editor depois do schema_v13. Idempotente.
--
-- Até aqui o piloto só lançava o que pagou por conta de UM sócio (despesa
-- DIRETO paga por ele). Agora pode lançar o que é de todos (translado,
-- voo de teste, taxa de um voo da sociedade): despesa IGUAL paga pelo
-- CAIXA — a sociedade devolve ao piloto e o custo divide entre os sócios.
-- =====================================================================

drop policy if exists despesas_piloto_lancar on despesas;
create policy despesas_piloto_lancar on despesas for insert
  with check (
    meu_perfil() = 'piloto' and autor_id = auth.uid() and reembolso_piloto_id = meu_piloto_id()
    and (
      -- por conta de um sócio: ele paga direto ao piloto
      (criterio = 'DIRETO' and socio_direto_id is not null and pagador_socio_id = socio_direto_id)
      -- de todos: caixa paga o piloto, rateio igual
      or (criterio = 'IGUAL' and socio_direto_id is null and pagador_socio_id is null)
    )
  );

-- Reembolso de todos: qualquer sócio (ou o piloto, ou o admin) marca como pago.
create or replace function marcar_reembolsado(p_despesa uuid, p_desfazer boolean default false) returns void
  language plpgsql security definer set search_path = public as
$$
declare d despesas%rowtype; v_meu_socio uuid;
begin
  select * into d from despesas where id = p_despesa and deleted_at is null and reembolso_piloto_id is not null;
  if not found then raise exception 'Reembolso não encontrado.'; end if;
  select id into v_meu_socio from socios where usuario_id = auth.uid();
  if not (sou_admin()
          or d.socio_direto_id = v_meu_socio
          or (d.socio_direto_id is null and v_meu_socio is not null)
          or d.reembolso_piloto_id = meu_piloto_id()) then
    raise exception 'Só o sócio que deve, o piloto ou o administrador marca o reembolso.';
  end if;
  update despesas set reembolsado_em = case when p_desfazer then null else current_date end,
                      reembolsado_por = case when p_desfazer then null else auth.uid() end
  where id = p_despesa;
end $$;

notify pgrst, 'reload schema';
