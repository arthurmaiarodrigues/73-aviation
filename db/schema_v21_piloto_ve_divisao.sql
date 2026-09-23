-- =====================================================================
-- schema_v21_piloto_ve_divisao.sql — o piloto vê quem ainda lhe deve, e o
-- sócio manda o comprovante do PIX. Rodar depois do v20. Idempotente.
--
-- 1. O piloto passa a ler o rateio DAS DESPESAS QUE ELE ADIANTOU (só
--    essas) — assim sabe quanto cabe a cada sócio e quem já pagou.
-- 2. Quem paga pode anexar o comprovante do PIX; o piloto vê o anexo.
-- Nada além disso muda: o piloto continua sem ver despesas de terceiros,
-- extratos, aportes ou saldos.
-- =====================================================================

alter table reembolso_pagamentos add column if not exists comprovante_path text;

-- 1. rateio das despesas que o piloto adiantou
drop policy if exists rateios_piloto_reembolso on rateios;
create policy rateios_piloto_reembolso on rateios for select
  using (
    meu_perfil() = 'piloto'
    and exists (
      select 1 from despesas d
      where d.id = rateios.despesa_id
        and d.reembolso_piloto_id is not null
        and d.reembolso_piloto_id = meu_piloto_id()
    )
  );

-- 2. o sócio (ou o admin) registra o pagamento com o comprovante
create or replace function marcar_reembolso_socio(
  p_socio uuid,
  p_despesas uuid[] default null,
  p_desfazer boolean default false,
  p_comprovante text default null
) returns int
  language plpgsql security definer set search_path = public as
$$
declare v_meu_socio uuid; v_meu_piloto uuid; v_n int;
begin
  select id into v_meu_socio from socios where usuario_id = auth.uid();
  v_meu_piloto := meu_piloto_id();
  if not (sou_admin() or v_meu_socio = p_socio or v_meu_piloto is not null) then
    raise exception 'Só o sócio que deve, o piloto ou o administrador marca o pagamento.';
  end if;

  if p_desfazer then
    delete from reembolso_pagamentos pg
    using despesas d
    where pg.despesa_id = d.id and pg.socio_id = p_socio
      and d.deleted_at is null and d.reembolso_piloto_id is not null
      and (p_despesas is null or pg.despesa_id = any(p_despesas))
      and (v_meu_piloto is null or sou_admin() or d.reembolso_piloto_id = v_meu_piloto);
    get diagnostics v_n = row_count;
    update despesas set reembolsado_em = null, reembolsado_por = null
    where reembolso_piloto_id is not null and deleted_at is null
      and (p_despesas is null or id = any(p_despesas))
      and exists (select 1 from rateios r
                  where r.despesa_id = despesas.id
                    and not exists (select 1 from reembolso_pagamentos pg
                                    where pg.despesa_id = r.despesa_id and pg.socio_id = r.socio_id));
    return v_n;
  end if;

  insert into reembolso_pagamentos (despesa_id, socio_id, pago_por, comprovante_path)
  select r.despesa_id, r.socio_id, auth.uid(), p_comprovante
  from rateios r
  join despesas d on d.id = r.despesa_id
  where r.socio_id = p_socio
    and d.deleted_at is null and d.reembolso_piloto_id is not null and d.status <> 'PENDENTE'
    and (p_despesas is null or r.despesa_id = any(p_despesas))
    and (v_meu_piloto is null or sou_admin() or d.reembolso_piloto_id = v_meu_piloto)
  on conflict (despesa_id, socio_id) do update set comprovante_path = coalesce(excluded.comprovante_path, reembolso_pagamentos.comprovante_path);
  get diagnostics v_n = row_count;

  update despesas set reembolsado_em = current_date, reembolsado_por = auth.uid()
  where reembolso_piloto_id is not null and deleted_at is null and reembolsado_em is null
    and status <> 'PENDENTE'
    and not exists (select 1 from rateios r
                    where r.despesa_id = despesas.id
                      and not exists (select 1 from reembolso_pagamentos pg
                                      where pg.despesa_id = r.despesa_id and pg.socio_id = r.socio_id));
  return v_n;
end $$;

notify pgrst, 'reload schema';
