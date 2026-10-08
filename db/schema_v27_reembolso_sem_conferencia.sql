-- =====================================================================
-- schema_v27_reembolso_sem_conferencia.sql — reembolso do piloto entra
-- direto, sem esperar o administrador.
-- Rodar no SQL Editor depois do v26. Idempotente.
--
-- A conferência prévia virou gargalo: enquanto o admin não confirmava,
-- o lançamento não aparecia para os sócios nem entrava nas contas. Agora
-- o reembolso já nasce valendo, com a divisão que o piloto escolheu, e o
-- administrador corrige depois se precisar (`confirmar_reembolso`
-- continua existindo e agora serve para ajustar a divisão a qualquer
-- momento).
-- =====================================================================

-- O piloto lança já aprovado; a regra de quem paga continua a mesma:
-- de um sócio = DIRETO pago por ele; de todos = cada sócio paga a parte.
drop policy if exists despesas_piloto_lancar on despesas;
create policy despesas_piloto_lancar on despesas for insert
  with check (
    meu_perfil() = 'piloto' and autor_id = auth.uid() and reembolso_piloto_id = meu_piloto_id()
    and status = 'APROVADA'
    and (
      (criterio = 'DIRETO' and socio_direto_id is not null and pagador_socio_id = socio_direto_id and not pago_pelos_socios)
      or (criterio in ('IGUAL', 'POR_HORAS') and socio_direto_id is null and pagador_socio_id is null and pago_pelos_socios)
    )
  );

-- Ajustar a divisão vale a qualquer momento, não só enquanto pendente.
create or replace function confirmar_reembolso(
  p_despesa uuid,
  p_criterio text default null,
  p_socio uuid default null
) returns void
  language plpgsql security definer set search_path = public as
$$
declare d despesas%rowtype; v_criterio text;
begin
  if not sou_admin() then raise exception 'Só o administrador ajusta a divisão do reembolso.'; end if;
  select * into d from despesas where id = p_despesa and deleted_at is null and reembolso_piloto_id is not null;
  if not found then raise exception 'Reembolso não encontrado.'; end if;

  v_criterio := coalesce(p_criterio, d.criterio::text);
  if v_criterio not in ('IGUAL', 'POR_HORAS', 'DIRETO') then
    raise exception 'Divisão inválida: %.', v_criterio;
  end if;
  if v_criterio = 'DIRETO' and coalesce(p_socio, d.socio_direto_id) is null then
    raise exception 'No reembolso de um sócio só, escolha o sócio.';
  end if;

  if v_criterio = 'DIRETO' then
    update despesas set criterio = 'DIRETO',
                        socio_direto_id = coalesce(p_socio, socio_direto_id),
                        pagador_socio_id = coalesce(p_socio, socio_direto_id),
                        pago_pelos_socios = false,
                        status = 'APROVADA'
    where id = p_despesa;
  else
    update despesas set criterio = v_criterio::criterio_rateio,
                        socio_direto_id = null,
                        pagador_socio_id = null,
                        pago_pelos_socios = true,
                        status = 'APROVADA'
    where id = p_despesa;
  end if;

  perform calcular_rateio(p_despesa);
end $$;

-- Nada pode ficar parado esperando conferência: o que estava pendente
-- passa a valer com a divisão que o piloto escolheu.
update despesas set pago_pelos_socios = true, status = 'APROVADA'
where reembolso_piloto_id is not null and status = 'PENDENTE' and deleted_at is null
  and criterio in ('IGUAL', 'POR_HORAS');

update despesas set status = 'APROVADA'
where reembolso_piloto_id is not null and status = 'PENDENTE' and deleted_at is null
  and criterio = 'DIRETO';

do $$
declare r record;
begin
  for r in select id from despesas where reembolso_piloto_id is not null and status = 'APROVADA' and deleted_at is null loop
    perform calcular_rateio(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
