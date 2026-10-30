-- =====================================================================
-- schema_v45_whatsapp.sql — avisos também pelo WhatsApp.
-- Rodar no SQL Editor depois do v44. Idempotente.
--
-- O push só chega em quem instalou o app na tela inicial e ativou os
-- avisos; o WhatsApp todo mundo lê. Os mesmos avisos que já existem
-- (pedido de reserva, pedido liberado, voo agendado, anotação urgente,
-- reembolso, reserva sem voo) passam a sair pelos dois caminhos.
--
-- Pela API oficial da Meta só se manda MODELO aprovado, então o texto
-- do aviso vai dentro de um modelo único (ver lib/whatsapp.ts).
-- =====================================================================

alter table socios   add column if not exists whatsapp text;
alter table pilotos  add column if not exists whatsapp text;
alter table usuarios add column if not exists avisa_whatsapp boolean not null default true;

comment on column socios.whatsapp is 'Telefone em dígitos com DDI (5573…). Vazio = não recebe aviso por WhatsApp.';
comment on column usuarios.avisa_whatsapp is 'Chave liga/desliga por pessoa; o telefone fica cadastrado.';

-- ---------------------------------------------------------------------
-- Telefone sempre em dígitos, com o 55 na frente: é o formato que a
-- Meta exige. Quem digita "(73) 98811-2233" fica 5573988112233.
-- ---------------------------------------------------------------------
create or replace function telefone_whatsapp(p text) returns text
  language plpgsql immutable as
$$
declare d text;
begin
  d := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  if d = '' then return null; end if;
  if length(d) in (10, 11) then d := '55' || d; end if;   -- DDD + número
  return d;
end $$;

-- CAIXA ALTA de sempre + telefone normalizado
create or replace function normalizar_texto() returns trigger
  language plpgsql as
$$
begin
  if tg_table_name = 'socios' then
    new.nome := caixa_alta(new.nome); new.apelido := caixa_alta(new.apelido);
    new.whatsapp := telefone_whatsapp(new.whatsapp);
  elsif tg_table_name = 'pilotos' then
    new.nome := caixa_alta(new.nome);
    new.whatsapp := telefone_whatsapp(new.whatsapp);
  elsif tg_table_name = 'fornecedores' then
    new.nome := caixa_alta(new.nome); new.cidade := caixa_alta(new.cidade);
  elsif tg_table_name = 'aerodromos' then
    new.icao := caixa_alta(new.icao); new.nome := caixa_alta(new.nome); new.cidade := caixa_alta(new.cidade);
  elsif tg_table_name = 'voos' then
    new.origem := caixa_alta(new.origem); new.destino := caixa_alta(new.destino);
    new.observacao := caixa_alta(new.observacao);
  elsif tg_table_name = 'despesas' then
    new.descricao := caixa_alta(new.descricao); new.observacao := caixa_alta(new.observacao);
    new.cidade := caixa_alta(new.cidade);
  elsif tg_table_name = 'abastecimentos' then
    new.aerodromo := caixa_alta(new.aerodromo); new.observacao := caixa_alta(new.observacao);
  elsif tg_table_name = 'aportes' then
    new.descricao := caixa_alta(new.descricao);
  elsif tg_table_name = 'usuarios' then
    new.nome := caixa_alta(new.nome);
  end if;
  return new;
end $$;

-- Normaliza o que já estiver gravado (nada hoje, mas o re-run é seguro)
update socios  set whatsapp = telefone_whatsapp(whatsapp) where whatsapp is not null;
update pilotos set whatsapp = telefone_whatsapp(whatsapp) where whatsapp is not null;

-- ---------------------------------------------------------------------
-- Para quem mandar: um login ativo, com telefone e com o aviso ligado.
-- Sócio e piloto na mesma lista; distinct porque um login só tem um
-- telefone, venha do cadastro de sócio ou do de piloto.
-- ---------------------------------------------------------------------
create or replace view v_whatsapp_destino with (security_invoker = true) as
select distinct on (t.usuario_id)
       t.usuario_id,
       u.nome,
       t.whatsapp as telefone
from (
  select usuario_id, whatsapp from socios
   where usuario_id is not null and whatsapp is not null and ativo_ate is null
  union all
  select usuario_id, whatsapp from pilotos
   where usuario_id is not null and whatsapp is not null and ativo
) t
join usuarios u on u.id = t.usuario_id
where u.ativo and u.avisa_whatsapp
order by t.usuario_id;

-- ---------------------------------------------------------------------
-- Histórico de envios: o que saiu, para quem, e o erro quando falha.
-- Grava pela chave secreta (ignora RLS); só o admin lê.
-- ---------------------------------------------------------------------
create table if not exists whatsapp_envios (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid references usuarios(id) on delete set null,
  telefone    text not null,
  modelo      text not null,
  titulo      text,
  corpo       text,
  tag         text,
  ok          boolean not null,
  erro        text,
  wamid       text,
  created_at  timestamptz not null default now()
);

create index if not exists whatsapp_envios_data_idx on whatsapp_envios (created_at desc);

alter table whatsapp_envios enable row level security;
drop policy if exists whatsapp_envios_ler on whatsapp_envios;
create policy whatsapp_envios_ler on whatsapp_envios for select
  using (meu_perfil()::text = 'admin');

notify pgrst, 'reload schema';
