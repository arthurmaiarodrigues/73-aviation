-- =====================================================================
-- schema_v7b_direito_do_mes.sql — quem ainda não usou o direito do mês
-- reserva bloco livre direto (Arthur, 19/09/2026).
-- Rodar no SQL Editor depois do schema_v7. Idempotente.
--
-- Reserva em dias de bloco LIVRE por sócio que ainda não escolheu bloco
-- daquele tipo no mês: o bloco passa a ser dele (conta como a escolha) e a
-- reserva confirma na hora. Só vira PEDIDO quando o sócio já usou o direito
-- daquele tipo no mês (ou quando os dias são de outro sócio — aí nem entra).
-- =====================================================================

-- Assume os blocos livres do período cujo direito o sócio ainda não usou.
create or replace function assumir_blocos_livres(p_aeronave uuid, p_socio uuid, p_inicio date, p_fim date) returns void
  language plpgsql security definer set search_path = public as
$$
declare b record; e escolha_semanas%rowtype; v_ja boolean;
begin
  for b in select * from semanas where aeronave_id = p_aeronave and inicio <= p_fim and fim >= p_inicio and socio_id is null order by inicio loop
    -- já tem bloco desse tipo no mês do bloco? então este fica de fora (vira pedido)
    select exists (select 1 from semanas x where x.aeronave_id = p_aeronave and x.mes = b.mes and x.tipo = b.tipo and x.socio_id = p_socio) into v_ja;
    if v_ja then continue; end if;

    update semanas set socio_id = p_socio, cedida_por = null, cedida_em = null where id = b.id;
    select * into e from escolha_semanas where aeronave_id = p_aeronave and mes = b.mes and socio_id = p_socio;
    if found then
      if b.tipo = 'SEMANA' then
        update escolha_semanas set semana_id = b.id, escolhido_em = coalesce(escolhido_em, now()) where id = e.id and semana_id is null;
      else
        update escolha_semanas set fds_id = b.id, escolhido_em = coalesce(escolhido_em, now()) where id = e.id and fds_id is null;
      end if;
      perform vez_de_escolher(p_aeronave, b.mes);
    end if;
  end loop;
end $$;

create or replace function reservar(p_inicio date, p_fim date, p_destino text, p_motivo text, p_socio uuid default null) returns uuid
  language plpgsql security definer set search_path = public as
$$
declare v_socio uuid; v_aeronave uuid; v_id uuid; v_proprio boolean;
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
  -- direito do mês ainda não usado: o bloco livre passa a ser dele
  perform assumir_blocos_livres(v_aeronave, v_socio, p_inicio, p_fim);
  v_proprio := dentro_dos_blocos(v_aeronave, v_socio, p_inicio, p_fim);

  insert into reservas (aeronave_id, socio_id, inicio, fim, destino, motivo, origem, pendente, feriado, autor_id)
  values (v_aeronave, v_socio, p_inicio, p_fim, p_destino, p_motivo,
          case when v_proprio then 'SEMANA' else 'LIVRE' end::origem_reserva,
          not v_proprio, (not v_proprio) and periodo_tem_feriado(p_inicio, p_fim), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function editar_reserva(p_id uuid, p_inicio date, p_fim date, p_destino text, p_motivo text, p_socio uuid default null) returns void
  language plpgsql security definer set search_path = public as
$$
declare r reservas%rowtype; v_meu uuid; v_socio uuid; v_proprio boolean; v_mudou boolean;
begin
  select * into r from reservas where id = p_id and status = 'CONFIRMADA';
  if not found then raise exception 'Reserva não encontrada.'; end if;
  select id into v_meu from socios where usuario_id = auth.uid();
  if not (sou_admin() or r.socio_id = v_meu) then raise exception 'Só quem reservou (ou o administrador) edita.'; end if;
  v_socio := case when sou_admin() and p_socio is not null then p_socio else r.socio_id end;
  perform conferir_reserva(r.aeronave_id, v_socio, p_inicio, p_fim, p_id);
  perform assumir_blocos_livres(r.aeronave_id, v_socio, p_inicio, p_fim);
  v_proprio := dentro_dos_blocos(r.aeronave_id, v_socio, p_inicio, p_fim);
  v_mudou := (r.inicio, r.fim, r.socio_id) is distinct from (p_inicio, p_fim, v_socio);
  update reservas set socio_id = v_socio, inicio = p_inicio, fim = p_fim, destino = p_destino, motivo = p_motivo,
    origem = case when v_proprio then 'SEMANA' else 'LIVRE' end::origem_reserva,
    pendente = case when v_proprio then false when v_mudou then true else r.pendente end,
    feriado = (not v_proprio) and periodo_tem_feriado(p_inicio, p_fim)
  where id = p_id;
  if v_mudou then delete from reserva_respostas where reserva_id = p_id; end if;
end $$;

-- Pedidos já abertos que caem na regra nova: o bloco vira do sócio e confirma.
do $$
declare p record;
begin
  for p in select * from reservas where status = 'CONFIRMADA' and pendente and fim >= current_date loop
    perform assumir_blocos_livres(p.aeronave_id, p.socio_id, p.inicio, p.fim);
    if dentro_dos_blocos(p.aeronave_id, p.socio_id, p.inicio, p.fim) then
      update reservas set pendente = false, feriado = false, origem = 'SEMANA' where id = p.id;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
