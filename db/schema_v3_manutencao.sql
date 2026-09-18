-- =====================================================================
-- schema_v3_manutencao.sql — Fase 3: plano de manutenção por horas e por
-- tempo, execução com nota da oficina item a item, documentos da aeronave.
-- Rodar no SQL Editor DEPOIS do schema_v2_agenda.sql. Idempotente.
--
-- Regras (CLAUDE.md §4 Manutenção):
--   - Item do plano tem gatilho POR_HORAS, POR_TEMPO ou AMBOS (o que vencer
--     primeiro). Próxima execução calculada da última.
--   - Nota da oficina entra item a item: POR_TEMPO → rateio IGUAL;
--     POR_USO → POR_HORAS desde a última execução daquele item; IGUAL para
--     o que não é nem um nem outro. Cada item vira uma despesa.
--   - Item pago pelo fundo de reserva não é rateado (os sócios já
--     provisionaram); vira saída do fundo.
--   - Manutenção programada bloqueia o avião na agenda; concluir atualiza
--     a última execução dos itens do plano.
--   - Documento vencido barra reserva e aparece no Início.
-- =====================================================================

do $$ begin
  create type gatilho_manutencao as enum ('POR_HORAS', 'POR_TEMPO', 'AMBOS');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_custo_manutencao as enum ('POR_USO', 'POR_TEMPO', 'IGUAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_manutencao as enum ('PROGRAMADA', 'EM_OFICINA', 'CONCLUIDA');
exception when duplicate_object then null; end $$;

-- Despesa paga pelo fundo: sem rateio (já provisionado hora a hora).
alter table despesas add column if not exists pago_pelo_fundo boolean not null default false;

-- ---------------------------------------------------------------------
-- Plano de manutenção
-- ---------------------------------------------------------------------
create table if not exists plano_manutencao (
  id                uuid primary key default gen_random_uuid(),
  aeronave_id       uuid not null references aeronaves(id),
  descricao         text not null,
  gatilho           gatilho_manutencao not null default 'POR_HORAS',
  intervalo_horas   numeric(8,1),
  intervalo_meses   int,
  ultima_data       date,
  ultimo_horimetro  numeric(8,1),
  aviso_horas       numeric(8,1) not null default 10,
  aviso_dias        int not null default 30,
  tipo_custo        tipo_custo_manutencao not null default 'POR_USO',
  ativo             boolean not null default true,
  ordem             int not null default 0,
  created_at        timestamptz not null default now(),
  unique (aeronave_id, descricao),
  constraint plano_intervalo check (
    (gatilho = 'POR_HORAS' and intervalo_horas > 0)
    or (gatilho = 'POR_TEMPO' and intervalo_meses > 0)
    or (gatilho = 'AMBOS' and intervalo_horas > 0 and intervalo_meses > 0)
  )
);

drop trigger if exists plano_manutencao_caixa_alta on plano_manutencao;
create or replace function normalizar_manutencao() returns trigger
  language plpgsql as
$$
begin
  if tg_table_name = 'plano_manutencao' then new.descricao := caixa_alta(new.descricao);
  elsif tg_table_name = 'manutencoes' then new.descricao := caixa_alta(new.descricao); new.observacao := caixa_alta(new.observacao);
  elsif tg_table_name = 'manutencao_itens' then new.descricao := caixa_alta(new.descricao);
  elsif tg_table_name = 'documentos_aeronave' then new.tipo := caixa_alta(new.tipo); new.numero := caixa_alta(new.numero); new.observacao := caixa_alta(new.observacao);
  end if;
  return new;
end $$;
create trigger plano_manutencao_caixa_alta before insert or update on plano_manutencao for each row execute function normalizar_manutencao();

-- Situação de cada item: horas e dias restantes, e o que vence primeiro.
create or replace view v_plano_status with (security_invoker = true) as
select p.*,
       ultimo_horimetro(p.aeronave_id) as horimetro_atual,
       case when p.gatilho in ('POR_HORAS', 'AMBOS') and p.ultimo_horimetro is not null then p.ultimo_horimetro + p.intervalo_horas end as proximo_horimetro,
       case when p.gatilho in ('POR_TEMPO', 'AMBOS') and p.ultima_data is not null then (p.ultima_data + (p.intervalo_meses || ' months')::interval)::date end as proxima_data,
       case when p.gatilho in ('POR_HORAS', 'AMBOS') and p.ultimo_horimetro is not null
            then round(p.ultimo_horimetro + p.intervalo_horas - coalesce(ultimo_horimetro(p.aeronave_id), p.ultimo_horimetro), 1) end as horas_restantes,
       case when p.gatilho in ('POR_TEMPO', 'AMBOS') and p.ultima_data is not null
            then (p.ultima_data + (p.intervalo_meses || ' months')::interval)::date - current_date end as dias_restantes,
       case
         when (p.gatilho in ('POR_HORAS', 'AMBOS') and p.ultimo_horimetro is null) or (p.gatilho in ('POR_TEMPO', 'AMBOS') and p.ultima_data is null) then 'SEM_REGISTRO'
         when (p.gatilho in ('POR_HORAS', 'AMBOS') and p.ultimo_horimetro + p.intervalo_horas - coalesce(ultimo_horimetro(p.aeronave_id), p.ultimo_horimetro) <= 0)
           or (p.gatilho in ('POR_TEMPO', 'AMBOS') and (p.ultima_data + (p.intervalo_meses || ' months')::interval)::date <= current_date) then 'VENCIDO'
         when (p.gatilho in ('POR_HORAS', 'AMBOS') and p.ultimo_horimetro + p.intervalo_horas - coalesce(ultimo_horimetro(p.aeronave_id), p.ultimo_horimetro) <= p.aviso_horas)
           or (p.gatilho in ('POR_TEMPO', 'AMBOS') and (p.ultima_data + (p.intervalo_meses || ' months')::interval)::date - current_date <= p.aviso_dias) then 'AVISO'
         else 'OK'
       end as situacao
from plano_manutencao p
where p.ativo;

-- ---------------------------------------------------------------------
-- Manutenções (a ida à oficina) e itens da nota
-- ---------------------------------------------------------------------
create table if not exists manutencoes (
  id                 uuid primary key default gen_random_uuid(),
  aeronave_id        uuid not null references aeronaves(id),
  descricao          text not null,
  fornecedor_id      uuid references fornecedores(id),
  data_inicio        date not null,
  data_fim           date,                       -- previsão enquanto aberta; real quando concluída
  horimetro          numeric(8,1),               -- horímetro na entrada da oficina
  status             status_manutencao not null default 'PROGRAMADA',
  -- quem pagou a oficina (null = caixa); os itens herdam
  pagador_socio_id   uuid references socios(id),
  -- ponteiros sem FK (voos já tem FK dupla em outras tabelas; validado no código)
  voo_translado_id   uuid,
  voo_teste_id       uuid,
  bloqueio_id        uuid references bloqueios(id),
  observacao         text,
  autor_id           uuid references usuarios(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  deleted_by         uuid references usuarios(id),
  constraint manutencoes_periodo check (data_fim is null or data_fim >= data_inicio)
);
drop trigger if exists manutencoes_updated_at on manutencoes;
create trigger manutencoes_updated_at before update on manutencoes for each row execute function tocar_updated_at();
drop trigger if exists manutencoes_caixa_alta on manutencoes;
create trigger manutencoes_caixa_alta before insert or update on manutencoes for each row execute function normalizar_manutencao();

create table if not exists manutencao_itens (
  id               uuid primary key default gen_random_uuid(),
  manutencao_id    uuid not null references manutencoes(id) on delete cascade,
  plano_item_id    uuid references plano_manutencao(id),
  descricao        text not null,
  valor            numeric(14,2) not null check (valor >= 0),
  tipo_custo       tipo_custo_manutencao not null default 'IGUAL',
  pago_pelo_fundo  boolean not null default false,
  despesa_id       uuid unique references despesas(id),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
drop trigger if exists manutencao_itens_caixa_alta on manutencao_itens;
create trigger manutencao_itens_caixa_alta before insert or update on manutencao_itens for each row execute function normalizar_manutencao();

-- Histórico de execução de cada item do plano (a base do "desde a última troca").
create table if not exists plano_execucoes (
  id             uuid primary key default gen_random_uuid(),
  plano_item_id  uuid not null references plano_manutencao(id),
  manutencao_id  uuid references manutencoes(id),
  data           date not null,
  horimetro      numeric(8,1),
  created_at     timestamptz not null default now(),
  unique (plano_item_id, manutencao_id)
);

-- ---------------------------------------------------------------------
-- Bloqueio automático: manutenção aberta bloqueia o avião no período.
-- ---------------------------------------------------------------------
create or replace function manutencao_bloquear() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare v_fim date;
begin
  v_fim := coalesce(new.data_fim, new.data_inicio + 7);
  if new.deleted_at is not null or new.status = 'CONCLUIDA' then
    if new.bloqueio_id is not null then
      -- encerra o bloqueio na data real (ou remove, se nem começou)
      if new.status = 'CONCLUIDA' and new.data_fim is not null and new.deleted_at is null then
        update bloqueios set fim = greatest(new.data_fim, inicio) where id = new.bloqueio_id;
      else
        update bloqueios set deleted_at = now() where id = new.bloqueio_id;
      end if;
    end if;
    return new;
  end if;

  if new.bloqueio_id is null then
    insert into bloqueios (aeronave_id, inicio, fim, tipo, motivo, autor_id)
    values (new.aeronave_id, new.data_inicio, v_fim, 'MANUTENCAO', new.descricao, new.autor_id)
    returning id into new.bloqueio_id;
  else
    update bloqueios set inicio = new.data_inicio, fim = v_fim, motivo = new.descricao, deleted_at = null where id = new.bloqueio_id;
  end if;
  return new;
end $$;
drop trigger if exists manutencoes_bloquear on manutencoes;
create trigger manutencoes_bloquear before insert or update on manutencoes for each row execute function manutencao_bloquear();

-- ---------------------------------------------------------------------
-- Cada item da nota vira uma despesa com o critério certo:
--   POR_USO   → POR_HORAS desde a última execução do item do plano
--               (ou desde a manutenção anterior concluída, sem item)
--   POR_TEMPO → IGUAL
--   IGUAL     → IGUAL
--   pago pelo fundo → despesa sem rateio + saída do fundo
-- ---------------------------------------------------------------------
create or replace function manutencao_item_despesa() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare m manutencoes%rowtype; v_cat int; v_inicio date; v_fim date; v_criterio criterio_rateio; v_desc text;
begin
  new.pago_pelo_fundo := coalesce(new.pago_pelo_fundo, false);
  new.tipo_custo := coalesce(new.tipo_custo, 'IGUAL');
  select * into m from manutencoes where id = new.manutencao_id;
  select id into v_cat from categorias_despesa where nome = 'MANUTENÇÃO';
  v_desc := 'MANUTENÇÃO: ' || new.descricao;

  if new.deleted_at is not null then
    if new.despesa_id is not null then
      update despesas set deleted_at = now() where id = new.despesa_id;
      delete from fundo_reserva_movimentos where despesa_id = new.despesa_id and tipo = 'SAIDA';
    end if;
    return new;
  end if;

  if new.tipo_custo = 'POR_USO' then
    v_criterio := 'POR_HORAS';
    -- desde a última execução do item do plano, ou da manutenção anterior
    select coalesce(
      (select max(e.data) from plano_execucoes e where e.plano_item_id = new.plano_item_id
         and (e.manutencao_id is null or e.manutencao_id <> new.manutencao_id) and e.data <= m.data_inicio),
      (select p.ultima_data from plano_manutencao p where p.id = new.plano_item_id and p.ultima_data < m.data_inicio),
      (select max(x.data_fim) from manutencoes x where x.aeronave_id = m.aeronave_id and x.status = 'CONCLUIDA' and x.id <> m.id and x.deleted_at is null and x.data_fim < m.data_inicio),
      (select min(v.data) from voos v where v.aeronave_id = m.aeronave_id and v.deleted_at is null)
    ) into v_inicio;
    v_fim := coalesce(m.data_fim, m.data_inicio);
    if v_inicio is null or v_inicio > v_fim then v_inicio := (v_fim - interval '3 months')::date; end if;
  else
    v_criterio := 'IGUAL';
    v_inicio := null; v_fim := null;
  end if;

  if new.despesa_id is null then
    insert into despesas (aeronave_id, data, descricao, fornecedor_id, categoria_id, valor, pagador_socio_id, criterio,
                          periodo_inicio, periodo_fim, manutencao_id, pago_pelo_fundo, autor_id)
    values (m.aeronave_id, coalesce(m.data_fim, m.data_inicio), v_desc, m.fornecedor_id, v_cat, new.valor, m.pagador_socio_id, v_criterio,
            v_inicio, v_fim, m.id, new.pago_pelo_fundo, m.autor_id)
    returning id into new.despesa_id;
  else
    update despesas set data = coalesce(m.data_fim, m.data_inicio), descricao = v_desc, fornecedor_id = m.fornecedor_id, valor = new.valor,
      pagador_socio_id = m.pagador_socio_id, criterio = v_criterio, periodo_inicio = v_inicio, periodo_fim = v_fim,
      pago_pelo_fundo = new.pago_pelo_fundo, deleted_at = null
    where id = new.despesa_id;
  end if;

  -- saída do fundo
  delete from fundo_reserva_movimentos where despesa_id = new.despesa_id and tipo = 'SAIDA';
  if new.pago_pelo_fundo then
    insert into fundo_reserva_movimentos (aeronave_id, socio_id, mes, tipo, valor, descricao, despesa_id)
    values (m.aeronave_id, null, date_trunc('month', coalesce(m.data_fim, m.data_inicio))::date, 'SAIDA', new.valor, v_desc, new.despesa_id);
  end if;
  return new;
end $$;
drop trigger if exists manutencao_itens_despesa on manutencao_itens;
create trigger manutencao_itens_despesa before insert or update on manutencao_itens for each row execute function manutencao_item_despesa();

-- calcular_rateio: despesa paga pelo fundo não tem rateio.
create or replace function calcular_rateio(p_despesa uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare
  d despesas%rowtype;
  v_total numeric(7,4);
  v_soma numeric(14,2);
  v_maior uuid;
begin
  select * into d from despesas where id = p_despesa;
  if not found or d.deleted_at is not null then return; end if;

  if d.pago_pelo_fundo then
    delete from rateios where despesa_id = p_despesa;
    update despesas set status = 'RATEADA' where id = p_despesa and status <> 'PENDENTE';
    return;
  end if;

  if d.criterio = 'MANUAL' then
    select coalesce(sum(percentual), 0) into v_total from rateios where despesa_id = p_despesa;
    if round(v_total, 2) <> 100 then
      raise exception 'Rateio manual soma % por cento; precisa somar 100.', v_total;
    end if;
    update rateios set valor = round(d.valor * percentual / 100, 2) where despesa_id = p_despesa;
  else
    delete from rateios where despesa_id = p_despesa;

    if d.criterio = 'DIRETO' then
      insert into rateios (despesa_id, socio_id, percentual, valor)
      values (p_despesa, d.socio_direto_id, 100, d.valor);

    elsif d.criterio = 'POR_HORAS' then
      insert into rateios (despesa_id, socio_id, percentual, valor, horas_base)
      select p_despesa, h.socio_id,
             round(100 * h.horas / t.total, 4),
             round(d.valor * h.horas / t.total, 2),
             h.horas
      from horas_por_socio(d.aeronave_id,
                           coalesce(d.periodo_inicio, date_trunc('month', d.data)::date),
                           coalesce(d.periodo_fim, (date_trunc('month', d.data) + interval '1 month - 1 day')::date)) h
      cross join (select sum(horas) as total from horas_por_socio(d.aeronave_id,
                           coalesce(d.periodo_inicio, date_trunc('month', d.data)::date),
                           coalesce(d.periodo_fim, (date_trunc('month', d.data) + interval '1 month - 1 day')::date))) t
      where t.total > 0 and h.horas > 0;
    end if;

    if not exists (select 1 from rateios where despesa_id = p_despesa) then
      insert into rateios (despesa_id, socio_id, percentual, valor)
      select p_despesa, s.socio_id,
             round(100 * s.cota / t.total, 4),
             round(d.valor * s.cota / t.total, 2)
      from socios_ativos_em(d.data) s
      cross join (select sum(cota) as total from socios_ativos_em(d.data)) t;
    end if;
  end if;

  select coalesce(sum(valor), 0) into v_soma from rateios where despesa_id = p_despesa;
  if v_soma <> d.valor then
    select socio_id into v_maior from rateios where despesa_id = p_despesa order by valor desc, socio_id limit 1;
    update rateios set valor = valor + (d.valor - v_soma) where despesa_id = p_despesa and socio_id = v_maior;
  end if;

  update despesas set status = 'RATEADA' where id = p_despesa and status <> 'PENDENTE';
end $$;

-- O trigger de rateio precisa reagir também a pago_pelo_fundo.
drop trigger if exists despesas_ratear on despesas;
create trigger despesas_ratear after insert or update of valor, criterio, socio_direto_id, periodo_inicio, periodo_fim, data, deleted_at, pago_pelo_fundo
  on despesas for each row execute function despesas_ratear();

-- ---------------------------------------------------------------------
-- Concluir a manutenção: data e horímetro reais, itens do plano executados
-- ganham nova "última execução", bloqueio termina, despesas dos itens
-- passam para a data real.
-- ---------------------------------------------------------------------
create or replace function concluir_manutencao(p_manutencao uuid, p_data_fim date, p_horimetro numeric, p_plano_itens uuid[]) returns void
  language plpgsql security definer set search_path = public as
$$
declare m manutencoes%rowtype; it record;
begin
  if not sou_admin() then raise exception 'Só o administrador conclui manutenção.'; end if;
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

  -- 2) Reprocessa os itens da nota com a data real (período POR_USO fecha na saída).
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
-- Documentos da aeronave
-- ---------------------------------------------------------------------
create table if not exists documentos_aeronave (
  id            uuid primary key default gen_random_uuid(),
  aeronave_id   uuid not null references aeronaves(id),
  tipo          text not null,
  numero        text,
  emissao       date,
  vencimento    date not null,
  arquivo_path  text,
  observacao    text,
  autor_id      uuid references usuarios(id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
drop trigger if exists documentos_aeronave_caixa_alta on documentos_aeronave;
create trigger documentos_aeronave_caixa_alta before insert or update on documentos_aeronave for each row execute function normalizar_manutencao();

-- Um documento por tipo conta: o mais recente. Vencido = bloqueia.
create or replace view v_documentos_status with (security_invoker = true) as
select distinct on (d.aeronave_id, d.tipo)
       d.*, d.vencimento - current_date as dias_restantes,
       case when d.vencimento < current_date then 'VENCIDO' when d.vencimento - current_date <= 30 then 'AVISO' else 'OK' end as situacao
from documentos_aeronave d
where d.deleted_at is null
order by d.aeronave_id, d.tipo, d.vencimento desc;

-- Documento vencido em alguma data do período?
create or replace function documento_vencido_em(p_aeronave uuid, p_data date) returns text
  language sql stable security definer set search_path = public as
$$
  select string_agg(tipo || ' (' || to_char(vencimento, 'DD/MM/YYYY') || ')', ', ')
  from v_documentos_status where aeronave_id = p_aeronave and vencimento < p_data
$$;

-- reservar: além de bloqueio e conflito, documento vencido barra.
create or replace function reservar(p_inicio date, p_fim date, p_destino text, p_motivo text) returns uuid
  language plpgsql security definer set search_path = public as
$$
declare v_socio uuid; v_aeronave uuid; v_id uuid; r record; v_doc text;
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
  v_doc := documento_vencido_em(v_aeronave, p_fim);
  if v_doc is not null then
    raise exception 'Documento vencido no período: %. Renove antes de reservar.', v_doc;
  end if;
  if exists (select 1 from reservas where aeronave_id = v_aeronave and status = 'CONFIRMADA' and inicio <= p_fim and fim >= p_inicio and socio_id <> v_socio) then
    raise exception 'Já existe reserva de outro sócio nesse período.';
  end if;
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
-- RLS: todo logado lê plano, manutenções e documentos (sem valores);
-- itens da nota (valores) só quem vê valores; admin escreve.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['plano_manutencao', 'plano_execucoes', 'manutencoes', 'documentos_aeronave'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_ler on %I', t, t);
    execute format('create policy %I_ler on %I for select using (meu_perfil() is not null)', t, t);
    execute format('drop policy if exists %I_admin on %I', t, t);
    execute format('create policy %I_admin on %I for all using (sou_admin()) with check (sou_admin())', t, t);
  end loop;
end $$;
alter table manutencao_itens enable row level security;
drop policy if exists manutencao_itens_ler on manutencao_itens;
create policy manutencao_itens_ler on manutencao_itens for select using (ve_valores());
drop policy if exists manutencao_itens_admin on manutencao_itens;
create policy manutencao_itens_admin on manutencao_itens for all using (sou_admin()) with check (sou_admin());

insert into storage.buckets (id, name, public) values ('documentos-aeronave', 'documentos-aeronave', false) on conflict (id) do nothing;
drop policy if exists documentos_ler on storage.objects;
create policy documentos_ler on storage.objects for select using (bucket_id = 'documentos-aeronave' and meu_perfil() is not null);
drop policy if exists documentos_gravar on storage.objects;
create policy documentos_gravar on storage.objects for insert with check (bucket_id = 'documentos-aeronave' and sou_admin());

-- ---------------------------------------------------------------------
-- Plano inicial (o admin ajusta intervalos e preenche a última execução)
-- ---------------------------------------------------------------------
insert into plano_manutencao (aeronave_id, descricao, gatilho, intervalo_horas, intervalo_meses, tipo_custo, ordem)
select a.id, x.descricao, x.gatilho::gatilho_manutencao, x.horas, x.meses, x.custo::tipo_custo_manutencao, x.ordem
from aeronaves a
cross join (values
  ('TROCA DE ÓLEO E FILTRO', 'AMBOS', 50, 4, 'POR_USO', 1),
  ('REVISÃO 100 H', 'POR_HORAS', 100, null, 'POR_USO', 2),
  ('INSPEÇÃO ANUAL (IAM)', 'POR_TEMPO', null, 12, 'POR_TEMPO', 3),
  ('VELAS', 'POR_HORAS', 100, null, 'POR_USO', 4),
  ('BATERIA', 'POR_TEMPO', null, 24, 'POR_TEMPO', 5),
  ('ELT E TRANSPONDER (AFERIÇÃO)', 'POR_TEMPO', null, 24, 'POR_TEMPO', 6)
) as x(descricao, gatilho, horas, meses, custo, ordem)
where a.ativo
on conflict (aeronave_id, descricao) do nothing;

notify pgrst, 'reload schema';
