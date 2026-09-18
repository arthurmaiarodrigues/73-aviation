-- Escolher a semana: só na vez (ou depois de pulado), só semana livre,
-- só uma por mês. Roda como o sócio logado.
-- ---------------------------------------------------------------------
create or replace function escolher_semana(p_semana uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare v_socio uuid; s semanas%rowtype; e escolha_semanas%rowtype; v_vez uuid;
begin
  select id into v_socio from socios where usuario_id = auth.uid();
  if v_socio is null then raise exception 'Só sócio escolhe semana.'; end if;

  select * into s from semanas where id = p_semana;
  if not found then raise exception 'Semana não encontrada.'; end if;
  if s.socio_id is not null then raise exception 'Essa semana já tem titular.'; end if;
  if s.fim < current_date then raise exception 'Essa semana já passou.'; end if;
  if exists (select 1 from reservas r where r.aeronave_id = s.aeronave_id and r.status = 'CONFIRMADA'
                and r.socio_id <> v_socio and r.inicio <= s.fim and r.fim >= s.inicio) then
    raise exception 'Essa semana já tem reserva de outro sócio feita antes; escolha outra.';
  end if;

  select * into e from escolha_semanas where aeronave_id = s.aeronave_id and mes = s.mes and socio_id = v_socio;
  if not found then raise exception 'A escolha deste mês ainda não abriu para você.'; end if;
  if e.semana_id is not null then raise exception 'Você já escolheu a sua semana deste mês.'; end if;

  v_vez := vez_de_escolher(s.aeronave_id, s.mes);
  -- reler: vez_de_escolher pode ter marcado pulado
  select * into e from escolha_semanas where id = e.id;
  if coalesce(v_vez <> v_socio, true) and not e.pulado then
    raise exception 'Ainda não é a sua vez de escolher.';
  end if;

  update semanas set socio_id = v_socio, cedida_por = null, cedida_em = null where id = p_semana;
  update escolha_semanas set semana_id = p_semana, escolhido_em = now() where id = e.id;
  -- Reserva da semana inteira, para aparecer na disponibilidade.
  insert into reservas (aeronave_id, socio_id, inicio, fim, origem, motivo, autor_id)
  values (s.aeronave_id, v_socio, greatest(s.inicio, current_date), s.fim, 'SEMANA', 'SEMANA DO MÊS', auth.uid());
  -- O próximo da fila ganha o prazo dele.
  perform vez_de_escolher(s.aeronave_id, s.mes);
end $$;
notify pgrst, 'reload schema';
