-- =====================================================================
-- schema_v6d_reserva_duplicada.sql — reserva não pode sobrepor outra
-- reserva confirmada, nem do mesmo sócio (evita a duplicada do "clicou
-- duas vezes"). Rodar no SQL Editor depois do schema_v6c. Idempotente.
-- =====================================================================

create or replace function conferir_reserva(p_aeronave uuid, p_socio uuid, p_inicio date, p_fim date, p_ignorar uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare r record; v_doc text; v_quem text;
begin
  if p_fim < p_inicio then raise exception 'Fim antes do início.'; end if;
  if p_fim - p_inicio > 30 then raise exception 'Reserva de mais de 30 dias? Fale com o administrador.'; end if;
  if exists (select 1 from bloqueios where aeronave_id = p_aeronave and deleted_at is null and inicio <= p_fim and fim >= p_inicio) then
    raise exception 'O avião está bloqueado nesse período (manutenção ou documento).';
  end if;
  v_doc := documento_vencido_em(p_aeronave, p_fim);
  if v_doc is not null then raise exception 'Documento vencido no período: %. Renove antes de reservar.', v_doc; end if;
  select s.apelido into v_quem
  from reservas re join socios s on s.id = re.socio_id
  where re.aeronave_id = p_aeronave and re.status = 'CONFIRMADA' and re.inicio <= p_fim and re.fim >= p_inicio
    and (p_ignorar is null or re.id <> p_ignorar)
  limit 1;
  if v_quem is not null then
    raise exception 'Já existe reserva nesse período (%). Cancele ou edite a reserva existente.', v_quem;
  end if;
  for r in select * from semanas where aeronave_id = p_aeronave and inicio <= p_fim and fim >= p_inicio and socio_id is not null loop
    if r.socio_id <> p_socio then
      raise exception 'De % a % a semana é de outro sócio.', to_char(r.inicio, 'DD/MM'), to_char(r.fim, 'DD/MM');
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
