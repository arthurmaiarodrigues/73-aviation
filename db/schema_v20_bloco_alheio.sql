-- =====================================================================
-- schema_v20_bloco_alheio.sql — semana do outro deixa de ser muro.
-- Rodar no SQL Editor depois do v19. Idempotente.
--
-- Antes: reservar dentro do bloco (semana/fim de semana) de outro sócio
-- era recusado. Agora vira PEDIDO AO TITULAR: ele diz "preciso" (cancela)
-- ou "pode usar" (confirma na hora). Se não responder em 48 h e não tiver
-- reserva nenhuma naquele bloco — ou seja, não vai usar —, libera.
-- =====================================================================

-- Quem é o dono do bloco no período (outro sócio), se houver.
create or replace function titular_do_periodo(p_socio uuid, p_inicio date, p_fim date, p_aeronave uuid default null)
  returns uuid
  language sql stable as
$$
  select s.socio_id
  from semanas s
  where s.aeronave_id = coalesce(p_aeronave, (select id from aeronaves where ativo order by created_at limit 1))
    and s.socio_id is not null and s.socio_id <> p_socio
    and s.inicio <= p_fim and s.fim >= p_inicio
  order by s.inicio
  limit 1
$$;

-- Conferência sem o muro: o bloco do outro vira pedido, não erro.
create or replace function conferir_reserva(p_aeronave uuid, p_socio uuid, p_inicio date, p_fim date, p_ignorar uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare v_doc text; v_quem text;
begin
  if p_fim < p_inicio then raise exception 'Fim antes do início.'; end if;
  if p_fim - p_inicio > 30 then raise exception 'Reserva de mais de 30 dias? Fale com o administrador.'; end if;
  if p_inicio > current_date + 60 then raise exception 'Reserva só até 60 dias à frente (até %).', to_char(current_date + 60, 'DD/MM/YYYY'); end if;
  if exists (select 1 from bloqueios where aeronave_id = p_aeronave and deleted_at is null and inicio <= p_fim and fim >= p_inicio) then
    raise exception 'O avião está bloqueado nesse período (manutenção ou documento).';
  end if;
  v_doc := documento_vencido_em(p_aeronave, p_fim);
  if v_doc is not null then raise exception 'Documento vencido no período: %. Renove antes de reservar.', v_doc; end if;
  select s.apelido || case when re.pendente then ' — pedido aguardando' else '' end into v_quem
  from reservas re join socios s on s.id = re.socio_id
  where re.aeronave_id = p_aeronave and re.status = 'CONFIRMADA' and re.inicio <= p_fim and re.fim >= p_inicio
    and (p_ignorar is null or re.id <> p_ignorar)
  limit 1;
  if v_quem is not null then
    raise exception 'Já existe reserva nesse período (%). Cancele ou edite a reserva existente.', v_quem;
  end if;
end $$;

-- Quem responde: no bloco de alguém, só o titular; fora dele, os outros sócios.
create or replace function responder_pedido(p_reserva uuid, p_concorda boolean) returns void
  language plpgsql security definer set search_path = public as
$$
declare r reservas%rowtype; v_meu uuid; v_titular uuid; v_outros int; v_sim int; v_nao int; v_quem text;
begin
  select id into v_meu from socios where usuario_id = auth.uid();
  if v_meu is null then raise exception 'Só sócio responde.'; end if;
  select * into r from reservas where id = p_reserva and status = 'CONFIRMADA' and pendente;
  if not found then raise exception 'Esse pedido já foi resolvido.'; end if;
  if r.socio_id = v_meu then raise exception 'O pedido é seu.'; end if;

  v_titular := titular_do_periodo(r.socio_id, r.inicio, r.fim, r.aeronave_id);

  insert into reserva_respostas (reserva_id, socio_id, concorda) values (p_reserva, v_meu, p_concorda)
  on conflict (reserva_id, socio_id) do update set concorda = excluded.concorda, em = now();

  -- período dentro do bloco de um sócio: a palavra é dele
  if v_titular is not null then
    if v_meu <> v_titular then
      raise exception 'Esse período é da semana de outro sócio — só ele responde.';
    end if;
    if p_concorda then
      update reservas set pendente = false where id = p_reserva;
    else
      select apelido into v_quem from socios where id = v_meu;
      update reservas set status = 'CANCELADA', cancelada_em = now(), cancelada_por = auth.uid(),
        motivo = left(coalesce(motivo || ' · ', '') || 'NEGADO: ' || v_quem || ' PRECISA DO AVIÃO', 200)
      where id = p_reserva;
    end if;
    return;
  end if;

  select count(*) into v_outros from socios_ativos_em(r.inicio) s where s.socio_id <> r.socio_id;
  select count(*) filter (where concorda), count(*) filter (where not concorda) into v_sim, v_nao from reserva_respostas where reserva_id = p_reserva;
  if v_nao > 0 then
    select string_agg(s.apelido, ', ') into v_quem from reserva_respostas rr join socios s on s.id = rr.socio_id where rr.reserva_id = p_reserva and not rr.concorda;
    update reservas set status = 'CANCELADA', cancelada_em = now(), cancelada_por = auth.uid(),
      motivo = left(coalesce(motivo || ' · ', '') || 'NEGADO: ' || v_quem || ' PRECISA DO AVIÃO', 200)
    where id = p_reserva;
  elsif v_sim >= v_outros then
    update reservas set pendente = false where id = p_reserva;
  end if;
end $$;

-- 48 h sem objeção libera. No bloco de alguém, só se o titular não tiver
-- nenhuma reserva ali (sinal de que não vai usar). Feriado continua exigindo
-- a concordância de todos.
create or replace function resolver_pedidos(p_aeronave uuid) returns uuid[]
  language plpgsql security definer set search_path = public as
$$
declare v_ids uuid[];
begin
  with liberadas as (
    update reservas r set pendente = false
    where r.aeronave_id = p_aeronave and r.status = 'CONFIRMADA' and r.pendente and not r.feriado
      and r.created_at < now() - interval '48 hours'
      and not exists (select 1 from reserva_respostas x where x.reserva_id = r.id and not x.concorda)
      and not exists (
        -- o titular do bloco já marcou alguma coisa dentro do bloco dele: espera a resposta dele
        select 1
        from semanas s
        join reservas outra
          on outra.aeronave_id = r.aeronave_id and outra.status = 'CONFIRMADA'
         and outra.socio_id = s.socio_id and outra.inicio <= s.fim and outra.fim >= s.inicio
        where s.aeronave_id = r.aeronave_id and s.socio_id is not null and s.socio_id <> r.socio_id
          and s.inicio <= r.fim and s.fim >= r.inicio
      )
    returning r.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from liberadas;
  return v_ids;
end $$;

notify pgrst, 'reload schema';
