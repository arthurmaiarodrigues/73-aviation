-- =====================================================================
-- schema_v18_reembolso_por_socio.sql — cada sócio paga a sua parte.
-- Rodar no SQL Editor depois do v17. Idempotente.
--
-- Um reembolso "de todos" é devido por quatro pessoas: agora cada sócio
-- marca (ou o admin marca por ele) quando pagou a sua parte ao piloto. A
-- despesa só fica reembolsada quando todas as partes estiverem pagas.
-- Também guarda a chave PIX do piloto, que vai no relatório aos sócios.
-- =====================================================================

alter table pilotos add column if not exists pix text;

create table if not exists reembolso_pagamentos (
  despesa_id uuid not null references despesas(id) on delete cascade,
  socio_id   uuid not null references socios(id),
  pago_em    date not null default current_date,
  pago_por   uuid references usuarios(id),
  primary key (despesa_id, socio_id)
);

alter table reembolso_pagamentos enable row level security;
drop policy if exists reembolso_pagamentos_ler on reembolso_pagamentos;
create policy reembolso_pagamentos_ler on reembolso_pagamentos for select using (meu_perfil() is not null);

-- ---------------------------------------------------------------------
-- Quanto cada sócio ainda deve ao piloto (parte do rateio ainda não paga)
-- ---------------------------------------------------------------------
create or replace view v_reembolso_socio with (security_invoker = true) as
select d.id            as despesa_id,
       d.reembolso_piloto_id as piloto_id,
       r.socio_id,
       r.valor,
       p.pago_em
from despesas d
join rateios r on r.despesa_id = d.id
left join reembolso_pagamentos p on p.despesa_id = d.id and p.socio_id = r.socio_id
where d.deleted_at is null
  and d.reembolso_piloto_id is not null
  and d.status <> 'PENDENTE';

-- ---------------------------------------------------------------------
-- Marca (ou desmarca) a parte de um sócio. Pode ser o próprio sócio, o
-- piloto que recebeu ou o admin. Sem lista de despesas, vale para tudo o
-- que ele deve àquele piloto.
-- ---------------------------------------------------------------------
create or replace function marcar_reembolso_socio(
  p_socio uuid,
  p_despesas uuid[] default null,
  p_desfazer boolean default false
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

  insert into reembolso_pagamentos (despesa_id, socio_id, pago_por)
  select r.despesa_id, r.socio_id, auth.uid()
  from rateios r
  join despesas d on d.id = r.despesa_id
  where r.socio_id = p_socio
    and d.deleted_at is null and d.reembolso_piloto_id is not null and d.status <> 'PENDENTE'
    and (p_despesas is null or r.despesa_id = any(p_despesas))
    and (v_meu_piloto is null or sou_admin() or d.reembolso_piloto_id = v_meu_piloto)
  on conflict (despesa_id, socio_id) do nothing;
  get diagnostics v_n = row_count;

  -- Despesa com todas as partes pagas fica reembolsada.
  update despesas set reembolsado_em = current_date, reembolsado_por = auth.uid()
  where reembolso_piloto_id is not null and deleted_at is null and reembolsado_em is null
    and status <> 'PENDENTE'
    and not exists (select 1 from rateios r
                    where r.despesa_id = despesas.id
                      and not exists (select 1 from reembolso_pagamentos pg
                                      where pg.despesa_id = r.despesa_id and pg.socio_id = r.socio_id));
  return v_n;
end $$;

-- Marcar a despesa inteira continua valendo: registra a parte de todos.
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

  if p_desfazer then
    delete from reembolso_pagamentos where despesa_id = p_despesa;
    update despesas set reembolsado_em = null, reembolsado_por = null where id = p_despesa;
  else
    insert into reembolso_pagamentos (despesa_id, socio_id, pago_por)
    select r.despesa_id, r.socio_id, auth.uid() from rateios r where r.despesa_id = p_despesa
    on conflict (despesa_id, socio_id) do nothing;
    update despesas set reembolsado_em = current_date, reembolsado_por = auth.uid() where id = p_despesa;
  end if;
end $$;

-- Quem já estava marcado como reembolsado entra com as partes pagas.
insert into reembolso_pagamentos (despesa_id, socio_id, pago_em)
select d.id, r.socio_id, d.reembolsado_em
from despesas d join rateios r on r.despesa_id = d.id
where d.reembolso_piloto_id is not null and d.reembolsado_em is not null and d.deleted_at is null
on conflict (despesa_id, socio_id) do nothing;

notify pgrst, 'reload schema';
