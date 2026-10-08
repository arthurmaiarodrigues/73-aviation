-- =====================================================================
-- schema_v28_contas_pagar.sql — contas a pagar (boletos e vencimentos).
-- Rodar no SQL Editor depois do v27. Idempotente.
--
-- É só controle de vencimento: a conta a pagar NÃO gera custo, não entra
-- em rateio, extrato, caixa nem custo por sócio. Quando a nota daquele
-- gasto for lançada em Despesas, a conta é ligada a ela (`despesa_id`) —
-- é a conciliação. Quem paga marca a data e anexa o comprovante.
-- =====================================================================

create table if not exists contas_pagar (
  id                uuid primary key default gen_random_uuid(),
  aeronave_id       uuid not null references aeronaves(id),
  descricao         text not null,
  fornecedor_id     uuid references fornecedores(id),
  categoria_id      int references categorias_despesa(id),
  valor             numeric(14,2) not null check (valor > 0),
  vencimento        date not null,
  documento         text,
  observacao        text,
  boleto_path       text,
  -- a nota lançada que corresponde a esta conta (a conciliação)
  despesa_id        uuid unique references despesas(id),
  -- pagamento
  pago_em           date,
  pago_por          uuid references usuarios(id),
  pagador_socio_id  uuid references socios(id),
  comprovante_path  text,
  autor_id          uuid references usuarios(id),
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  deleted_by        uuid references usuarios(id)
);

create index if not exists contas_pagar_abertas_idx on contas_pagar (aeronave_id, vencimento) where pago_em is null and deleted_at is null;

create or replace function normalizar_conta_pagar() returns trigger
  language plpgsql as
$$
begin
  new.descricao := caixa_alta(new.descricao);
  new.documento := caixa_alta(new.documento);
  new.observacao := caixa_alta(new.observacao);
  return new;
end $$;
drop trigger if exists contas_pagar_caixa_alta on contas_pagar;
create trigger contas_pagar_caixa_alta before insert or update on contas_pagar for each row execute function normalizar_conta_pagar();

-- ---------------------------------------------------------------------
-- A lista pronta: situação, dias para vencer e a nota ligada.
-- ---------------------------------------------------------------------
create or replace view v_contas_pagar with (security_invoker = true) as
select c.id, c.aeronave_id, c.descricao, c.valor, c.vencimento, c.documento, c.observacao, c.boleto_path,
       c.despesa_id, c.pago_em, c.pagador_socio_id, c.comprovante_path, c.created_at,
       c.fornecedor_id, f.nome as fornecedor,
       c.categoria_id, cat.nome as categoria,
       s.apelido as pagador,
       d.descricao as nota_descricao, d.data as nota_data, d.valor as nota_valor, d.comprovante_path as nota_comprovante,
       case
         when c.pago_em is not null then 'PAGA'
         when c.vencimento < current_date then 'VENCIDA'
         when c.vencimento <= current_date + 7 then 'VENCE_EM_BREVE'
         else 'ABERTA'
       end as situacao,
       (c.vencimento - current_date) as dias
from contas_pagar c
left join fornecedores f on f.id = c.fornecedor_id
left join categorias_despesa cat on cat.id = c.categoria_id
left join socios s on s.id = c.pagador_socio_id
left join despesas d on d.id = c.despesa_id and d.deleted_at is null
where c.deleted_at is null;

-- ---------------------------------------------------------------------
-- Conciliação: notas que podem ser esta conta — mesmo valor (ou perto)
-- e data em volta do vencimento, ainda não ligadas a nenhuma conta.
-- ---------------------------------------------------------------------
create or replace function notas_para_conta(p_conta uuid, p_dias int default 45)
  returns table (despesa_id uuid, data date, descricao text, valor numeric, fornecedor text, diferenca numeric, distancia int)
  language sql stable security invoker as
$$
  with c as (select * from contas_pagar where id = p_conta and deleted_at is null)
  select d.id, d.data, d.descricao, d.valor, f.nome,
         round(abs(d.valor - c.valor), 2),
         abs(d.data - c.vencimento)
  from c
  join despesas d on d.aeronave_id = c.aeronave_id and d.deleted_at is null
  left join fornecedores f on f.id = d.fornecedor_id
  where not exists (select 1 from contas_pagar x where x.despesa_id = d.id and x.deleted_at is null and x.id <> c.id)
    and abs(d.data - c.vencimento) <= p_dias
    and (abs(d.valor - c.valor) <= 0.05 or (c.fornecedor_id is not null and d.fornecedor_id = c.fornecedor_id))
  order by round(abs(d.valor - c.valor), 2), abs(d.data - c.vencimento)
  limit 20
$$;

-- ---------------------------------------------------------------------
-- RLS: quem vê valores (admin e sócio) lê e mexe; piloto não enxerga.
-- ---------------------------------------------------------------------
alter table contas_pagar enable row level security;

drop policy if exists contas_pagar_ler on contas_pagar;
create policy contas_pagar_ler on contas_pagar for select using (meu_perfil() in ('admin', 'socio'));

drop policy if exists contas_pagar_lancar on contas_pagar;
create policy contas_pagar_lancar on contas_pagar for insert with check (meu_perfil() in ('admin', 'socio') and autor_id = auth.uid());

drop policy if exists contas_pagar_alterar on contas_pagar;
create policy contas_pagar_alterar on contas_pagar for update using (meu_perfil() in ('admin', 'socio')) with check (meu_perfil() in ('admin', 'socio'));

notify pgrst, 'reload schema';
