-- =====================================================================
-- schema_v34_agenda_sem_dono.sql — a agenda deixa de ter "semana de
-- fulano": cada sócio tem direito a UMA semana (seg–qui) e UM fim de
-- semana (sex–dom) por mês, e marca quando quiser, por ordem de chegada.
-- Rodar no SQL Editor depois do v33. Idempotente.
--
-- Regra nova (decisão do Arthur em 17/10/2026):
--   · enquanto o direito daquele tipo não foi usado no mês, a reserva
--     CONFIRMA na hora — não existe dono do período para consultar;
--   · usado o direito, a reserva vira PEDIDO aos outros sócios (qualquer
--     "preciso" cancela; todos concordando confirma; 48 h sem resposta
--     confirma, menos em feriado);
--   · quem marcar primeiro leva: período já reservado barra.
--
-- Some a fila de escolha, o dono do bloco e a troca de semanas. As
-- tabelas continuam lá (histórico), só não mandam mais em nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Que direitos o período usa: seg–qui = SEMANA, sex–dom = FDS.
-- Um período que pega os dois (ex.: qui a sáb) usa os dois.
-- ---------------------------------------------------------------------
create or replace function tipos_do_periodo(p_inicio date, p_fim date) returns text[]
  language sql immutable as
$$
  select array_remove(array[
    (select 'SEMANA' from generate_series(p_inicio, p_fim, interval '1 day') d
      where extract(isodow from d) between 1 and 4 limit 1),
    (select 'FDS' from generate_series(p_inicio, p_fim, interval '1 day') d
      where extract(isodow from d) between 5 and 7 limit 1)
  ], null)
$$;

-- Direitos que o sócio já usou no mês (reserva confirmada, não pendente).
create or replace function direitos_usados(p_aeronave uuid, p_socio uuid, p_mes date, p_ignorar uuid default null)
  returns text[]
  language sql stable as
$$
  select coalesce(array_agg(distinct t), '{}')
  from reservas r
  cross join lateral unnest(tipos_do_periodo(r.inicio, r.fim)) t
  where r.aeronave_id = p_aeronave and r.socio_id = p_socio
    and r.status = 'CONFIRMADA' and not r.pendente
    and date_trunc('month', r.inicio)::date = date_trunc('month', p_mes)::date
    and (p_ignorar is null or r.id <> p_ignorar)
$$;

-- ---------------------------------------------------------------------
-- Conferência: bloqueio (com a mensagem certa), documento e sobreposição.
-- A versão de 5 argumentos (com sócio) existe desde o v20 e é a que o
-- `reservar` chama — as duas passam a dizer a mesma coisa.
-- ---------------------------------------------------------------------
create or replace function conferir_reserva(
  p_aeronave uuid, p_socio uuid, p_inicio date, p_fim date, p_ignorar uuid default null
) returns void
  language plpgsql security definer set search_path = public as
$$
begin
  perform conferir_reserva(p_aeronave, p_inicio, p_fim, p_ignorar);
end $$;

-- ---------------------------------------------------------------------
-- Reservar: confirma enquanto houver direito; senão vira pedido.
-- ---------------------------------------------------------------------
create or replace function reservar(p_inicio date, p_fim date, p_destino text, p_motivo text, p_socio uuid default null) returns uuid
  language plpgsql security definer set search_path = public as
$$
declare
  v_socio uuid; v_aeronave uuid; v_id uuid;
  v_tipos text[]; v_usados text[]; v_tem_direito boolean;
begin
  select id into v_socio from socios where usuario_id = auth.uid();
  if p_socio is not null and p_socio <> coalesce(v_socio, p_socio) and not sou_admin() then
    raise exception 'Só o administrador reserva em nome de outro sócio.';
  end if;
  if p_socio is not null and sou_admin() then v_socio := p_socio; end if;
  if v_socio is null then raise exception 'Só sócio reserva.'; end if;
  if p_inicio < current_date then raise exception 'Reserva no passado.'; end if;

  select id into v_aeronave from aeronaves where ativo order by created_at limit 1;
  perform conferir_reserva(v_aeronave, p_inicio, p_fim, null);

  v_tipos := tipos_do_periodo(p_inicio, p_fim);
  v_usados := direitos_usados(v_aeronave, v_socio, p_inicio);
  -- tem direito se nenhum dos tipos do período já foi usado no mês
  v_tem_direito := not exists (select 1 from unnest(v_tipos) t where t = any(v_usados));

  insert into reservas (aeronave_id, socio_id, inicio, fim, destino, motivo, origem, pendente, feriado, autor_id)
  values (v_aeronave, v_socio, p_inicio, p_fim, p_destino, p_motivo,
          case when v_tem_direito then 'SEMANA' else 'LIVRE' end::origem_reserva,
          not v_tem_direito,
          not v_tem_direito and periodo_tem_feriado(p_inicio, p_fim), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Pedido: a palavra é dos outros sócios, não de um "titular".
-- ---------------------------------------------------------------------
create or replace function responder_pedido(p_reserva uuid, p_concorda boolean) returns void
  language plpgsql security definer set search_path = public as
$$
declare r reservas%rowtype; v_meu uuid; v_outros int; v_sim int; v_nao int; v_quem text;
begin
  select id into v_meu from socios where usuario_id = auth.uid();
  if v_meu is null then raise exception 'Só sócio responde.'; end if;
  select * into r from reservas where id = p_reserva and status = 'CONFIRMADA' and pendente;
  if not found then raise exception 'Esse pedido já foi resolvido.'; end if;
  if r.socio_id = v_meu then raise exception 'O pedido é seu.'; end if;

  insert into reserva_respostas (reserva_id, socio_id, concorda) values (p_reserva, v_meu, p_concorda)
  on conflict (reserva_id, socio_id) do update set concorda = excluded.concorda, em = now();

  select count(*) into v_outros from socios_ativos_em(r.inicio) s where s.socio_id <> r.socio_id;
  select count(*) filter (where concorda), count(*) filter (where not concorda) into v_sim, v_nao
  from reserva_respostas where reserva_id = p_reserva;

  if v_nao > 0 then
    select string_agg(s.apelido, ', ') into v_quem
    from reserva_respostas rr join socios s on s.id = rr.socio_id
    where rr.reserva_id = p_reserva and not rr.concorda;
    update reservas set status = 'CANCELADA', cancelada_em = now(), cancelada_por = auth.uid(),
      motivo = left(coalesce(motivo || ' · ', '') || 'NEGADO: ' || v_quem || ' PRECISA DO AVIÃO', 200)
    where id = p_reserva;
  elsif v_sim >= v_outros then
    update reservas set pendente = false where id = p_reserva;
  end if;
end $$;

-- 48 h sem ninguém dizer que precisa: confirma. Feriado, nunca sozinho.
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
    returning r.id
  )
  select array_agg(id) into v_ids from liberadas;
  return coalesce(v_ids, '{}');
end $$;

-- Editar segue a mesma régua do lançar.
create or replace function editar_reserva(p_id uuid, p_inicio date, p_fim date, p_destino text, p_motivo text, p_socio uuid default null) returns void
  language plpgsql security definer set search_path = public as
$$
declare r reservas%rowtype; v_meu uuid; v_socio uuid; v_mudou boolean; v_tipos text[]; v_usados text[]; v_tem_direito boolean;
begin
  select * into r from reservas where id = p_id and status = 'CONFIRMADA';
  if not found then raise exception 'Reserva não encontrada.'; end if;
  select id into v_meu from socios where usuario_id = auth.uid();
  if not (sou_admin() or r.socio_id = v_meu) then raise exception 'Só quem reservou (ou o administrador) edita.'; end if;
  v_socio := case when sou_admin() and p_socio is not null then p_socio else r.socio_id end;

  perform conferir_reserva(r.aeronave_id, p_inicio, p_fim, p_id);

  v_tipos := tipos_do_periodo(p_inicio, p_fim);
  v_usados := direitos_usados(r.aeronave_id, v_socio, p_inicio, p_id);
  v_tem_direito := not exists (select 1 from unnest(v_tipos) t where t = any(v_usados));
  v_mudou := (r.inicio, r.fim, r.socio_id) is distinct from (p_inicio, p_fim, v_socio);

  update reservas set socio_id = v_socio, inicio = p_inicio, fim = p_fim, destino = p_destino, motivo = p_motivo,
    origem = case when v_tem_direito then 'SEMANA' else 'LIVRE' end::origem_reserva,
    pendente = case when v_tem_direito then false when v_mudou then true else r.pendente end,
    feriado = (not v_tem_direito) and periodo_tem_feriado(p_inicio, p_fim)
  where id = p_id;
  if v_mudou then delete from reserva_respostas where reserva_id = p_id; end if;
end $$;

-- ---------------------------------------------------------------------
-- Sem dono: os blocos do calendário ficam sem sócio e a fila para de
-- valer. As tabelas seguem para histórico.
-- ---------------------------------------------------------------------
update semanas set socio_id = null, cedida_por = null, cedida_em = null where socio_id is not null;

-- Filas abertas (mês corrente e futuros) deixam de existir: a vez não passa mais por ninguém.
delete from escolha_semanas where mes >= date_trunc('month', current_date)::date;

-- Pedido que só dependia de um "titular" agora depende dos outros sócios: recomeça o relógio das 48 h.
update reservas set created_at = now()
where status = 'CONFIRMADA' and pendente and fim >= current_date and created_at < now() - interval '48 hours';

-- A escolha não abre mais sozinha (o app parou de chamar; aqui é rede de segurança).
create or replace function abrir_escolha(p_aeronave uuid, p_mes date) returns void
  language plpgsql security definer set search_path = public as
$$
begin
  perform gerar_semanas(p_aeronave, date_trunc('month', p_mes)::date);
end $$;

notify pgrst, 'reload schema';
