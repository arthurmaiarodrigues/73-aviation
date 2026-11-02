-- =====================================================================
-- schema_v46_reembolso_apagar.sql — o piloto apaga o reembolso errado.
-- Rodar no SQL Editor depois do v45. Idempotente.
--
-- Até aqui só o administrador apagava despesa, então o piloto que
-- errava (valor trocado, lançamento repetido) não tinha o que fazer: a
-- saída era lançar de novo o certo e o errado ficava. Foi o que encheu
-- novembro/2026 de reembolsos repetidos e de um UBER de R$ 2.726 que
-- era R$ 27,26.
--
-- Agora quem lançou apaga, enquanto ninguém marcou pagamento. É
-- soft-delete como todo o resto: fica na lixeira, recuperável.
-- =====================================================================

create or replace function apagar_reembolso(p_despesa uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare
  v_piloto uuid;
  v_pagas  int;
begin
  select reembolso_piloto_id into v_piloto
    from despesas where id = p_despesa and deleted_at is null;
  if v_piloto is null then
    raise exception 'Esse lançamento não é um reembolso ao piloto (ou já foi apagado).';
  end if;

  if not sou_admin() and v_piloto is distinct from meu_piloto_id() then
    raise exception 'Só quem lançou o reembolso, ou o administrador, pode apagar.';
  end if;

  select count(*) into v_pagas from reembolso_pagamentos where despesa_id = p_despesa;
  if v_pagas > 0 and not sou_admin() then
    raise exception 'Algum sócio já marcou o pagamento deste reembolso. Fale com o administrador.';
  end if;

  update despesas
     set deleted_at = now(), deleted_by = auth.uid()
   where id = p_despesa;
end $$;

notify pgrst, 'reload schema';
