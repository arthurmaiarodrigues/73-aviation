-- =====================================================================
-- schema_v4c_conciliacao.sql — Fase 4c: extrato bancário e conciliação.
-- Rodar no SQL Editor depois do schema_v4b. Idempotente.
--
-- O extrato (OFX ou CSV do Sicoob) entra em `extrato_banco`, uma linha por
-- lançamento (FITID é a chave: importar de novo não duplica). Cada linha
-- é casada com uma despesa paga pelo caixa, um aporte, ou marcada como
-- ignorada (tarifa, transferência interna). O app sugere pelo valor e
-- pela data (± 5 dias); quem confirma é o admin.
-- =====================================================================

do $$ begin
  create type status_extrato as enum ('PENDENTE', 'CONCILIADO', 'IGNORADO');
exception when duplicate_object then null; end $$;

create table if not exists extrato_banco (
  id             uuid primary key default gen_random_uuid(),
  aeronave_id    uuid not null references aeronaves(id),
  banco          text not null,
  conta          text not null,
  fitid          text not null,
  data           date not null,
  valor          numeric(14,2) not null,       -- negativo = saiu da conta
  descricao      text,
  referencia     text,
  status         status_extrato not null default 'PENDENTE',
  despesa_id     uuid references despesas(id),
  aporte_id      uuid references aportes(id),
  motivo_ignorar text,
  conciliado_por uuid references usuarios(id),
  conciliado_em  timestamptz,
  importado_em   timestamptz not null default now(),
  arquivo        text,
  unique (conta, fitid),
  constraint extrato_um_destino check (
    (status = 'CONCILIADO' and (despesa_id is not null or aporte_id is not null))
    or (status <> 'CONCILIADO' and despesa_id is null and aporte_id is null)
  )
);
create index if not exists extrato_banco_status_idx on extrato_banco (aeronave_id, status, data);
create unique index if not exists extrato_banco_despesa_unq on extrato_banco (despesa_id) where despesa_id is not null;
create unique index if not exists extrato_banco_aporte_unq on extrato_banco (aporte_id) where aporte_id is not null;

-- Sugestões para uma linha do extrato: despesa paga pelo caixa com o mesmo
-- valor (saída) ou aporte com o mesmo valor (entrada), ainda sem
-- conciliação, até 5 dias de distância. Ordenadas pela distância.
create or replace function sugestoes_extrato(p_linha uuid)
  returns table (tipo text, id uuid, data date, descricao text, valor numeric, quem text, dias int)
  language sql stable security invoker as
$$
  with l as (select * from extrato_banco where id = p_linha)
  select 'DESPESA', d.id, d.data, d.descricao, d.valor, 'CAIXA', abs(d.data - l.data)
  from despesas d, l
  where l.valor < 0 and d.deleted_at is null and d.pagador_socio_id is null and d.aeronave_id = l.aeronave_id
    and d.valor = -l.valor and abs(d.data - l.data) <= 5
    and not exists (select 1 from extrato_banco e where e.despesa_id = d.id)
  union all
  select 'APORTE', a.id, a.data, coalesce(a.descricao, 'APORTE'), a.valor, s.apelido, abs(a.data - l.data)
  from aportes a join socios s on s.id = a.socio_id, l
  where l.valor > 0 and a.deleted_at is null and a.valor = l.valor and abs(a.data - l.data) <= 5
    and not exists (select 1 from extrato_banco e where e.aporte_id = a.id)
  order by 7, 3
$$;

-- Conciliar / ignorar / desfazer (admin).
create or replace function conciliar_linha(p_linha uuid, p_tipo text, p_id uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare l extrato_banco%rowtype; v numeric;
begin
  if not sou_admin() then raise exception 'Só o administrador concilia.'; end if;
  select * into l from extrato_banco where id = p_linha;
  if not found then raise exception 'Linha não encontrada.'; end if;
  if p_tipo = 'DESPESA' then
    select valor into v from despesas where id = p_id and deleted_at is null and pagador_socio_id is null;
    if v is null then raise exception 'Despesa não encontrada ou não é paga pelo caixa.'; end if;
    if v <> -l.valor then raise exception 'Valor diferente: extrato % × despesa %.', -l.valor, v; end if;
    update extrato_banco set status = 'CONCILIADO', despesa_id = p_id, aporte_id = null, motivo_ignorar = null, conciliado_por = auth.uid(), conciliado_em = now() where id = p_linha;
  elsif p_tipo = 'APORTE' then
    select valor into v from aportes where id = p_id and deleted_at is null;
    if v is null then raise exception 'Aporte não encontrado.'; end if;
    if v <> l.valor then raise exception 'Valor diferente: extrato % × aporte %.', l.valor, v; end if;
    update extrato_banco set status = 'CONCILIADO', aporte_id = p_id, despesa_id = null, motivo_ignorar = null, conciliado_por = auth.uid(), conciliado_em = now() where id = p_linha;
  else
    raise exception 'Tipo inválido.';
  end if;
end $$;

create or replace function ignorar_linha(p_linha uuid, p_motivo text) returns void
  language plpgsql security definer set search_path = public as
$$
begin
  if not sou_admin() then raise exception 'Só o administrador concilia.'; end if;
  update extrato_banco set status = 'IGNORADO', despesa_id = null, aporte_id = null, motivo_ignorar = caixa_alta(p_motivo), conciliado_por = auth.uid(), conciliado_em = now()
  where id = p_linha;
end $$;

create or replace function desfazer_conciliacao(p_linha uuid) returns void
  language plpgsql security definer set search_path = public as
$$
begin
  if not sou_admin() then raise exception 'Só o administrador concilia.'; end if;
  update extrato_banco set status = 'PENDENTE', despesa_id = null, aporte_id = null, motivo_ignorar = null, conciliado_por = null, conciliado_em = null
  where id = p_linha;
end $$;

-- Visão: quanto do extrato está batido, por mês.
create or replace view v_conciliacao_mes with (security_invoker = true) as
select aeronave_id, date_trunc('month', data)::date as mes,
       count(*) as linhas,
       count(*) filter (where status = 'PENDENTE') as pendentes,
       count(*) filter (where status = 'CONCILIADO') as conciliadas,
       count(*) filter (where status = 'IGNORADO') as ignoradas,
       sum(valor) filter (where valor > 0) as entradas,
       -sum(valor) filter (where valor < 0) as saidas
from extrato_banco
group by aeronave_id, date_trunc('month', data);

alter table extrato_banco enable row level security;
drop policy if exists extrato_banco_ler on extrato_banco;
create policy extrato_banco_ler on extrato_banco for select using (ve_valores());
drop policy if exists extrato_banco_admin on extrato_banco;
create policy extrato_banco_admin on extrato_banco for all using (sou_admin()) with check (sou_admin());

notify pgrst, 'reload schema';
