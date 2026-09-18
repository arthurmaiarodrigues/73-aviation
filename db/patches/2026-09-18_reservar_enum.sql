-- Reserva de dias: dentro de semana com titular só o titular; sem titular
-- vale ordem de chegada; nunca sobre bloqueio nem sobre outra reserva.
-- ---------------------------------------------------------------------
create or replace function reservar(p_inicio date, p_fim date, p_destino text, p_motivo text) returns uuid
  language plpgsql security definer set search_path = public as
$$
declare v_socio uuid; v_aeronave uuid; v_id uuid; r record;
begin
  select id into v_socio from socios where usuario_id = auth.uid();
  if v_socio is null then raise exception 'Só sócio reserva.'; end if;
  if p_fim < p_inicio then raise exception 'Fim antes do início.'; end if;
  if p_inicio < current_date then raise exception 'Reserva no passado.'; end if;
  if p_fim - p_inicio > 30 then raise exception 'Reserva de mais de 30 dias? Fale com o administrador.'; end if;
  select id into v_aeronave from aeronaves where ativo order by created_at limit 1;

  if exists (select 1 from bloqueios where aeronave_id = v_aeronave and deleted_at is null and inicio <= p_fim and fim >= p_inicio) then
    raise exception 'O avião está bloqueado nesse período (manutenção ou documento).';
  end if;
  if exists (select 1 from reservas where aeronave_id = v_aeronave and status = 'CONFIRMADA' and inicio <= p_fim and fim >= p_inicio and socio_id <> v_socio) then
    raise exception 'Já existe reserva de outro sócio nesse período.';
  end if;
  -- Semana com titular: só ele.
  for r in select * from semanas where aeronave_id = v_aeronave and inicio <= p_fim and fim >= p_inicio and socio_id is not null loop
    if r.socio_id <> v_socio then
      raise exception 'De % a % a semana é de outro sócio.', to_char(r.inicio, 'DD/MM'), to_char(r.fim, 'DD/MM');
    end if;
  end loop;

  insert into reservas (aeronave_id, socio_id, inicio, fim, destino, motivo, origem, autor_id)
  values (v_aeronave, v_socio, p_inicio, p_fim, p_destino, p_motivo,
          case when exists (select 1 from semanas where aeronave_id = v_aeronave and inicio <= p_inicio and fim >= p_inicio and socio_id = v_socio) then 'SEMANA' else 'LIVRE' end::origem_reserva,
          auth.uid())
  returning id into v_id;
  return v_id;
end $$;
notify pgrst, 'reload schema';
