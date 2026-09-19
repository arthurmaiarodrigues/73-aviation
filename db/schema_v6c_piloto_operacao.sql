-- =====================================================================
-- schema_v6c_piloto_operacao.sql — o que o piloto contratado opera.
-- Rodar no SQL Editor depois do schema_v6b. Idempotente.
--
-- Piloto (sem ver valores):
--   · abastece o avião pelo tanque (RETIRADA) — sem ler preço/valor;
--   · programa e atualiza manutenções e conclui (datas, horímetro, itens
--     do plano executados) — a nota da oficina continua só do admin;
--   · vê a agenda (já podia; só leitura).
-- Também: inscrições de notificação push (avisos no celular).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tanque: piloto lança retirada, mas não lê a tabela (tem valor).
-- ---------------------------------------------------------------------
drop policy if exists tanque_lancar on tanque_movimentos;
create policy tanque_lancar on tanque_movimentos for insert
  with check (autor_id = auth.uid() and (ve_valores() or (meu_perfil() = 'piloto' and tipo = 'RETIRADA')));

-- Saldo em litros e retiradas recentes sem valores (para o piloto).
create or replace function tanque_saldo_litros(p_aeronave uuid) returns numeric
  language sql stable security definer set search_path = public as
$$
  select case when meu_perfil() is null then null
         else coalesce(sum(case tipo when 'RETIRADA' then -litros else litros end), 0)::numeric(8,1) end
  from tanque_movimentos where aeronave_id = p_aeronave and deleted_at is null
$$;

create or replace function tanque_retiradas_recentes(p_aeronave uuid, p_limite int default 10)
  returns table (id uuid, data date, litros numeric, socio text, observacao text)
  language sql stable security definer set search_path = public as
$$
  select m.id, m.data, m.litros, s.apelido, m.observacao
  from tanque_movimentos m left join socios s on s.id = m.socio_id
  where meu_perfil() is not null and m.aeronave_id = p_aeronave and m.tipo = 'RETIRADA' and m.deleted_at is null
  order by m.data desc, m.created_at desc
  limit p_limite
$$;

-- ---------------------------------------------------------------------
-- Manutenção: piloto programa, atualiza e conclui (sem nota, sem plano).
-- ---------------------------------------------------------------------
drop policy if exists manutencoes_piloto on manutencoes;
create policy manutencoes_piloto on manutencoes for insert with check (meu_perfil() = 'piloto' and autor_id = auth.uid());
drop policy if exists manutencoes_piloto_editar on manutencoes;
create policy manutencoes_piloto_editar on manutencoes for update using (meu_perfil() = 'piloto') with check (meu_perfil() = 'piloto');

create or replace function concluir_manutencao(p_manutencao uuid, p_data_fim date, p_horimetro numeric, p_plano_itens uuid[]) returns void
  language plpgsql security definer set search_path = public as
$$
declare m manutencoes%rowtype; it record;
begin
  if not (sou_admin() or meu_perfil() = 'piloto') then raise exception 'Só o administrador ou o piloto conclui manutenção.'; end if;
  select * into m from manutencoes where id = p_manutencao and deleted_at is null;
  if not found then raise exception 'Manutenção não encontrada.'; end if;
  if p_data_fim < m.data_inicio then raise exception 'Data de conclusão antes do início.'; end if;

  update manutencoes set status = 'CONCLUIDA', data_fim = p_data_fim, horimetro = coalesce(p_horimetro, horimetro) where id = p_manutencao;

  -- 1) A base anterior de cada item executado (última execução digitada à mão)
  --    entra no histórico, para o "desde a última troca" continuar valendo.
  insert into plano_execucoes (plano_item_id, manutencao_id, data, horimetro)
  select p.id, null, p.ultima_data, p.ultimo_horimetro
  from plano_manutencao p
  where p.aeronave_id = m.aeronave_id and p.ultima_data is not null
    and (p.id = any(coalesce(p_plano_itens, array[]::uuid[]))
         or p.id in (select plano_item_id from manutencao_itens where manutencao_id = p_manutencao and plano_item_id is not null and deleted_at is null))
    and not exists (select 1 from plano_execucoes e where e.plano_item_id = p.id and e.data = p.ultima_data);

  -- 2) Reprocessa os itens da nota com a data real (período POR_USO fecha na entrada).
  for it in select id from manutencao_itens where manutencao_id = p_manutencao and deleted_at is null loop
    update manutencao_itens set valor = valor where id = it.id;
  end loop;

  -- 3) Esta execução vira a nova base dos itens do plano.
  insert into plano_execucoes (plano_item_id, manutencao_id, data, horimetro)
  select p.id, p_manutencao, p_data_fim, coalesce(p_horimetro, ultimo_horimetro(m.aeronave_id))
  from plano_manutencao p
  where p.aeronave_id = m.aeronave_id
    and (p.id = any(coalesce(p_plano_itens, array[]::uuid[]))
         or p.id in (select plano_item_id from manutencao_itens where manutencao_id = p_manutencao and plano_item_id is not null and deleted_at is null))
  on conflict (plano_item_id, manutencao_id) do update set data = excluded.data, horimetro = excluded.horimetro;

  update plano_manutencao p set ultima_data = e.data, ultimo_horimetro = coalesce(e.horimetro, p.ultimo_horimetro)
  from plano_execucoes e
  where e.plano_item_id = p.id and e.manutencao_id = p_manutencao;
end $$;

-- ---------------------------------------------------------------------
-- Notificações push: uma linha por aparelho inscrito.
-- ---------------------------------------------------------------------
create table if not exists push_inscricoes (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  aparelho    text,
  created_at  timestamptz not null default now()
);
alter table push_inscricoes enable row level security;
drop policy if exists push_propria on push_inscricoes;
create policy push_propria on push_inscricoes for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());


-- ---------------------------------------------------------------------
-- Agenda: o admin reserva em nome de outro sócio; quem reservou (ou o
-- admin) edita datas e destino, com as mesmas conferências da reserva.
-- ---------------------------------------------------------------------
create or replace function conferir_reserva(p_aeronave uuid, p_socio uuid, p_inicio date, p_fim date, p_ignorar uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare r record; v_doc text;
begin
  if p_fim < p_inicio then raise exception 'Fim antes do início.'; end if;
  if p_fim - p_inicio > 30 then raise exception 'Reserva de mais de 30 dias? Fale com o administrador.'; end if;
  if exists (select 1 from bloqueios where aeronave_id = p_aeronave and deleted_at is null and inicio <= p_fim and fim >= p_inicio) then
    raise exception 'O avião está bloqueado nesse período (manutenção ou documento).';
  end if;
  v_doc := documento_vencido_em(p_aeronave, p_fim);
  if v_doc is not null then raise exception 'Documento vencido no período: %. Renove antes de reservar.', v_doc; end if;
  if exists (select 1 from reservas where aeronave_id = p_aeronave and status = 'CONFIRMADA' and inicio <= p_fim and fim >= p_inicio and socio_id <> p_socio and (p_ignorar is null or id <> p_ignorar)) then
    raise exception 'Já existe reserva de outro sócio nesse período.';
  end if;
  for r in select * from semanas where aeronave_id = p_aeronave and inicio <= p_fim and fim >= p_inicio and socio_id is not null loop
    if r.socio_id <> p_socio then
      raise exception 'De % a % a semana é de outro sócio.', to_char(r.inicio, 'DD/MM'), to_char(r.fim, 'DD/MM');
    end if;
  end loop;
end $$;

drop function if exists reservar(date, date, text, text);
create or replace function reservar(p_inicio date, p_fim date, p_destino text, p_motivo text, p_socio uuid default null) returns uuid
  language plpgsql security definer set search_path = public as
$$
declare v_socio uuid; v_aeronave uuid; v_id uuid;
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

  insert into reservas (aeronave_id, socio_id, inicio, fim, destino, motivo, origem, autor_id)
  values (v_aeronave, v_socio, p_inicio, p_fim, p_destino, p_motivo,
          case when exists (select 1 from semanas where aeronave_id = v_aeronave and inicio <= p_inicio and fim >= p_inicio and socio_id = v_socio) then 'SEMANA' else 'LIVRE' end::origem_reserva,
          auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function editar_reserva(p_id uuid, p_inicio date, p_fim date, p_destino text, p_motivo text, p_socio uuid default null) returns void
  language plpgsql security definer set search_path = public as
$$
declare r reservas%rowtype; v_meu uuid; v_socio uuid;
begin
  select * into r from reservas where id = p_id and status = 'CONFIRMADA';
  if not found then raise exception 'Reserva não encontrada.'; end if;
  select id into v_meu from socios where usuario_id = auth.uid();
  if not (sou_admin() or r.socio_id = v_meu) then raise exception 'Só quem reservou (ou o administrador) edita.'; end if;
  v_socio := case when sou_admin() and p_socio is not null then p_socio else r.socio_id end;
  perform conferir_reserva(r.aeronave_id, v_socio, p_inicio, p_fim, p_id);
  update reservas set socio_id = v_socio, inicio = p_inicio, fim = p_fim, destino = p_destino, motivo = p_motivo,
    origem = case when exists (select 1 from semanas where aeronave_id = r.aeronave_id and inicio <= p_inicio and fim >= p_inicio and socio_id = v_socio) then 'SEMANA' else 'LIVRE' end::origem_reserva
  where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- Reembolso ao piloto: despesa que o piloto pagou do bolso por conta de
-- um sócio (taxa de pouso, hangar de pernoite…). Fica DIRETO do sócio,
-- paga por ele (custo dele, fora do extrato da sociedade), marcada com o
-- piloto que adiantou; o sócio (ou o piloto, ao receber) marca reembolsada.
-- O piloto lê e lança só as despesas de reembolso dele.
-- ---------------------------------------------------------------------
alter table despesas add column if not exists reembolso_piloto_id uuid references pilotos(id);
alter table despesas add column if not exists reembolsado_em date;
alter table despesas add column if not exists reembolsado_por uuid references usuarios(id);

create or replace function meu_piloto_id() returns uuid
  language sql stable security definer set search_path = public as
$$ select id from pilotos where usuario_id = auth.uid() $$;

drop policy if exists despesas_piloto_ler on despesas;
create policy despesas_piloto_ler on despesas for select
  using (meu_perfil() = 'piloto' and reembolso_piloto_id is not null and reembolso_piloto_id = meu_piloto_id());
drop policy if exists despesas_piloto_lancar on despesas;
create policy despesas_piloto_lancar on despesas for insert
  with check (meu_perfil() = 'piloto' and autor_id = auth.uid() and reembolso_piloto_id = meu_piloto_id()
              and criterio = 'DIRETO' and socio_direto_id is not null and pagador_socio_id = socio_direto_id);

create or replace function marcar_reembolsado(p_despesa uuid, p_desfazer boolean default false) returns void
  language plpgsql security definer set search_path = public as
$$
declare d despesas%rowtype; v_meu_socio uuid;
begin
  select * into d from despesas where id = p_despesa and deleted_at is null and reembolso_piloto_id is not null;
  if not found then raise exception 'Reembolso não encontrado.'; end if;
  select id into v_meu_socio from socios where usuario_id = auth.uid();
  if not (sou_admin() or d.socio_direto_id = v_meu_socio or d.reembolso_piloto_id = meu_piloto_id()) then
    raise exception 'Só o sócio que deve, o piloto ou o administrador marca o reembolso.';
  end if;
  update despesas set reembolsado_em = case when p_desfazer then null else current_date end,
                      reembolsado_por = case when p_desfazer then null else auth.uid() end
  where id = p_despesa;
end $$;

-- Piloto anexa a nota do que pagou.
drop policy if exists comprovantes_gravar on storage.objects;
create policy comprovantes_gravar on storage.objects for insert with check (bucket_id = 'comprovantes' and meu_perfil() is not null);

notify pgrst, 'reload schema';
