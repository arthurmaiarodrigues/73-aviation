-- =====================================================================
-- schema_v32_piloto_indisponivel.sql — o piloto marca os dias em que
-- não está disponível (recesso, férias, compromisso).
-- Rodar no SQL Editor depois do v31. Idempotente.
--
-- Vira um bloqueio do tipo PILOTO na agenda: o período aparece pintado
-- no calendário e ninguém reserva esses dias. O próprio piloto libera
-- quando quiser; o administrador também.
-- =====================================================================

-- Novo tipo de bloqueio (o enum não aceita add value dentro de bloco).
alter type tipo_bloqueio add value if not exists 'PILOTO';

alter table bloqueios add column if not exists piloto_id uuid references pilotos(id);

-- ---------------------------------------------------------------------
-- O piloto marca a própria indisponibilidade.
-- ---------------------------------------------------------------------
create or replace function marcar_indisponivel(p_inicio date, p_fim date, p_motivo text)
  returns uuid
  language plpgsql security definer set search_path = public as
$$
declare v_piloto uuid; v_aeronave uuid; v_id uuid; v_nome text;
begin
  v_piloto := meu_piloto_id();
  if v_piloto is null and not sou_admin() then
    raise exception 'Só o piloto cadastrado (ou o administrador) marca indisponibilidade.';
  end if;
  if p_fim < p_inicio then raise exception 'O fim não pode ser antes do início.'; end if;
  if p_fim - p_inicio > 180 then raise exception 'Período muito longo (máximo 180 dias).'; end if;
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'Diga o motivo (recesso, férias, compromisso).'; end if;

  select id into v_aeronave from aeronaves where ativo order by created_at limit 1;
  select nome into v_nome from pilotos where id = v_piloto;

  insert into bloqueios (aeronave_id, inicio, fim, tipo, motivo, piloto_id, autor_id)
  values (v_aeronave, p_inicio, p_fim, 'PILOTO',
          coalesce(v_nome || ' — ', '') || btrim(p_motivo), v_piloto, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- O piloto libera o que ele mesmo marcou; o admin libera qualquer um.
create or replace function liberar_indisponivel(p_bloqueio uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare b bloqueios%rowtype;
begin
  select * into b from bloqueios where id = p_bloqueio and deleted_at is null;
  if not found then raise exception 'Bloqueio não encontrado.'; end if;
  if not (sou_admin() or (b.tipo = 'PILOTO' and b.piloto_id = meu_piloto_id())) then
    raise exception 'Só quem marcou (ou o administrador) libera este período.';
  end if;
  update bloqueios set deleted_at = now() where id = p_bloqueio;
end $$;

-- ---------------------------------------------------------------------
-- Mensagem certa ao tentar reservar: hoje fala sempre em manutenção.
-- ---------------------------------------------------------------------
create or replace function conferir_reserva(
  p_aeronave uuid, p_inicio date, p_fim date, p_ignorar uuid default null
) returns void
  language plpgsql security definer set search_path = public as
$$
declare r record; v_doc text; v_quem text; v_bloq record;
begin
  if p_fim < p_inicio then raise exception 'Fim antes do início.'; end if;
  if p_fim - p_inicio > 30 then raise exception 'Reserva de mais de 30 dias? Fale com o administrador.'; end if;
  if p_inicio > current_date + 60 then raise exception 'Reserva só até 60 dias à frente (até %).', to_char(current_date + 60, 'DD/MM/YYYY'); end if;

  select * into v_bloq from bloqueios
   where aeronave_id = p_aeronave and deleted_at is null and inicio <= p_fim and fim >= p_inicio
   order by case when tipo = 'PILOTO' then 1 else 0 end limit 1;
  if found then
    if v_bloq.tipo = 'PILOTO' then
      raise exception 'Piloto indisponível de % a %: %.',
        to_char(v_bloq.inicio, 'DD/MM'), to_char(v_bloq.fim, 'DD/MM'), v_bloq.motivo;
    else
      raise exception 'O avião está bloqueado nesse período (%).', lower(v_bloq.motivo);
    end if;
  end if;

  v_doc := documento_vencido_em(p_aeronave, p_fim);
  if v_doc is not null then raise exception 'Documento vencido no período: %. Renove antes de reservar.', v_doc; end if;

  select s.apelido || case when re.pendente then ' — pedido aguardando' else '' end into v_quem
  from reservas re join socios s on s.id = re.socio_id
  where re.aeronave_id = p_aeronave and re.status = 'CONFIRMADA' and re.inicio <= p_fim and re.fim >= p_inicio
    and (p_ignorar is null or re.id <> p_ignorar)
  limit 1;
  if v_quem is not null then raise exception 'Já há reserva de % nesse período.', v_quem; end if;
end $$;

notify pgrst, 'reload schema';
