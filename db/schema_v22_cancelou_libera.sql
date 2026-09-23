-- =====================================================================
-- schema_v22_cancelou_libera.sql — cancelou, o período fica livre.
-- Rodar no SQL Editor depois do v21. Idempotente.
--
-- O titular tinha marcado no bloco dele e cancelou: isso é dizer que não
-- vai usar. A partir daí o período deixa de pedir autorização —
--   * quem já tinha pedido aquele período é confirmado na hora;
--   * quem for marcar depois marca direto, sem virar pedido.
-- Enquanto ele não cancelar nada, continua valendo o pedido ao titular.
-- =====================================================================

-- O titular desistiu do bloco? (cancelou o que tinha e não marcou mais nada)
create or replace function bloco_liberado(p_bloco uuid) returns boolean
  language sql stable as
$$
  select exists (
    select 1 from semanas s
    where s.id = p_bloco and s.socio_id is not null
      and exists (
        select 1 from reservas r
        where r.aeronave_id = s.aeronave_id and r.socio_id = s.socio_id and r.status = 'CANCELADA'
          and r.inicio <= s.fim and r.fim >= s.inicio
      )
      and not exists (
        select 1 from reservas r
        where r.aeronave_id = s.aeronave_id and r.socio_id = s.socio_id and r.status = 'CONFIRMADA'
          and r.inicio <= s.fim and r.fim >= s.inicio
      )
  )
$$;

-- Dono do período, ignorando quem já desistiu do bloco.
create or replace function titular_do_periodo(p_socio uuid, p_inicio date, p_fim date, p_aeronave uuid default null)
  returns uuid
  language sql stable as
$$
  select s.socio_id
  from semanas s
  where s.aeronave_id = coalesce(p_aeronave, (select id from aeronaves where ativo order by created_at limit 1))
    and s.socio_id is not null and s.socio_id <> p_socio
    and s.inicio <= p_fim and s.fim >= p_inicio
    and not bloco_liberado(s.id)
  order by s.inicio
  limit 1
$$;

-- Pedidos pendentes num bloco de que o titular desistiu: confirma.
create or replace function liberar_pedidos_do_bloco(p_aeronave uuid, p_socio uuid, p_inicio date, p_fim date)
  returns uuid[]
  language plpgsql security definer set search_path = public as
$$
declare v_ids uuid[];
begin
  with blocos as (
    select s.inicio, s.fim
    from semanas s
    where s.aeronave_id = p_aeronave and s.socio_id = p_socio
      and s.inicio <= p_fim and s.fim >= p_inicio
      and bloco_liberado(s.id)
  ), liberadas as (
    update reservas r set pendente = false
    from blocos b
    where r.aeronave_id = p_aeronave and r.status = 'CONFIRMADA' and r.pendente and not r.feriado
      and r.socio_id <> p_socio
      and r.inicio <= b.fim and r.fim >= b.inicio
      and not exists (select 1 from reserva_respostas x where x.reserva_id = r.id and not x.concorda)
    returning r.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from liberadas;
  return v_ids;
end $$;

-- Cancelar pela RPC: confirma na hora quem esperava aquele período.
create or replace function cancelar_reserva(p_id uuid) returns uuid[]
  language plpgsql security definer set search_path = public as
$$
declare r reservas%rowtype; v_meu uuid;
begin
  select * into r from reservas where id = p_id and status = 'CONFIRMADA';
  if not found then raise exception 'Reserva não encontrada.'; end if;
  select id into v_meu from socios where usuario_id = auth.uid();
  if not (sou_admin() or r.socio_id = v_meu) then
    raise exception 'Só quem reservou (ou o administrador) cancela.';
  end if;

  update reservas set status = 'CANCELADA', cancelada_em = now(), cancelada_por = auth.uid() where id = p_id;
  return liberar_pedidos_do_bloco(r.aeronave_id, r.socio_id, r.inicio, r.fim);
end $$;

-- Reservar: bloco de quem desistiu não vira pedido.
create or replace function reservar(p_inicio date, p_fim date, p_destino text, p_motivo text, p_socio uuid default null) returns uuid
  language plpgsql security definer set search_path = public as
$$
declare v_socio uuid; v_aeronave uuid; v_id uuid; v_proprio boolean; v_livre boolean;
begin
  select id into v_socio from socios where usuario_id = auth.uid();
  if p_socio is not null and p_socio <> coalesce(v_socio, p_socio) and not sou_admin() then
    raise exception 'Só o administrador reserva em nome de outro sócio.';
  end if;
  if p_socio is not null and sou_admin() then v_socio := p_socio; end if;
  if v_socio is null then raise exception 'Só sócio reserva.'; end if;
  if p_inicio < current_date then raise exception 'Reserva no passado.'; end if;
  select id into v_aeronave from aeronaves where ativo order by created_at limit 1;
  perform conferir_reserva(v_aeronave, v_socio, p_inicio, p_fim, null);
  perform assumir_blocos_livres(v_aeronave, v_socio, p_inicio, p_fim);
  v_proprio := dentro_dos_blocos(v_aeronave, v_socio, p_inicio, p_fim);
  -- todo o período é de blocos de que os donos desistiram (ou sem dono)?
  v_livre := not exists (
    select 1 from semanas s
    where s.aeronave_id = v_aeronave and s.socio_id is not null and s.socio_id <> v_socio
      and s.inicio <= p_fim and s.fim >= p_inicio and not bloco_liberado(s.id)
  ) and exists (
    select 1 from semanas s
    where s.aeronave_id = v_aeronave and s.socio_id is not null and s.socio_id <> v_socio
      and s.inicio <= p_fim and s.fim >= p_inicio
  );

  insert into reservas (aeronave_id, socio_id, inicio, fim, destino, motivo, origem, pendente, feriado, autor_id)
  values (v_aeronave, v_socio, p_inicio, p_fim, p_destino, p_motivo,
          case when v_proprio then 'SEMANA' else 'LIVRE' end::origem_reserva,
          not (v_proprio or v_livre),
          not (v_proprio or v_livre) and periodo_tem_feriado(p_inicio, p_fim), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

notify pgrst, 'reload schema';
