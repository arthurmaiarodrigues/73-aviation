-- =====================================================================
-- schema_v43_plano_por_celula.sql — o plano de manutenção passa a contar
-- **horas de célula** (a soma dos tempos de voo), como o mecânico.
--
-- Âncora: na revisão de 100 h, em 15/09/2026, o carimbo do diário de
-- bordo registra 1109,3 h totais de célula. Daí em diante a célula é
-- essa base mais as horas dos voos lançados. O diário fecha com o app:
-- 1109,3 + 30,2 h voadas = 1139,5 h, e a próxima intervenção de 50 h
-- está marcada para 1159,3 h de célula.
--
-- O horímetro continua gravado em cada voo e aparece como referência,
-- mas quem manda no vencimento das revisões é a célula.
-- Rodar no SQL Editor depois do v42. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Âncora da célula na aeronave.
-- ---------------------------------------------------------------------
alter table aeronaves add column if not exists horas_celula numeric(8,1);
alter table aeronaves add column if not exists horas_celula_em date;

comment on column aeronaves.horas_celula is 'Horas totais de célula na data de referência (carimbo do diário de bordo).';
comment on column aeronaves.horas_celula_em is 'Data da referência; os voos lançados DEPOIS dela somam em cima.';

update aeronaves
set horas_celula = 1109.3, horas_celula_em = date '2026-09-15'
where matricula = 'PP-ZNM' and horas_celula is null;

-- Horas de célula numa data (ou hoje, quando p_data é nulo).
create or replace function celula_em(p_aeronave uuid, p_data date default null) returns numeric
  language sql stable as
$$
  select round(coalesce(a.horas_celula, 0) + coalesce((
    select sum(v.horas)
    from voos v
    where v.aeronave_id = p_aeronave and v.deleted_at is null
      and (a.horas_celula_em is null or v.data > a.horas_celula_em)
      and (p_data is null or v.data <= p_data)
  ), 0), 1)
  from aeronaves a
  where a.id = p_aeronave
$$;

-- ---------------------------------------------------------------------
-- Última execução de cada item do plano, em horas de célula.
-- ---------------------------------------------------------------------
alter table plano_manutencao add column if not exists ultima_celula numeric(8,1);
alter table plano_execucoes add column if not exists celula numeric(8,1);

comment on column plano_manutencao.ultima_celula is 'Horas de célula na última execução — é daqui que sai a próxima.';

update plano_manutencao p
set ultima_celula = celula_em(p.aeronave_id, p.ultima_data)
where p.ultima_data is not null and p.ultima_celula is null;

update plano_execucoes e
set celula = celula_em((select p.aeronave_id from plano_manutencao p where p.id = e.plano_item_id), e.data)
where e.celula is null;

-- ---------------------------------------------------------------------
-- v_plano_status: vencimento pela célula (o horímetro fica de referência).
-- ---------------------------------------------------------------------
drop view if exists v_plano_status;
create view v_plano_status with (security_invoker = true) as
select p.*,
       celula_em(p.aeronave_id) as celula_atual,
       ultimo_horimetro(p.aeronave_id) as horimetro_atual,
       case when p.gatilho in ('POR_HORAS', 'AMBOS') and p.ultima_celula is not null
            then p.ultima_celula + p.intervalo_horas end as proxima_celula,
       case when p.gatilho in ('POR_TEMPO', 'AMBOS') and p.ultima_data is not null
            then (p.ultima_data + (p.intervalo_meses || ' months')::interval)::date end as proxima_data,
       case when p.gatilho in ('POR_HORAS', 'AMBOS') and p.ultima_celula is not null
            then round(p.ultima_celula + p.intervalo_horas - celula_em(p.aeronave_id), 1) end as horas_restantes,
       case when p.gatilho in ('POR_TEMPO', 'AMBOS') and p.ultima_data is not null
            then (p.ultima_data + (p.intervalo_meses || ' months')::interval)::date - current_date end as dias_restantes,
       case
         when (p.gatilho in ('POR_HORAS', 'AMBOS') and p.ultima_celula is null)
           or (p.gatilho in ('POR_TEMPO', 'AMBOS') and p.ultima_data is null) then 'SEM_REGISTRO'
         when (p.gatilho in ('POR_HORAS', 'AMBOS') and p.ultima_celula + p.intervalo_horas - celula_em(p.aeronave_id) <= 0)
           or (p.gatilho in ('POR_TEMPO', 'AMBOS') and (p.ultima_data + (p.intervalo_meses || ' months')::interval)::date <= current_date) then 'VENCIDO'
         when (p.gatilho in ('POR_HORAS', 'AMBOS') and p.ultima_celula + p.intervalo_horas - celula_em(p.aeronave_id) <= p.aviso_horas)
           or (p.gatilho in ('POR_TEMPO', 'AMBOS') and (p.ultima_data + (p.intervalo_meses || ' months')::interval)::date - current_date <= p.aviso_dias) then 'AVISO'
         else 'OK'
       end as situacao
from plano_manutencao p
where p.ativo;

-- ---------------------------------------------------------------------
-- Concluir a manutenção grava também a célula da execução.
-- (mesma função do v39, com `celula` nas execuções e no plano)
-- ---------------------------------------------------------------------
create or replace function concluir_manutencao(p_manutencao uuid, p_data_fim date, p_horimetro numeric, p_plano_itens uuid[]) returns void
  language plpgsql security definer set search_path = public as
$$
declare m manutencoes%rowtype; it record; v_base uuid[]; v_itens uuid[]; v_celula numeric;
begin
  if not (sou_admin() or meu_perfil() = 'piloto') then raise exception 'Só o administrador ou o piloto conclui manutenção.'; end if;
  select * into m from manutencoes where id = p_manutencao and deleted_at is null;
  if not found then raise exception 'Manutenção não encontrada.'; end if;
  if p_data_fim < m.data_inicio then raise exception 'Data de conclusão antes do início.'; end if;

  update manutencoes set status = 'CONCLUIDA', data_fim = p_data_fim, horimetro = coalesce(p_horimetro, horimetro) where id = p_manutencao;
  v_celula := celula_em(m.aeronave_id, p_data_fim);

  select coalesce(array_agg(distinct p.id), '{}') into v_base
  from plano_manutencao p
  where p.aeronave_id = m.aeronave_id
    and (p.id = any(coalesce(p_plano_itens, array[]::uuid[]))
         or p.id in (select plano_item_id from manutencao_itens where manutencao_id = p_manutencao and plano_item_id is not null and deleted_at is null));

  with recursive dentro as (
    select p.id from plano_manutencao p where p.id = any(v_base)
    union
    select c.id from plano_manutencao c join dentro d on c.incluido_em = d.id
    where c.aeronave_id = m.aeronave_id
  )
  select coalesce(array_agg(id), '{}') into v_itens from dentro;

  -- 1) A base anterior (digitada à mão) entra no histórico.
  insert into plano_execucoes (plano_item_id, manutencao_id, data, horimetro, celula)
  select p.id, null, p.ultima_data, p.ultimo_horimetro, p.ultima_celula
  from plano_manutencao p
  where p.id = any(v_itens) and p.ultima_data is not null
    and not exists (select 1 from plano_execucoes e where e.plano_item_id = p.id and e.data = p.ultima_data);

  -- 2) Reprocessa os itens da nota com a data real.
  for it in select id from manutencao_itens where manutencao_id = p_manutencao and deleted_at is null loop
    update manutencao_itens set valor = valor where id = it.id;
  end loop;

  -- 3) Esta execução vira a nova base.
  insert into plano_execucoes (plano_item_id, manutencao_id, data, horimetro, celula)
  select p.id, p_manutencao, p_data_fim, coalesce(p_horimetro, ultimo_horimetro(m.aeronave_id)), v_celula
  from plano_manutencao p
  where p.id = any(v_itens)
  on conflict (plano_item_id, manutencao_id) do update set data = excluded.data, horimetro = excluded.horimetro, celula = excluded.celula;

  update plano_manutencao p
  set ultima_data = e.data,
      ultimo_horimetro = coalesce(e.horimetro, p.ultimo_horimetro),
      ultima_celula = coalesce(e.celula, p.ultima_celula)
  from plano_execucoes e
  where e.plano_item_id = p.id and e.manutencao_id = p_manutencao;
end $$;

notify pgrst, 'reload schema';
