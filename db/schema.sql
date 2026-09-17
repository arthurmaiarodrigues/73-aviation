-- =====================================================================
-- 73 AVIATION — PP-ZNM · schema.sql (Fase 1)
--
-- Rodar inteiro no SQL Editor do Supabase. Idempotente: pode rodar de novo.
-- Depois de rodar:  notify pgrst, 'reload schema';
--
-- Regras (CLAUDE.md §9): soft-delete com auditoria, numeric nunca float,
-- CAIXA ALTA nos cadastros, validação no banco, RLS por perfil.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type perfil_usuario as enum ('admin', 'socio', 'piloto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type natureza_voo as enum ('PARTICULAR', 'SOCIEDADE', 'TRANSLADO_MANUTENCAO', 'VOO_TESTE', 'INSTRUCAO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_voo as enum ('RASCUNHO', 'CONFIRMADO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type criterio_rateio as enum ('IGUAL', 'POR_HORAS', 'DIRETO', 'MANUAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_despesa as enum ('PENDENTE', 'APROVADA', 'RATEADA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_fornecedor as enum ('PJ', 'PF');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_movimento_fundo as enum ('ENTRADA', 'SAIDA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_fechamento as enum ('ABERTO', 'FECHADO');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Funções utilitárias
-- ---------------------------------------------------------------------

-- CAIXA ALTA e sem espaços duplos: regra de todo cadastro de texto.
create or replace function caixa_alta(t text) returns text
  language sql immutable as
$$ select nullif(upper(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g')), '') $$;

create or replace function tocar_updated_at() returns trigger
  language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------
-- Usuários (espelho do Auth) e perfis
-- ---------------------------------------------------------------------
create table if not exists usuarios (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  perfil      perfil_usuario not null default 'socio',
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- security definer: lê usuarios sem depender de policy (evita recursão na RLS).
create or replace function meu_perfil() returns perfil_usuario
  language sql stable security definer set search_path = public as
$$ select perfil from usuarios where id = auth.uid() and ativo $$;

create or replace function ve_valores() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce(meu_perfil() in ('admin', 'socio'), false) $$;

create or replace function sou_admin() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce(meu_perfil() = 'admin', false) $$;

-- ---------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------
create table if not exists aeronaves (
  id                        uuid primary key default gen_random_uuid(),
  matricula                 text not null unique,
  modelo                    text not null,
  base_icao                 text,
  capacidade_combustivel_l  numeric(8,1),
  consumo_medio_lh          numeric(8,1),
  tbo_motor_horas           numeric(8,1),
  fundo_reserva_por_hora    numeric(14,2) not null default 150,
  ativo                     boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Histórico do valor do fundo por hora: trocar o valor não altera mês fechado.
create table if not exists fundo_reserva_valores (
  id              uuid primary key default gen_random_uuid(),
  aeronave_id     uuid not null references aeronaves(id),
  valor_por_hora  numeric(14,2) not null check (valor_por_hora >= 0),
  vigente_desde   date not null,
  unique (aeronave_id, vigente_desde)
);

create table if not exists socios (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  apelido      text not null unique,
  cpf          text,
  cota         numeric(5,2) not null default 25 check (cota > 0 and cota <= 100),
  cor          text not null default '#0E2846',
  ativo_desde  date not null default current_date,
  ativo_ate    date,
  usuario_id   uuid unique references usuarios(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists pilotos (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  socio_id           uuid unique references socios(id),
  licenca            text,
  validade_licenca   date,
  ativo              boolean not null default true,
  created_at         timestamptz not null default now()
);

create table if not exists aerodromos (
  id      uuid primary key default gen_random_uuid(),
  icao    text not null unique check (icao ~ '^[A-Z0-9]{4}$'),
  nome    text,
  cidade  text
);

create table if not exists fornecedores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  cpf_cnpj   text,
  tipo       tipo_fornecedor not null default 'PJ',
  cidade     text,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists fornecedores_nome_unq on fornecedores (nome) where ativo;

create table if not exists categorias_despesa (
  id     serial primary key,
  nome   text not null unique,
  ordem  int not null default 0
);

insert into categorias_despesa (nome, ordem) values
  ('COMBUSTÍVEL', 1), ('ÓLEO', 2), ('HANGAR', 3), ('SEGURO', 4), ('MANUTENÇÃO', 5),
  ('PEÇAS', 6), ('TAXAS DE POUSO E NAVEGAÇÃO', 7), ('DOCUMENTAÇÃO', 8),
  ('ASSINATURAS E AVIÔNICOS', 9), ('PILOTO', 10), ('VIAGEM E DIÁRIAS', 11), ('OUTROS', 99)
on conflict (nome) do nothing;

-- ---------------------------------------------------------------------
-- Diário de bordo
-- ---------------------------------------------------------------------
create table if not exists voos (
  id                       uuid primary key default gen_random_uuid(),
  aeronave_id              uuid not null references aeronaves(id),
  data                     date not null,
  -- null = SOCIEDADE (uso comum, rateado entre os sócios ativos na data)
  socio_id                 uuid references socios(id),
  piloto_id                uuid references pilotos(id),
  origem                   text check (origem ~ '^[A-Z0-9]{4}$'),
  destino                  text check (destino ~ '^[A-Z0-9]{4}$'),
  horimetro_inicial        numeric(8,1),
  horimetro_final          numeric(8,1),
  -- só quando não há horímetro (importação da planilha, voo antigo)
  horas_informadas         numeric(8,1),
  horas                    numeric(8,1) generated always as
                             (coalesce(horimetro_final - horimetro_inicial, horas_informadas, 0)) stored,
  combustivel_inicial_l    numeric(8,1),
  combustivel_final_l      numeric(8,1),
  pousos                   int not null default 1 check (pousos >= 0),
  natureza                 natureza_voo not null default 'PARTICULAR',
  observacao               text,
  foto_horimetro_inicial   text,
  foto_horimetro_final     text,
  leitura_ia               jsonb,
  status                   status_voo not null default 'RASCUNHO',
  pendente_horimetro       boolean not null default false,
  fonte                    text,
  autor_id                 uuid references usuarios(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,
  deleted_by               uuid references usuarios(id),
  constraint voos_horimetro_ordem check (horimetro_final is null or horimetro_inicial is null or horimetro_final >= horimetro_inicial),
  constraint voos_horas_positivas check (horas_informadas is null or horas_informadas >= 0),
  constraint voos_combustivel check (combustivel_inicial_l is null or combustivel_inicial_l >= 0),
  -- Uso comum não tem sócio; voo particular/instrução tem.
  constraint voos_socio_por_natureza check (
    (natureza in ('SOCIEDADE', 'TRANSLADO_MANUTENCAO', 'VOO_TESTE') and socio_id is null)
    or (natureza in ('PARTICULAR', 'INSTRUCAO') and socio_id is not null)
  )
);
create index if not exists voos_data_idx on voos (aeronave_id, data) where deleted_at is null;
create index if not exists voos_socio_idx on voos (socio_id, data) where deleted_at is null;

drop trigger if exists voos_updated_at on voos;
create trigger voos_updated_at before update on voos for each row execute function tocar_updated_at();

-- Último horímetro confirmado: é o que o próximo voo tem de começar.
create or replace function ultimo_horimetro(p_aeronave uuid) returns numeric
  language sql stable as
$$
  select horimetro_final from voos
  where aeronave_id = p_aeronave and deleted_at is null and horimetro_final is not null
  order by horimetro_final desc, data desc, created_at desc
  limit 1
$$;

-- ---------------------------------------------------------------------
-- Sócios ativos numa data e horas atribuídas a cada um
-- ---------------------------------------------------------------------
create or replace function socios_ativos_em(p_data date)
  returns table (socio_id uuid, cota numeric)
  language sql stable as
$$
  select id, cota from socios
  where ativo_desde <= p_data and (ativo_ate is null or ativo_ate >= p_data)
  order by apelido
$$;

-- Uma linha por (voo, sócio) com as horas e o combustível que cabem a ele.
-- Voo particular: tudo para o sócio. Uso comum: dividido em partes iguais.
-- Combustível sem leitura: estimado por consumo médio × horas (estimado = true).
create or replace view v_voo_socio with (security_invoker = true) as
with base as (
  select
    v.id as voo_id, v.aeronave_id, v.data, v.natureza, v.horas,
    case
      when v.combustivel_inicial_l is not null and v.combustivel_final_l is not null
        then v.combustivel_inicial_l - v.combustivel_final_l
      else round(coalesce(a.consumo_medio_lh, 0) * v.horas, 1)
    end as litros,
    (v.combustivel_inicial_l is null or v.combustivel_final_l is null) as litros_estimados,
    v.socio_id
  from voos v
  join aeronaves a on a.id = v.aeronave_id
  where v.deleted_at is null
)
select b.voo_id, b.aeronave_id, b.data, b.natureza, b.socio_id as socio_id, b.horas, b.litros, b.litros_estimados, false as uso_comum
from base b where b.socio_id is not null
union all
select b.voo_id, b.aeronave_id, b.data, b.natureza, s.socio_id, round(b.horas / n.qt, 1), round(b.litros / n.qt, 1), b.litros_estimados, true
from base b
cross join lateral (select count(*) as qt from socios_ativos_em(b.data)) n
cross join lateral socios_ativos_em(b.data) s
where b.socio_id is null and n.qt > 0;

-- Horas de cada sócio num período (o que o rateio POR_HORAS usa).
create or replace function horas_por_socio(p_aeronave uuid, p_inicio date, p_fim date)
  returns table (socio_id uuid, horas numeric)
  language sql stable as
$$
  select socio_id, coalesce(sum(horas), 0)
  from v_voo_socio
  where aeronave_id = p_aeronave and data between p_inicio and p_fim
  group by socio_id
$$;

-- ---------------------------------------------------------------------
-- Financeiro
-- ---------------------------------------------------------------------
create table if not exists despesas (
  id                 uuid primary key default gen_random_uuid(),
  aeronave_id        uuid not null references aeronaves(id),
  data               date not null,
  descricao          text not null,
  fornecedor_id      uuid references fornecedores(id),
  categoria_id       int not null references categorias_despesa(id),
  valor              numeric(14,2) not null check (valor >= 0),
  comprovante_path   text,
  -- null = pago pelo caixa da sociedade
  pagador_socio_id   uuid references socios(id),
  criterio           criterio_rateio not null default 'IGUAL',
  socio_direto_id    uuid references socios(id),
  periodo_inicio     date,
  periodo_fim        date,
  status             status_despesa not null default 'APROVADA',
  voo_id             uuid references voos(id),
  -- ponteiro sem FK (tabela vem na fase 3)
  manutencao_id      uuid,
  observacao         text,
  autor_id           uuid references usuarios(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  deleted_by         uuid references usuarios(id),
  constraint despesas_direto_tem_socio check (criterio <> 'DIRETO' or socio_direto_id is not null),
  constraint despesas_periodo check (periodo_fim is null or periodo_inicio is null or periodo_fim >= periodo_inicio)
);
create index if not exists despesas_data_idx on despesas (aeronave_id, data) where deleted_at is null;

drop trigger if exists despesas_updated_at on despesas;
create trigger despesas_updated_at before update on despesas for each row execute function tocar_updated_at();

create table if not exists rateios (
  id          uuid primary key default gen_random_uuid(),
  despesa_id  uuid not null references despesas(id) on delete cascade,
  socio_id    uuid not null references socios(id),
  percentual  numeric(7,4) not null check (percentual >= 0 and percentual <= 100),
  valor       numeric(14,2) not null,
  horas_base  numeric(8,1),
  unique (despesa_id, socio_id)
);

create table if not exists abastecimentos (
  id                uuid primary key default gen_random_uuid(),
  aeronave_id       uuid not null references aeronaves(id),
  data              date not null,
  aerodromo         text check (aerodromo ~ '^[A-Z0-9]{4}$'),
  litros            numeric(8,1) not null check (litros > 0),
  valor             numeric(14,2) not null check (valor >= 0),
  -- null = pago pelo caixa
  pagador_socio_id  uuid references socios(id),
  comprovante_path  text,
  voo_id            uuid references voos(id),
  despesa_id        uuid unique references despesas(id),
  observacao        text,
  autor_id          uuid references usuarios(id),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  deleted_by        uuid references usuarios(id)
);
create index if not exists abastecimentos_data_idx on abastecimentos (aeronave_id, data) where deleted_at is null;

create table if not exists aportes (
  id                uuid primary key default gen_random_uuid(),
  socio_id          uuid not null references socios(id),
  data              date not null,
  valor             numeric(14,2) not null check (valor > 0),
  comprovante_path  text,
  descricao         text,
  autor_id          uuid references usuarios(id),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  deleted_by        uuid references usuarios(id)
);

create table if not exists fundo_reserva_movimentos (
  id              uuid primary key default gen_random_uuid(),
  aeronave_id     uuid not null references aeronaves(id),
  socio_id        uuid references socios(id),
  mes             date not null,
  tipo            tipo_movimento_fundo not null,
  horas           numeric(8,1),
  valor_por_hora  numeric(14,2),
  valor           numeric(14,2) not null check (valor >= 0),
  descricao       text,
  despesa_id      uuid references despesas(id),
  created_at      timestamptz not null default now()
);
-- Uma provisão por sócio e mês (a saída não tem sócio, então fica fora do unique).
create unique index if not exists fundo_reserva_provisao_unq
  on fundo_reserva_movimentos (aeronave_id, socio_id, mes) where tipo = 'ENTRADA';

create table if not exists fechamentos (
  id               uuid primary key default gen_random_uuid(),
  aeronave_id      uuid not null references aeronaves(id),
  mes              date not null,
  status           status_fechamento not null default 'ABERTO',
  fechado_por      uuid references usuarios(id),
  fechado_em       timestamptz,
  horimetro_final  numeric(8,1),
  resumo           jsonb,
  unique (aeronave_id, mes)
);

create or replace function mes_fechado(p_aeronave uuid, p_data date) returns boolean
  language sql stable as
$$
  select exists (
    select 1 from fechamentos
    where aeronave_id = p_aeronave and mes = date_trunc('month', p_data)::date and status = 'FECHADO'
  )
$$;

-- ---------------------------------------------------------------------
-- Mês fechado não aceita voo, despesa, abastecimento nem aporte com data
-- dentro dele. Só reabrir (admin) libera.
-- ---------------------------------------------------------------------
create or replace function barrar_mes_fechado() returns trigger
  language plpgsql as
$$
declare v_aeronave uuid; v_data date;
begin
  if tg_table_name = 'aportes' then
    v_aeronave := (select id from aeronaves where ativo order by created_at limit 1);
  else
    v_aeronave := coalesce(new.aeronave_id, old.aeronave_id);
  end if;
  v_data := coalesce(new.data, old.data);
  if mes_fechado(v_aeronave, v_data) then
    raise exception 'O mês de % está fechado. Peça ao administrador para reabrir.', to_char(v_data, 'MM/YYYY');
  end if;
  if tg_op = 'UPDATE' and old.data <> new.data and mes_fechado(v_aeronave, old.data) then
    raise exception 'O mês de % está fechado. Peça ao administrador para reabrir.', to_char(old.data, 'MM/YYYY');
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['voos', 'despesas', 'abastecimentos', 'aportes'] loop
    execute format('drop trigger if exists %I_mes_fechado on %I', t, t);
    execute format('create trigger %I_mes_fechado before insert or update on %I for each row execute function barrar_mes_fechado()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Rateio de uma despesa
--
-- IGUAL     → pela cota dos sócios ativos na data.
-- POR_HORAS → pelas horas de cada sócio no período (padrão: o mês da data).
--             Sem hora nenhuma no período, cai em IGUAL.
-- DIRETO    → 100% do sócio indicado.
-- MANUAL    → não mexe (os percentuais foram digitados); só confere 100%.
-- Centavos: o resto do arredondamento vai para a maior parte.
-- ---------------------------------------------------------------------
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

    -- IGUAL, ou POR_HORAS sem nenhuma hora no período
    if not exists (select 1 from rateios where despesa_id = p_despesa) then
      insert into rateios (despesa_id, socio_id, percentual, valor)
      select p_despesa, s.socio_id,
             round(100 * s.cota / t.total, 4),
             round(d.valor * s.cota / t.total, 2)
      from socios_ativos_em(d.data) s
      cross join (select sum(cota) as total from socios_ativos_em(d.data)) t;
    end if;
  end if;

  -- Fecha os centavos na maior parte.
  select coalesce(sum(valor), 0) into v_soma from rateios where despesa_id = p_despesa;
  if v_soma <> d.valor then
    select socio_id into v_maior from rateios where despesa_id = p_despesa order by valor desc, socio_id limit 1;
    update rateios set valor = valor + (d.valor - v_soma) where despesa_id = p_despesa and socio_id = v_maior;
  end if;

  update despesas set status = 'RATEADA' where id = p_despesa and status <> 'PENDENTE';
end $$;

-- Rateio MANUAL vindo da tela: percentuais por sócio, fechados em 100.
-- Roda como dono porque o sócio não tem policy de escrita em rateios.
create or replace function definir_rateio_manual(p_despesa uuid, p_percentuais jsonb) returns void
  language plpgsql security definer set search_path = public as
$$
declare v_soma numeric;
begin
  if not ve_valores() then raise exception 'Sem acesso.'; end if;
  if not exists (select 1 from despesas where id = p_despesa and deleted_at is null) then
    raise exception 'Despesa não encontrada.';
  end if;
  select coalesce(sum((e->>'percentual')::numeric), 0) into v_soma from jsonb_array_elements(p_percentuais) e;
  if round(v_soma, 2) <> 100 then
    raise exception 'Rateio manual soma % por cento; precisa somar 100.', v_soma;
  end if;
  update despesas set criterio = 'MANUAL' where id = p_despesa and criterio <> 'MANUAL';
  delete from rateios where despesa_id = p_despesa;
  insert into rateios (despesa_id, socio_id, percentual, valor)
  select p_despesa, (e->>'socio_id')::uuid, (e->>'percentual')::numeric, 0
  from jsonb_array_elements(p_percentuais) e
  where (e->>'percentual')::numeric > 0;
  perform calcular_rateio(p_despesa);
end $$;

create or replace function despesas_ratear() returns trigger
  language plpgsql as
$$
begin
  if new.deleted_at is not null then
    delete from rateios where despesa_id = new.id;
    return new;
  end if;
  if new.criterio <> 'MANUAL' then
    perform calcular_rateio(new.id);
  end if;
  return new;
end $$;

drop trigger if exists despesas_ratear on despesas;
create trigger despesas_ratear after insert or update of valor, criterio, socio_direto_id, periodo_inicio, periodo_fim, data, deleted_at
  on despesas for each row execute function despesas_ratear();

-- Voo novo ou alterado: as despesas POR_HORAS do mês mudam de proporção.
create or replace function voos_recalcular_rateios() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare r record; v_data date; v_aeronave uuid;
begin
  v_data := coalesce(new.data, old.data);
  v_aeronave := coalesce(new.aeronave_id, old.aeronave_id);
  for r in
    select id from despesas
    where aeronave_id = v_aeronave and deleted_at is null and criterio = 'POR_HORAS'
      and v_data between coalesce(periodo_inicio, date_trunc('month', data)::date)
                     and coalesce(periodo_fim, (date_trunc('month', data) + interval '1 month - 1 day')::date)
      and not mes_fechado(aeronave_id, data)
  loop
    perform calcular_rateio(r.id);
  end loop;
  perform provisionar_fundo_reserva(v_aeronave, date_trunc('month', v_data)::date);
  if tg_op = 'UPDATE' and old.data <> new.data then
    perform provisionar_fundo_reserva(v_aeronave, date_trunc('month', old.data)::date);
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Fundo de reserva: valor por hora × horas de cada sócio no mês.
-- Recalculado a cada voo enquanto o mês está aberto; congela no fechamento.
-- ---------------------------------------------------------------------
create or replace function valor_fundo_em(p_aeronave uuid, p_data date) returns numeric
  language sql stable as
$$
  select coalesce(
    (select valor_por_hora from fundo_reserva_valores
      where aeronave_id = p_aeronave and vigente_desde <= p_data
      order by vigente_desde desc limit 1),
    (select fundo_reserva_por_hora from aeronaves where id = p_aeronave))
$$;

create or replace function provisionar_fundo_reserva(p_aeronave uuid, p_mes date) returns void
  language plpgsql security definer set search_path = public as
$$
declare v_mes date := date_trunc('month', p_mes)::date; v_valor numeric;
begin
  if mes_fechado(p_aeronave, v_mes) then return; end if;
  v_valor := valor_fundo_em(p_aeronave, v_mes);

  delete from fundo_reserva_movimentos
  where aeronave_id = p_aeronave and mes = v_mes and tipo = 'ENTRADA';

  insert into fundo_reserva_movimentos (aeronave_id, socio_id, mes, tipo, horas, valor_por_hora, valor, descricao)
  select p_aeronave, h.socio_id, v_mes, 'ENTRADA', h.horas, v_valor, round(h.horas * v_valor, 2),
         'FUNDO DE RESERVA ' || to_char(v_mes, 'MM/YYYY')
  from horas_por_socio(p_aeronave, v_mes, (v_mes + interval '1 month - 1 day')::date) h
  where h.horas > 0;
end $$;

drop trigger if exists voos_recalcular_rateios on voos;
create trigger voos_recalcular_rateios after insert or update or delete on voos
  for each row execute function voos_recalcular_rateios();

-- ---------------------------------------------------------------------
-- Abastecimento vira despesa COMBUSTÍVEL, DIRETO de quem pagou (regra do
-- tanque cheio: o que ele abasteceu é custo dele; os litros entram no saldo).
-- Pago pelo caixa: rateio IGUAL.
-- ---------------------------------------------------------------------
create or replace function abastecimento_gerar_despesa() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare v_cat int; v_desc text;
begin
  select id into v_cat from categorias_despesa where nome = 'COMBUSTÍVEL';
  v_desc := 'ABASTECIMENTO ' || new.litros || ' L' || coalesce(' EM ' || new.aerodromo, '');

  if new.deleted_at is not null then
    if new.despesa_id is not null then
      update despesas set deleted_at = new.deleted_at, deleted_by = new.deleted_by where id = new.despesa_id;
    end if;
    return new;
  end if;

  if new.despesa_id is null then
    insert into despesas (aeronave_id, data, descricao, categoria_id, valor, comprovante_path, pagador_socio_id,
                          criterio, socio_direto_id, voo_id, autor_id)
    values (new.aeronave_id, new.data, v_desc, v_cat, new.valor, new.comprovante_path, new.pagador_socio_id,
            case when new.pagador_socio_id is null then 'IGUAL' else 'DIRETO' end::criterio_rateio,
            new.pagador_socio_id, new.voo_id, new.autor_id)
    returning id into new.despesa_id;
  else
    update despesas set
      data = new.data, descricao = v_desc, valor = new.valor, comprovante_path = new.comprovante_path,
      pagador_socio_id = new.pagador_socio_id,
      criterio = case when new.pagador_socio_id is null then 'IGUAL' else 'DIRETO' end::criterio_rateio,
      socio_direto_id = new.pagador_socio_id, voo_id = new.voo_id
    where id = new.despesa_id;
  end if;
  return new;
end $$;

drop trigger if exists abastecimentos_despesa on abastecimentos;
create trigger abastecimentos_despesa before insert or update on abastecimentos
  for each row execute function abastecimento_gerar_despesa();

-- ---------------------------------------------------------------------
-- Combustível por sócio e mês: abastecido − consumido, valorado pelo preço
-- médio dos abastecimentos do mês (ou do último mês com abastecimento).
-- ---------------------------------------------------------------------
create or replace view v_preco_combustivel_mes with (security_invoker = true) as
select aeronave_id, date_trunc('month', data)::date as mes,
       round(sum(valor) / nullif(sum(litros), 0), 4) as preco_litro
from abastecimentos where deleted_at is null
group by aeronave_id, date_trunc('month', data);

create or replace function preco_combustivel_em(p_aeronave uuid, p_mes date) returns numeric
  language sql stable security invoker as
$$
  select preco_litro from v_preco_combustivel_mes
  where aeronave_id = p_aeronave and mes <= date_trunc('month', p_mes)::date
  order by mes desc limit 1
$$;

create or replace view v_combustivel_socio_mes with (security_invoker = true) as
with consumo as (
  select aeronave_id, socio_id, date_trunc('month', data)::date as mes,
         sum(litros) as litros_consumidos, bool_or(litros_estimados) as tem_estimativa
  from v_voo_socio group by 1, 2, 3
), abastecido as (
  select aeronave_id, pagador_socio_id as socio_id, date_trunc('month', data)::date as mes,
         sum(litros) as litros_abastecidos
  from abastecimentos where deleted_at is null and pagador_socio_id is not null
  group by 1, 2, 3
)
select
  coalesce(c.aeronave_id, a.aeronave_id) as aeronave_id,
  coalesce(c.socio_id, a.socio_id) as socio_id,
  coalesce(c.mes, a.mes) as mes,
  coalesce(a.litros_abastecidos, 0) as litros_abastecidos,
  coalesce(c.litros_consumidos, 0) as litros_consumidos,
  coalesce(a.litros_abastecidos, 0) - coalesce(c.litros_consumidos, 0) as saldo_litros,
  coalesce(c.tem_estimativa, false) as tem_estimativa,
  preco_combustivel_em(coalesce(c.aeronave_id, a.aeronave_id), coalesce(c.mes, a.mes)) as preco_litro,
  round((coalesce(a.litros_abastecidos, 0) - coalesce(c.litros_consumidos, 0))
        * coalesce(preco_combustivel_em(coalesce(c.aeronave_id, a.aeronave_id), coalesce(c.mes, a.mes)), 0), 2) as valor
from consumo c
full join abastecido a on a.aeronave_id = c.aeronave_id and a.socio_id = c.socio_id and a.mes = c.mes;

-- ---------------------------------------------------------------------
-- Extrato do sócio: tudo que é entre ele e a sociedade.
--   crédito: aporte; despesa que ele pagou do bolso (fora a parte dele);
--            combustível que deixou a mais.
--   débito:  a parte dele em cada rateio (menos o que ele mesmo pagou);
--            combustível que usou a mais; fundo de reserva.
-- Despesa DIRETO paga pelo próprio sócio não aparece: é custo dele, sem
-- passar pela sociedade (fica no custo por sócio, não no extrato).
-- ---------------------------------------------------------------------
create or replace view v_extrato_socio with (security_invoker = true) as
select a.socio_id, a.data, 'APORTE'::text as tipo, coalesce(a.descricao, 'APORTE') as descricao,
       a.valor as credito, 0::numeric(14,2) as debito, a.id as origem_id, 'aportes'::text as origem
from aportes a where a.deleted_at is null
union all
-- despesa paga pelo sócio: crédito do valor inteiro
select d.pagador_socio_id, d.data, 'PAGOU', d.descricao, d.valor, 0, d.id, 'despesas'
from despesas d
where d.deleted_at is null and d.pagador_socio_id is not null
  and not (d.criterio = 'DIRETO' and d.socio_direto_id = d.pagador_socio_id)
union all
-- a parte de cada um em cada despesa: débito
select r.socio_id, d.data, 'RATEIO', d.descricao, 0, r.valor, d.id, 'despesas'
from rateios r join despesas d on d.id = r.despesa_id
where d.deleted_at is null
  and not (d.criterio = 'DIRETO' and d.socio_direto_id = d.pagador_socio_id)
union all
-- fundo de reserva do mês
select f.socio_id, f.mes, 'FUNDO', f.descricao, 0, f.valor, f.id, 'fundo_reserva_movimentos'
from fundo_reserva_movimentos f where f.tipo = 'ENTRADA' and f.socio_id is not null
union all
-- combustível do mês: saldo em litros valorado
select c.socio_id, c.mes, 'COMBUSTÍVEL',
       'COMBUSTÍVEL ' || to_char(c.mes, 'MM/YYYY') || ': ' || c.litros_abastecidos || ' L ABASTECIDOS − '
         || c.litros_consumidos || ' L USADOS = ' || c.saldo_litros || ' L'
         || case when c.tem_estimativa then ' (PARTE ESTIMADA)' else '' end,
       case when c.valor > 0 then c.valor else 0 end,
       case when c.valor < 0 then -c.valor else 0 end,
       null::uuid, 'v_combustivel_socio_mes'
from v_combustivel_socio_mes c where c.valor <> 0;

create or replace view v_saldo_socio with (security_invoker = true) as
select s.id as socio_id, s.apelido, s.nome, s.cor,
       coalesce(sum(e.credito), 0)::numeric(14,2) as creditos,
       coalesce(sum(e.debito), 0)::numeric(14,2) as debitos,
       (coalesce(sum(e.credito), 0) - coalesce(sum(e.debito), 0))::numeric(14,2) as saldo
from socios s left join v_extrato_socio e on e.socio_id = s.id
where ve_valores()
group by s.id, s.apelido, s.nome, s.cor;

-- Horas e custo por sócio e mês (painel).
create or replace view v_socio_mes with (security_invoker = true) as
with h as (
  select socio_id, date_trunc('month', data)::date as mes, sum(horas) as horas, count(*) as voos
  from v_voo_socio group by 1, 2
), c as (
  select r.socio_id, date_trunc('month', d.data)::date as mes, sum(r.valor) as custo
  from rateios r join despesas d on d.id = r.despesa_id where d.deleted_at is null
  group by 1, 2
)
select s.id as socio_id, s.apelido, s.cor, m.mes,
       coalesce(h.horas, 0)::numeric(8,1) as horas, coalesce(h.voos, 0) as voos,
       coalesce(c.custo, 0)::numeric(14,2) as custo
from socios s
cross join (select distinct mes from h union select distinct mes from c) m
left join h on h.socio_id = s.id and h.mes = m.mes
left join c on c.socio_id = s.id and c.mes = m.mes;

-- Caixa da sociedade: aportes entram, despesas pagas pelo caixa saem.
create or replace view v_caixa with (security_invoker = true) as
select a.data, 'APORTE ' || s.apelido as descricao, a.valor as entrada, 0::numeric(14,2) as saida, a.id as origem_id
from aportes a join socios s on s.id = a.socio_id where a.deleted_at is null
union all
select d.data, d.descricao, 0, d.valor, d.id
from despesas d where d.deleted_at is null and d.pagador_socio_id is null;

-- ---------------------------------------------------------------------
-- CAIXA ALTA automática nos cadastros
-- ---------------------------------------------------------------------
create or replace function normalizar_texto() returns trigger
  language plpgsql as
$$
begin
  if tg_table_name = 'socios' then
    new.nome := caixa_alta(new.nome); new.apelido := caixa_alta(new.apelido);
  elsif tg_table_name = 'pilotos' then
    new.nome := caixa_alta(new.nome);
  elsif tg_table_name = 'fornecedores' then
    new.nome := caixa_alta(new.nome); new.cidade := caixa_alta(new.cidade);
  elsif tg_table_name = 'aerodromos' then
    new.icao := caixa_alta(new.icao); new.nome := caixa_alta(new.nome); new.cidade := caixa_alta(new.cidade);
  elsif tg_table_name = 'voos' then
    new.origem := caixa_alta(new.origem); new.destino := caixa_alta(new.destino);
    new.observacao := caixa_alta(new.observacao);
  elsif tg_table_name = 'despesas' then
    new.descricao := caixa_alta(new.descricao); new.observacao := caixa_alta(new.observacao);
  elsif tg_table_name = 'abastecimentos' then
    new.aerodromo := caixa_alta(new.aerodromo); new.observacao := caixa_alta(new.observacao);
  elsif tg_table_name = 'aportes' then
    new.descricao := caixa_alta(new.descricao);
  elsif tg_table_name = 'usuarios' then
    new.nome := caixa_alta(new.nome);
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['socios', 'pilotos', 'fornecedores', 'aerodromos', 'voos', 'despesas', 'abastecimentos', 'aportes', 'usuarios'] loop
    execute format('drop trigger if exists %I_caixa_alta on %I', t, t);
    execute format('create trigger %I_caixa_alta before insert or update on %I for each row execute function normalizar_texto()', t, t);
  end loop;
end $$;

-- Aeródromo novo entra no cadastro sozinho a partir do voo.
create or replace function cadastrar_aerodromo_do_voo() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  if new.origem is not null then insert into aerodromos (icao) values (new.origem) on conflict do nothing; end if;
  if new.destino is not null then insert into aerodromos (icao) values (new.destino) on conflict do nothing; end if;
  return new;
end $$;
drop trigger if exists voos_aerodromo on voos;
create trigger voos_aerodromo after insert or update of origem, destino on voos
  for each row execute function cadastrar_aerodromo_do_voo();

-- ---------------------------------------------------------------------
-- RLS
--   admin  → tudo
--   socio  → lê tudo; grava voos, despesas, abastecimentos, aportes;
--            altera o que ele mesmo lançou
--   piloto → lê cadastros e voos; grava voos; NUNCA lê valores
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['usuarios', 'aeronaves', 'fundo_reserva_valores', 'socios', 'pilotos', 'aerodromos',
                           'fornecedores', 'categorias_despesa', 'voos', 'despesas', 'rateios', 'abastecimentos',
                           'aportes', 'fundo_reserva_movimentos', 'fechamentos'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- usuarios
drop policy if exists usuarios_propria_linha on usuarios;
create policy usuarios_propria_linha on usuarios for select using (id = auth.uid());
drop policy if exists usuarios_admin on usuarios;
create policy usuarios_admin on usuarios for all using (sou_admin()) with check (sou_admin());

-- cadastros: todo mundo logado lê; admin administra; sócio cadastra aeródromo e fornecedor
do $$
declare t text;
begin
  foreach t in array array['aeronaves', 'fundo_reserva_valores', 'socios', 'pilotos', 'aerodromos', 'fornecedores', 'categorias_despesa'] loop
    execute format('drop policy if exists %I_ler on %I', t, t);
    execute format('create policy %I_ler on %I for select to authenticated using (meu_perfil() is not null)', t, t);
    execute format('drop policy if exists %I_admin on %I', t, t);
    execute format('create policy %I_admin on %I for all using (sou_admin()) with check (sou_admin())', t, t);
  end loop;
end $$;
drop policy if exists aerodromos_socio on aerodromos;
create policy aerodromos_socio on aerodromos for insert with check (meu_perfil() is not null);
drop policy if exists fornecedores_socio on fornecedores;
create policy fornecedores_socio on fornecedores for insert with check (ve_valores());

-- voos: quem está logado lê e lança; altera o próprio; admin tudo
drop policy if exists voos_ler on voos;
create policy voos_ler on voos for select using (meu_perfil() is not null);
drop policy if exists voos_lancar on voos;
create policy voos_lancar on voos for insert with check (meu_perfil() is not null and autor_id = auth.uid());
drop policy if exists voos_proprio on voos;
create policy voos_proprio on voos for update using (autor_id = auth.uid() or sou_admin()) with check (autor_id = auth.uid() or sou_admin());

-- valores: só admin e sócio
do $$
declare t text;
begin
  foreach t in array array['despesas', 'abastecimentos', 'aportes'] loop
    execute format('drop policy if exists %I_ler on %I', t, t);
    execute format('create policy %I_ler on %I for select using (ve_valores())', t, t);
    execute format('drop policy if exists %I_lancar on %I', t, t);
    execute format('create policy %I_lancar on %I for insert with check (ve_valores() and autor_id = auth.uid())', t, t);
    execute format('drop policy if exists %I_proprio on %I', t, t);
    execute format('create policy %I_proprio on %I for update using (ve_valores() and (autor_id = auth.uid() or sou_admin())) with check (ve_valores() and (autor_id = auth.uid() or sou_admin()))', t, t);
  end loop;
  foreach t in array array['rateios', 'fundo_reserva_movimentos', 'fechamentos'] loop
    execute format('drop policy if exists %I_ler on %I', t, t);
    execute format('create policy %I_ler on %I for select using (ve_valores())', t, t);
    execute format('drop policy if exists %I_admin on %I', t, t);
    execute format('create policy %I_admin on %I for all using (sou_admin()) with check (sou_admin())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Storage: buckets privados. Fotos de horímetro: todo logado. Comprovantes:
-- só quem vê valores. O app assina a URL para mostrar.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('horimetro', 'horimetro', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('comprovantes', 'comprovantes', false) on conflict (id) do nothing;

drop policy if exists horimetro_ler on storage.objects;
create policy horimetro_ler on storage.objects for select using (bucket_id = 'horimetro' and meu_perfil() is not null);
drop policy if exists horimetro_gravar on storage.objects;
create policy horimetro_gravar on storage.objects for insert with check (bucket_id = 'horimetro' and meu_perfil() is not null);
drop policy if exists comprovantes_ler on storage.objects;
create policy comprovantes_ler on storage.objects for select using (bucket_id = 'comprovantes' and ve_valores());
drop policy if exists comprovantes_gravar on storage.objects;
create policy comprovantes_gravar on storage.objects for insert with check (bucket_id = 'comprovantes' and ve_valores());

-- ---------------------------------------------------------------------
-- Dados iniciais: a aeronave e os quatro sócios
-- ---------------------------------------------------------------------
insert into aeronaves (matricula, modelo, base_icao, capacidade_combustivel_l, consumo_medio_lh, tbo_motor_horas, fundo_reserva_por_hora)
values ('PP-ZNM', 'VAN''S RV-10', 'SNTF', 227, 38, 2000, 150)
on conflict (matricula) do nothing;

insert into socios (nome, apelido, cota, cor, ativo_desde) values
  ('ARTHUR', 'ARTHUR', 25, '#E4782A', '2026-05-01'),
  ('MARCELINO', 'MARCELINO', 25, '#2E7D4F', '2026-05-01'),
  ('CAETANO', 'CAETANO', 25, '#3E5C76', '2026-05-01'),
  ('WANDERSON', 'WANDERSON', 25, '#B7791F', '2026-05-01')
on conflict (apelido) do nothing;

-- Cada sócio também é piloto.
insert into pilotos (nome, socio_id)
select s.nome, s.id from socios s where not exists (select 1 from pilotos p where p.socio_id = s.id);

insert into aerodromos (icao, nome, cidade) values
  ('SNTF', 'TEIXEIRA DE FREITAS', 'TEIXEIRA DE FREITAS/BA')
on conflict (icao) do nothing;

notify pgrst, 'reload schema';
