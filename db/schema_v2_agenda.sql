-- =====================================================================
-- schema_v2_agenda.sql — Fase 2: semanas, escolha por menos uso,
-- reservas e bloqueios. Rodar no SQL Editor DEPOIS do schema.sql.
-- Idempotente. Termina com notify pgrst.
--
-- Regras (CLAUDE.md §4 Agenda):
--   - Semanas de segunda a domingo; cada sócio tem direito a UMA por mês.
--   - Ordem de escolha: menos horas nos últimos 3 meses escolhe primeiro;
--     empate → quem escolheu por último no mês anterior fica atrás.
--   - A escolha abre no dia 15 do mês anterior. Quem não escolher em 48 h
--     passa a vez (escolhe depois, entre o que sobrou).
--   - Fora da semana titular vale ordem de chegada; dentro, só o titular.
--   - Semana não usada não acumula; sócio pode ceder (volta ao pool).
--   - Bloqueio (manutenção, documento vencido, avião fora) vence reserva.
-- =====================================================================

do $$ begin
  create type status_reserva as enum ('CONFIRMADA', 'CANCELADA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type origem_reserva as enum ('SEMANA', 'LIVRE', 'CEDIDA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_bloqueio as enum ('MANUTENCAO', 'DOCUMENTO', 'FORA_DA_BASE', 'OUTRO');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Semanas do mês (segunda a domingo). Uma semana pertence ao mês em que
-- cai a sua segunda-feira.
-- ---------------------------------------------------------------------
create table if not exists semanas (
  id           uuid primary key default gen_random_uuid(),
  aeronave_id  uuid not null references aeronaves(id),
  mes          date not null,
  inicio       date not null,                    -- segunda
  fim          date not null,                    -- domingo
  socio_id     uuid references socios(id),       -- titular (null = livre)
  cedida_por   uuid references socios(id),       -- quem abriu mão
  cedida_em    timestamptz,
  created_at   timestamptz not null default now(),
  unique (aeronave_id, inicio),
  constraint semanas_segunda check (extract(isodow from inicio) = 1),
  constraint semanas_sete_dias check (fim = inicio + 6)
);

-- ---------------------------------------------------------------------
-- Escolha do mês: a fila. Uma linha por sócio ativo, na ordem.
-- ---------------------------------------------------------------------
create table if not exists escolha_semanas (
  id            uuid primary key default gen_random_uuid(),
  aeronave_id   uuid not null references aeronaves(id),
  mes           date not null,
  socio_id      uuid not null references socios(id),
  ordem         int not null,
  horas_base    numeric(8,1) not null default 0,  -- horas dos últimos 3 meses
  semana_id     uuid references semanas(id),
  escolhido_em  timestamptz,
  prazo         timestamptz,                       -- 48 h a partir de quando virou a vez
  pulado        boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (aeronave_id, mes, socio_id),
  unique (aeronave_id, mes, ordem)
);

create table if not exists reservas (
  id           uuid primary key default gen_random_uuid(),
  aeronave_id  uuid not null references aeronaves(id),
  socio_id     uuid not null references socios(id),
  inicio       date not null,
  fim          date not null,
  destino      text,
  motivo       text,
  origem       origem_reserva not null default 'LIVRE',
  status       status_reserva not null default 'CONFIRMADA',
  autor_id     uuid references usuarios(id),
  created_at   timestamptz not null default now(),
  cancelada_em timestamptz,
  cancelada_por uuid references usuarios(id),
  constraint reservas_periodo check (fim >= inicio)
);
create index if not exists reservas_periodo_idx on reservas (aeronave_id, inicio, fim) where status = 'CONFIRMADA';

create table if not exists bloqueios (
  id           uuid primary key default gen_random_uuid(),
  aeronave_id  uuid not null references aeronaves(id),
  inicio       date not null,
  fim          date not null,
  tipo         tipo_bloqueio not null default 'OUTRO',
  motivo       text not null,
  autor_id     uuid references usuarios(id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint bloqueios_periodo check (fim >= inicio)
);

-- CAIXA ALTA
create or replace function normalizar_agenda() returns trigger
  language plpgsql as
$$
begin
  if tg_table_name = 'reservas' then
    new.destino := caixa_alta(new.destino); new.motivo := caixa_alta(new.motivo);
  elsif tg_table_name = 'bloqueios' then
    new.motivo := caixa_alta(new.motivo);
  end if;
  return new;
end $$;
drop trigger if exists reservas_caixa_alta on reservas;
create trigger reservas_caixa_alta before insert or update on reservas for each row execute function normalizar_agenda();
drop trigger if exists bloqueios_caixa_alta on bloqueios;
create trigger bloqueios_caixa_alta before insert or update on bloqueios for each row execute function normalizar_agenda();

-- ---------------------------------------------------------------------
-- Gera as semanas de um mês (as que têm segunda-feira dentro do mês).
-- ---------------------------------------------------------------------
create or replace function gerar_semanas(p_aeronave uuid, p_mes date) returns void
  language plpgsql security definer set search_path = public as
$$
declare v_mes date := date_trunc('month', p_mes)::date; v_seg date;
begin
  -- primeira segunda-feira do mês
  v_seg := v_mes + ((8 - extract(isodow from v_mes)::int) % 7);
  while v_seg < v_mes + interval '1 month' loop
    insert into semanas (aeronave_id, mes, inicio, fim)
    values (p_aeronave, v_mes, v_seg, v_seg + 6)
    on conflict (aeronave_id, inicio) do nothing;
    v_seg := v_seg + 7;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Abre a escolha de um mês: gera as semanas e a fila.
-- Ordem: menos horas nos últimos 3 meses (contados até o fim do mês
-- anterior ao de referência) primeiro; empate → quem escolheu por último
-- no mês anterior fica atrás; empate ainda → apelido.
-- Só abre se ainda não existe fila para o mês.
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
    select s.socio_id,
           coalesce(h.horas, 0) as horas,
           coalesce(e.ordem, 0) as ordem_anterior,
           so.apelido
    from socios_ativos_em(v_mes) s
    join socios so on so.id = s.socio_id
    left join horas_por_socio(p_aeronave, v_de, v_ate) h on h.socio_id = s.socio_id
    left join escolha_semanas e on e.aeronave_id = p_aeronave and e.mes = (v_mes - interval '1 month')::date and e.socio_id = s.socio_id
    order by coalesce(h.horas, 0) asc, coalesce(e.ordem, 0) desc, so.apelido
  loop
    v_ordem := v_ordem + 1;
    insert into escolha_semanas (aeronave_id, mes, socio_id, ordem, horas_base, prazo)
    values (p_aeronave, v_mes, r.socio_id, v_ordem, r.horas, case when v_ordem = 1 then now() + interval '48 hours' end);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- De quem é a vez: o primeiro da fila sem semana e não pulado.
-- Se o prazo dele venceu, ele é marcado como pulado e a vez passa.
-- Quem foi pulado pode escolher a qualquer momento entre o que sobrou.
-- ---------------------------------------------------------------------
create or replace function vez_de_escolher(p_aeronave uuid, p_mes date) returns uuid
  language plpgsql security definer set search_path = public as
$$
declare v_mes date := date_trunc('month', p_mes)::date; r record;
begin
  loop
    select * into r from escolha_semanas
    where aeronave_id = p_aeronave and mes = v_mes and semana_id is null and not pulado
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

-- ---------------------------------------------------------------------
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

-- Ceder a semana: volta ao pool; a reserva SEMANA é cancelada.
create or replace function ceder_semana(p_semana uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare v_socio uuid; s semanas%rowtype;
begin
  select id into v_socio from socios where usuario_id = auth.uid();
  select * into s from semanas where id = p_semana;
  if not found then raise exception 'Semana não encontrada.'; end if;
  if s.socio_id is null then raise exception 'Essa semana já está livre.'; end if;
  if s.socio_id <> v_socio and not sou_admin() then raise exception 'Só o titular cede a semana.'; end if;

  update semanas set socio_id = null, cedida_por = s.socio_id, cedida_em = now() where id = p_semana;
  update reservas set status = 'CANCELADA', cancelada_em = now(), cancelada_por = auth.uid()
  where aeronave_id = s.aeronave_id and socio_id = s.socio_id and origem = 'SEMANA' and status = 'CONFIRMADA'
    and inicio >= s.inicio and fim <= s.fim;
end $$;

-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Disponibilidade de um dia: bloqueio > reserva > titular da semana > livre.
-- ---------------------------------------------------------------------
create or replace view v_agenda_dia with (security_invoker = true) as
select d::date as dia,
       a.id as aeronave_id,
       b.id as bloqueio_id, b.tipo as bloqueio_tipo, b.motivo as bloqueio_motivo,
       r.id as reserva_id, r.socio_id as reserva_socio_id, rs.apelido as reserva_socio, r.destino as reserva_destino, r.origem as reserva_origem,
       s.id as semana_id, s.socio_id as semana_socio_id, ss.apelido as semana_socio
from aeronaves a
cross join generate_series(current_date - interval '60 days', current_date + interval '120 days', interval '1 day') d
left join lateral (select * from bloqueios x where x.aeronave_id = a.id and x.deleted_at is null and d::date between x.inicio and x.fim order by x.created_at limit 1) b on true
left join lateral (select * from reservas x where x.aeronave_id = a.id and x.status = 'CONFIRMADA' and d::date between x.inicio and x.fim order by x.created_at limit 1) r on true
left join socios rs on rs.id = r.socio_id
left join lateral (select * from semanas x where x.aeronave_id = a.id and d::date between x.inicio and x.fim) s on true
left join socios ss on ss.id = s.socio_id
where a.ativo;

-- ---------------------------------------------------------------------
-- RLS: todo logado lê a agenda; sócio escreve pelas funções; admin tudo.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['semanas', 'escolha_semanas', 'reservas', 'bloqueios'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_ler on %I', t, t);
    execute format('create policy %I_ler on %I for select using (meu_perfil() is not null)', t, t);
    execute format('drop policy if exists %I_admin on %I', t, t);
    execute format('create policy %I_admin on %I for all using (sou_admin()) with check (sou_admin())', t, t);
  end loop;
end $$;

-- Sócio cancela a própria reserva (soft: status CANCELADA).
drop policy if exists reservas_propria on reservas;
create policy reservas_propria on reservas for update
  using (socio_id = (select id from socios where usuario_id = auth.uid()))
  with check (socio_id = (select id from socios where usuario_id = auth.uid()));

notify pgrst, 'reload schema';
