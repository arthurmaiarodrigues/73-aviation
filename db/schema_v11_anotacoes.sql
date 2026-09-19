-- =====================================================================
-- schema_v11_anotacoes.sql — anotações de problemas na aeronave para a
-- próxima revisão (o "livro de discrepâncias" do dia a dia).
-- Rodar no SQL Editor depois do schema_v10. Idempotente.
--
-- Admin e piloto anotam (com foto); todo mundo logado lê; admin ou piloto
-- marca como resolvida (opcionalmente ligando à manutenção que resolveu).
-- =====================================================================

create table if not exists anotacoes_aeronave (
  id             uuid primary key default gen_random_uuid(),
  aeronave_id    uuid not null references aeronaves(id),
  data           date not null default current_date,
  descricao      text not null,
  gravidade      text not null default 'OBSERVACAO' check (gravidade in ('OBSERVACAO', 'ATENCAO', 'URGENTE')),
  foto_path      text,
  horimetro      numeric(8,1),
  resolvida_em   date,
  resolvida_por  uuid references usuarios(id),
  resolucao      text,
  manutencao_id  uuid references manutencoes(id),
  autor_id       uuid references usuarios(id),
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists anotacoes_abertas_idx on anotacoes_aeronave (aeronave_id) where resolvida_em is null and deleted_at is null;

drop trigger if exists anotacoes_caixa_alta on anotacoes_aeronave;
create or replace function normalizar_anotacao() returns trigger
  language plpgsql as
$$
begin
  new.descricao := caixa_alta(new.descricao);
  new.resolucao := caixa_alta(new.resolucao);
  return new;
end $$;
create trigger anotacoes_caixa_alta before insert or update on anotacoes_aeronave for each row execute function normalizar_anotacao();

alter table anotacoes_aeronave enable row level security;
drop policy if exists anotacoes_ler on anotacoes_aeronave;
create policy anotacoes_ler on anotacoes_aeronave for select using (meu_perfil() is not null);
drop policy if exists anotacoes_lancar on anotacoes_aeronave;
create policy anotacoes_lancar on anotacoes_aeronave for insert with check (meu_perfil() in ('admin', 'piloto') and autor_id = auth.uid());
drop policy if exists anotacoes_alterar on anotacoes_aeronave;
create policy anotacoes_alterar on anotacoes_aeronave for update using (meu_perfil() in ('admin', 'piloto')) with check (meu_perfil() in ('admin', 'piloto'));

-- Fotos das anotações: bucket próprio; todo logado lê e grava.
insert into storage.buckets (id, name, public) values ('anotacoes', 'anotacoes', false) on conflict (id) do nothing;
drop policy if exists anotacoes_fotos_ler on storage.objects;
create policy anotacoes_fotos_ler on storage.objects for select using (bucket_id = 'anotacoes' and meu_perfil() is not null);
drop policy if exists anotacoes_fotos_gravar on storage.objects;
create policy anotacoes_fotos_gravar on storage.objects for insert with check (bucket_id = 'anotacoes' and meu_perfil() is not null);

notify pgrst, 'reload schema';
