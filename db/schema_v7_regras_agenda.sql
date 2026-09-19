-- =====================================================================
-- schema_v7_regras_agenda.sql — regras de uso da agenda (Arthur, 19/09/2026).
-- Rodar no SQL Editor depois do schema_v6d. Idempotente.
--
--  1. Cada sócio tem por mês UMA semana (seg–qui) e UM fim de semana
--     (sex–dom): os "blocos". A escolha continua por fila; na sua vez o
--     sócio escolhe um bloco de cada tipo.
--  2. Ordem da fila: menos USO nos 3 meses anteriores, onde uso =
--     dias reservados + horas voadas (a parte nos voos da sociedade conta).
--  3. Reserva fora dos seus blocos é um PEDIDO: fica pendente até os
--     outros sócios concordarem. Dia comum: 48 h sem ninguém dizer que
--     precisa = aprovado. Feriado prolongado / Natal / Ano Novo: só com o
--     "concordo" de todos os outros sócios. Qualquer "preciso" nega.
--  4. Reserva só até 60 dias à frente.
--  5. Troca de blocos entre sócios (mesmo tipo): um propõe, o outro aceita.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Blocos: semanas (seg–qui) e fins de semana (sex–dom)
-- ---------------------------------------------------------------------
alter table semanas add column if not exists tipo text not null default 'SEMANA';
alter table semanas drop constraint if exists semanas_segunda;
alter table semanas drop constraint if exists semanas_sete_dias;
alter table semanas drop constraint if exists semanas_bloco;

-- Converte as semanas antigas (seg–dom) em dois blocos.
do $$
declare s record;
begin
  for s in select * from semanas where fim = inicio + 6 loop
    update semanas set tipo = 'SEMANA', fim = inicio + 3 where id = s.id;
    insert into semanas (aeronave_id, mes, inicio, fim, tipo, socio_id, cedida_por, cedida_em)
    values (s.aeronave_id, s.mes, s.inicio + 4, s.inicio + 6, 'FDS', s.socio_id, s.cedida_por, s.cedida_em)
    on conflict (aeronave_id, inicio) do nothing;
  end loop;
end $$;

alter table semanas add constraint semanas_bloco check (
  (tipo = 'SEMANA' and extract(isodow from inicio) = 1 and fim = inicio + 3)
  or (tipo = 'FDS' and extract(isodow from inicio) = 5 and fim = inicio + 2)
);

alter table escolha_semanas add column if not exists fds_id uuid references semanas(id);
alter table escolha_semanas add column if not exists dias_base numeric(6,1) not null default 0;

create or replace function gerar_semanas(p_aeronave uuid, p_mes date) returns void
  language plpgsql security definer set search_path = public as
$$
declare v_mes date := date_trunc('month', p_mes)::date; v_seg date;
begin
  v_seg := v_mes + ((8 - extract(isodow from v_mes)::int) % 7);
  while v_seg < v_mes + interval '1 month' loop
    insert into semanas (aeronave_id, mes, inicio, fim, tipo) values (p_aeronave, v_mes, v_seg, v_seg + 3, 'SEMANA')
    on conflict (aeronave_id, inicio) do nothing;
    insert into semanas (aeronave_id, mes, inicio, fim, tipo) values (p_aeronave, v_mes, v_seg + 4, v_seg + 6, 'FDS')
    on conflict (aeronave_id, inicio) do nothing;
    v_seg := v_seg + 7;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Uso = dias reservados + horas voadas nos 3 meses anteriores
-- ---------------------------------------------------------------------
alter table reservas add column if not exists pendente boolean not null default false;
alter table reservas add column if not exists feriado boolean not null default false;

create or replace function dias_reservados_por_socio(p_aeronave uuid, p_inicio date, p_fim date)
  returns table (socio_id uuid, dias numeric)
  language sql stable as
$$
  select r.socio_id, sum(least(r.fim, p_fim) - greatest(r.inicio, p_inicio) + 1)::numeric
  from reservas r
  where r.aeronave_id = p_aeronave and r.status = 'CONFIRMADA' and not coalesce(r.pendente, false)
    and r.inicio <= p_fim and r.fim >= p_inicio
  group by r.socio_id
$$;

-- ---------------------------------------------------------------------
-- 3. Pedidos (reserva fora dos blocos), respostas e feriados
-- ---------------------------------------------------------------------
create table if not exists reserva_respostas (
  reserva_id  uuid not null references reservas(id) on delete cascade,
  socio_id    uuid not null references socios(id),
  concorda    boolean not null,
  em          timestamptz not null default now(),
  primary key (reserva_id, socio_id)
);
alter table reserva_respostas enable row level security;
drop policy if exists reserva_respostas_ler on reserva_respostas;
create policy reserva_respostas_ler on reserva_respostas for select using (meu_perfil() is not null);

create table if not exists feriados (
  data  date primary key,
  nome  text not null
);
alter table feriados enable row level security;
drop policy if exists feriados_ler on feriados;
create policy feriados_ler on feriados for select using (meu_perfil() is not null);
drop policy if exists feriados_admin on feriados;
create policy feriados_admin on feriados for all using (sou_admin()) with check (sou_admin());

insert into feriados (data, nome) values
  ('2026-01-01', 'ANO NOVO'), ('2026-02-16', 'CARNAVAL'), ('2026-02-17', 'CARNAVAL'), ('2026-04-03', 'SEXTA-FEIRA SANTA'),
  ('2026-04-21', 'TIRADENTES'), ('2026-05-01', 'DIA DO TRABALHO'), ('2026-06-04', 'CORPUS CHRISTI'), ('2026-07-02', 'INDEPENDÊNCIA DA BAHIA'),
  ('2026-09-07', 'INDEPENDÊNCIA'), ('2026-10-12', 'N. SRA. APARECIDA'), ('2026-11-02', 'FINADOS'), ('2026-11-15', 'PROCLAMAÇÃO DA REPÚBLICA'),
  ('2026-11-20', 'CONSCIÊNCIA NEGRA'), ('2026-12-24', 'NATAL'), ('2026-12-25', 'NATAL'), ('2026-12-26', 'NATAL'), ('2026-12-31', 'ANO NOVO'),
  ('2027-01-01', 'ANO NOVO'), ('2027-01-02', 'ANO NOVO'), ('2027-02-08', 'CARNAVAL'), ('2027-02-09', 'CARNAVAL'), ('2027-03-26', 'SEXTA-FEIRA SANTA'),
  ('2027-04-21', 'TIRADENTES'), ('2027-05-01', 'DIA DO TRABALHO'), ('2027-05-27', 'CORPUS CHRISTI'), ('2027-07-02', 'INDEPENDÊNCIA DA BAHIA'),
  ('2027-09-07', 'INDEPENDÊNCIA'), ('2027-10-12', 'N. SRA. APARECIDA'), ('2027-11-02', 'FINADOS'), ('2027-11-15', 'PROCLAMAÇÃO DA REPÚBLICA'),
  ('2027-11-20', 'CONSCIÊNCIA NEGRA'), ('2027-12-24', 'NATAL'), ('2027-12-25', 'NATAL'), ('2027-12-26', 'NATAL'), ('2027-12-31', 'ANO NOVO')
on conflict (data) do nothing;

-- Período pega feriado (ou o fim de semana emendado com ele)?
create or replace function periodo_tem_feriado(p_inicio date, p_fim date) returns boolean
  language sql stable as
$$
  select exists (select 1 from feriados f where f.data between p_inicio - 1 and p_fim + 1)
$$;

-- ---------------------------------------------------------------------
-- Fila: abre com uso = dias + horas
-- ---------------------------------------------------------------------
create or replace function abrir_escolha(p_aeronave uuid, p_mes date) returns void
  language plpgsql security definer set search_path = public as
$$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_de date := (v_mes - interval '3 months')::date;
  v_ate date := (v_mes - interval '1 day')::date;
  r record; v_ordem int := 0;
begin
  if exists (select 1 from escolha_semanas where aeronave_id = p_aeronave and mes = v_mes) then return; end if;
  perform gerar_semanas(p_aeronave, v_mes);

  for r in
    select s.socio_id, coalesce(h.horas, 0) as horas, coalesce(d.dias, 0) as dias,
           coalesce(e.ordem, 0) as ordem_anterior, so.apelido
    from socios_ativos_em(v_mes) s
    join socios so on so.id = s.socio_id
    left join horas_por_socio(p_aeronave, v_de, v_ate) h on h.socio_id = s.socio_id
    left join dias_reservados_por_socio(p_aeronave, v_de, v_ate) d on d.socio_id = s.socio_id
    left join escolha_semanas e on e.aeronave_id = p_aeronave and e.mes = (v_mes - interval '1 month')::date and e.socio_id = s.socio_id
    order by coalesce(h.horas, 0) + coalesce(d.dias, 0) asc, coalesce(e.ordem, 0) desc, so.apelido
  loop
    v_ordem := v_ordem + 1;
    insert into escolha_semanas (aeronave_id, mes, socio_id, ordem, horas_base, dias_base, prazo)
    values (p_aeronave, v_mes, r.socio_id, v_ordem, r.horas, r.dias, case when v_ordem = 1 then now() + interval '48 hours' end);
  end loop;
end $$;

-- De quem é a vez: primeiro da fila a quem ainda falta um bloco.
create or replace function vez_de_escolher(p_aeronave uuid, p_mes date) returns uuid
  language plpgsql security definer set search_path = public as
$$
declare v_mes date := date_trunc('month', p_mes)::date; r record;
begin
  loop
    select * into r from escolha_semanas
    where aeronave_id = p_aeronave and mes = v_mes and (semana_id is null or fds_id is null) and not pulado
    order by ordem limit 1;
    if not found then return null; end if;
    if r.prazo is null then
      update escolha_semanas set prazo = now() + interval '48 hours' where id = r.id;
      return r.socio_id;
    end if;
    if r.prazo < now() then
      update escolha_semanas set pulado = true where id = r.id;
      continue;
    end if;
    return r.socio_id;
  end loop;
end $$;

-- Escolher um bloco (semana ou fim de semana).
create or replace function escolher_semana(p_semana uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare v_socio uuid; s semanas%rowtype; e escolha_semanas%rowtype; v_vez uuid;
begin
  select id into v_socio from socios where usuario_id = auth.uid();
  if v_socio is null then raise exception 'Só sócio escolhe.'; end if;

  select * into s from semanas where id = p_semana;
  if not found then raise exception 'Bloco não encontrado.'; end if;
  if s.socio_id is not null then raise exception 'Esse período já tem titular.'; end if;
  if s.fim < current_date then raise exception 'Esse período já passou.'; end if;
  if exists (select 1 from reservas r where r.aeronave_id = s.aeronave_id and r.status = 'CONFIRMADA'
                and r.socio_id <> v_socio and r.inicio <= s.fim and r.fim >= s.inicio) then
    raise exception 'Esse período já tem reserva de outro sócio feita antes; escolha outro.';
  end if;

  select * into e from escolha_semanas where aeronave_id = s.aeronave_id and mes = s.mes and socio_id = v_socio;
  if not found then raise exception 'A escolha deste mês ainda não abriu para você.'; end if;
  if s.tipo = 'SEMANA' and e.semana_id is not null then raise exception 'Você já escolheu a sua semana (seg–qui) deste mês.'; end if;
  if s.tipo = 'FDS' and e.fds_id is not null then raise exception 'Você já escolheu o seu fim de semana deste mês.'; end if;

  v_vez := vez_de_escolher(s.aeronave_id, s.mes);
  select * into e from escolha_semanas where id = e.id;
  if coalesce(v_vez <> v_socio, true) and not e.pulado then
    raise exception 'Ainda não é a sua vez de escolher.';
  end if;

  update semanas set socio_id = v_socio, cedida_por = null, cedida_em = null where id = p_semana;
  if s.tipo = 'SEMANA' then
    update escolha_semanas set semana_id = p_semana, escolhido_em = now() where id = e.id;
  else
    update escolha_semanas set fds_id = p_semana, escolhido_em = now() where id = e.id;
  end if;
  insert into reservas (aeronave_id, socio_id, inicio, fim, origem, motivo, autor_id)
  values (s.aeronave_id, v_socio, greatest(s.inicio, current_date), s.fim, 'SEMANA',
          case when s.tipo = 'SEMANA' then 'SEMANA DO MÊS' else 'FIM DE SEMANA DO MÊS' end, auth.uid());
  perform vez_de_escolher(s.aeronave_id, s.mes);
end $$;

-- ---------------------------------------------------------------------
-- Reservar: dentro dos seus blocos confirma na hora; fora vira pedido.
-- ---------------------------------------------------------------------
create or replace function conferir_reserva(p_aeronave uuid, p_socio uuid, p_inicio date, p_fim date, p_ignorar uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare r record; v_doc text; v_quem text;
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
  for r in select * from semanas where aeronave_id = p_aeronave and inicio <= p_fim and fim >= p_inicio and socio_id is not null loop
    if r.socio_id <> p_socio then
      raise exception 'De % a % o período é de outro sócio.', to_char(r.inicio, 'DD/MM'), to_char(r.fim, 'DD/MM');
    end if;
  end loop;
end $$;

-- Todo o período está dentro dos blocos do sócio?
create or replace function dentro_dos_blocos(p_aeronave uuid, p_socio uuid, p_inicio date, p_fim date) returns boolean
  language sql stable as
$$
  select not exists (
    select 1 from generate_series(p_inicio, p_fim, interval '1 day') d
    where not exists (select 1 from semanas s where s.aeronave_id = p_aeronave and s.socio_id = p_socio and d::date between s.inicio and s.fim)
  )
$$;

drop function if exists reservar(date, date, text, text);
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
  v_proprio := dentro_dos_blocos(r.aeronave_id, v_socio, p_inicio, p_fim);
  v_mudou := (r.inicio, r.fim, r.socio_id) is distinct from (p_inicio, p_fim, v_socio);
  update reservas set socio_id = v_socio, inicio = p_inicio, fim = p_fim, destino = p_destino, motivo = p_motivo,
    origem = case when v_proprio then 'SEMANA' else 'LIVRE' end::origem_reserva,
    -- mudou o período fora dos blocos: volta a ser pedido
    pendente = case when v_proprio then false when v_mudou then true else r.pendente end,
    feriado = (not v_proprio) and periodo_tem_feriado(p_inicio, p_fim)
  where id = p_id;
  if v_mudou then delete from reserva_respostas where reserva_id = p_id; end if;
end $$;

-- Outros sócios respondem ao pedido; resolve na hora.
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

-- Dia comum: 48 h sem objeção = aprovado. Feriado: só com todos.
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
  select coalesce(array_agg(id), '{}') into v_ids from liberadas;
  return v_ids;
end $$;

-- ---------------------------------------------------------------------
-- 5. Trocas de bloco entre sócios
-- ---------------------------------------------------------------------
create table if not exists trocas (
  id            uuid primary key default gen_random_uuid(),
  aeronave_id   uuid not null references aeronaves(id),
  de_socio_id   uuid not null references socios(id),
  para_socio_id uuid not null references socios(id),
  bloco_de_id   uuid not null references semanas(id),
  bloco_para_id uuid not null references semanas(id),
  status        text not null default 'PENDENTE' check (status in ('PENDENTE', 'ACEITA', 'RECUSADA', 'CANCELADA')),
  created_at    timestamptz not null default now(),
  respondida_em timestamptz
);
alter table trocas enable row level security;
drop policy if exists trocas_ler on trocas;
create policy trocas_ler on trocas for select using (meu_perfil() is not null);

create or replace function propor_troca(p_meu_bloco uuid, p_bloco_dele uuid) returns uuid
  language plpgsql security definer set search_path = public as
$$
declare v_meu uuid; a semanas%rowtype; b semanas%rowtype; v_id uuid;
begin
  select id into v_meu from socios where usuario_id = auth.uid();
  if v_meu is null then raise exception 'Só sócio propõe troca.'; end if;
  select * into a from semanas where id = p_meu_bloco;
  select * into b from semanas where id = p_bloco_dele;
  if a.id is null or b.id is null then raise exception 'Período não encontrado.'; end if;
  if a.socio_id <> v_meu then raise exception 'Esse período não é seu.'; end if;
  if b.socio_id is null or b.socio_id = v_meu then raise exception 'Escolha um período de outro sócio.'; end if;
  if a.tipo <> b.tipo then raise exception 'Troque semana por semana ou fim de semana por fim de semana.'; end if;
  if a.inicio < current_date or b.inicio < current_date then raise exception 'Período já começou.'; end if;
  if exists (select 1 from trocas where status = 'PENDENTE' and (bloco_de_id in (a.id, b.id) or bloco_para_id in (a.id, b.id))) then
    raise exception 'Já há uma proposta de troca aberta para um desses períodos.';
  end if;
  insert into trocas (aeronave_id, de_socio_id, para_socio_id, bloco_de_id, bloco_para_id)
  values (a.aeronave_id, v_meu, b.socio_id, a.id, b.id) returning id into v_id;
  return v_id;
end $$;

create or replace function responder_troca(p_troca uuid, p_aceita boolean) returns void
  language plpgsql security definer set search_path = public as
$$
declare t trocas%rowtype; v_meu uuid; a semanas%rowtype; b semanas%rowtype;
begin
  select id into v_meu from socios where usuario_id = auth.uid();
  select * into t from trocas where id = p_troca and status = 'PENDENTE';
  if not found then raise exception 'Proposta já respondida.'; end if;
  if t.para_socio_id <> v_meu and t.de_socio_id <> v_meu and not sou_admin() then raise exception 'Essa proposta não é para você.'; end if;
  if t.de_socio_id = v_meu and p_aceita then raise exception 'Quem propôs só pode cancelar.'; end if;

  if not p_aceita then
    update trocas set status = case when t.de_socio_id = v_meu then 'CANCELADA' else 'RECUSADA' end, respondida_em = now() where id = p_troca;
    return;
  end if;

  select * into a from semanas where id = t.bloco_de_id;
  select * into b from semanas where id = t.bloco_para_id;
  if a.socio_id <> t.de_socio_id or b.socio_id <> t.para_socio_id then raise exception 'Os períodos mudaram de dono; proponha de novo.'; end if;

  update semanas set socio_id = t.para_socio_id where id = a.id;
  update semanas set socio_id = t.de_socio_id where id = b.id;
  -- reservas do bloco acompanham
  update reservas set socio_id = t.para_socio_id where origem = 'SEMANA' and status = 'CONFIRMADA' and socio_id = t.de_socio_id and inicio >= a.inicio and fim <= a.fim;
  update reservas set socio_id = t.de_socio_id where origem = 'SEMANA' and status = 'CONFIRMADA' and socio_id = t.para_socio_id and inicio >= b.inicio and fim <= b.fim;
  -- a fila aponta para o bloco novo de cada um
  if a.tipo = 'SEMANA' then
    update escolha_semanas set semana_id = b.id where semana_id = a.id;
    update escolha_semanas set semana_id = a.id where semana_id = b.id and socio_id = t.para_socio_id;
  else
    update escolha_semanas set fds_id = b.id where fds_id = a.id;
    update escolha_semanas set fds_id = a.id where fds_id = b.id and socio_id = t.para_socio_id;
  end if;
  update trocas set status = 'ACEITA', respondida_em = now() where id = p_troca;
end $$;

-- Disponibilidade do dia ignora pedidos ainda pendentes.
create or replace view v_agenda_dia with (security_invoker = true) as
select d::date as dia,
       a.id as aeronave_id,
       b.id as bloqueio_id, b.tipo as bloqueio_tipo, b.motivo as bloqueio_motivo,
       r.id as reserva_id, r.socio_id as reserva_socio_id, rs.apelido as reserva_socio, r.destino as reserva_destino, r.origem as reserva_origem,
       s.id as semana_id, s.socio_id as semana_socio_id, ss.apelido as semana_socio
from aeronaves a
cross join generate_series(current_date - interval '60 days', current_date + interval '120 days', interval '1 day') d
left join lateral (select * from bloqueios x where x.aeronave_id = a.id and x.deleted_at is null and d::date between x.inicio and x.fim order by x.created_at limit 1) b on true
left join lateral (select * from reservas x where x.aeronave_id = a.id and x.status = 'CONFIRMADA' and not x.pendente and d::date between x.inicio and x.fim order by x.created_at limit 1) r on true
left join socios rs on rs.id = r.socio_id
left join lateral (select * from semanas x where x.aeronave_id = a.id and d::date between x.inicio and x.fim) s on true
left join socios ss on ss.id = s.socio_id
where a.ativo;

-- Filas abertas antes desta regra (ninguém escolheu ainda): refaz com dias + horas.
do $$
declare v_aeronave uuid; m date;
begin
  select id into v_aeronave from aeronaves where ativo order by created_at limit 1;
  if not exists (select 1 from escolha_semanas where semana_id is not null or fds_id is not null) then
    for m in select distinct mes from escolha_semanas where aeronave_id = v_aeronave loop
      delete from escolha_semanas where aeronave_id = v_aeronave and mes = m;
      perform abrir_escolha(v_aeronave, m);
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';
