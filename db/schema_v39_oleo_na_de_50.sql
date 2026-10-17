-- =====================================================================
-- schema_v39_oleo_na_de_50.sql — o óleo é trocado junto na revisão de
-- 50 h (Arthur, 17/10/2026). Fica assim o encadeamento:
--
--   REVISÃO 100 H  →  REVISÃO 50 H  →  TROCA DE ÓLEO E FILTRO
--
-- Concluir a de 50 h zera o óleo; concluir a de 100 h zera a de 50 h
-- **e** o óleo. Para isso o arrasto do `incluido_em`, que no v38 ia só
-- um nível, passa a descer a corrente inteira.
-- Rodar no SQL Editor depois do v38. Idempotente.
-- =====================================================================

update plano_manutencao p set incluido_em = (
  select c.id from plano_manutencao c where c.aeronave_id = p.aeronave_id and c.descricao = 'REVISÃO 50 H'
)
where p.descricao = 'TROCA DE ÓLEO E FILTRO';

-- ---------------------------------------------------------------------
-- Concluir a manutenção: o arrasto desce a corrente toda (recursivo).
-- `union` (e não `union all`) segura qualquer corrente circular.
-- ---------------------------------------------------------------------
create or replace function concluir_manutencao(p_manutencao uuid, p_data_fim date, p_horimetro numeric, p_plano_itens uuid[]) returns void
  language plpgsql security definer set search_path = public as
$$
declare m manutencoes%rowtype; it record; v_base uuid[]; v_itens uuid[];
begin
  if not (sou_admin() or meu_perfil() = 'piloto') then raise exception 'Só o administrador ou o piloto conclui manutenção.'; end if;
  select * into m from manutencoes where id = p_manutencao and deleted_at is null;
  if not found then raise exception 'Manutenção não encontrada.'; end if;
  if p_data_fim < m.data_inicio then raise exception 'Data de conclusão antes do início.'; end if;

  update manutencoes set status = 'CONCLUIDA', data_fim = p_data_fim, horimetro = coalesce(p_horimetro, horimetro) where id = p_manutencao;

  -- Itens executados: os escolhidos na tela e os ligados nas linhas da nota.
  select coalesce(array_agg(distinct p.id), '{}') into v_base
  from plano_manutencao p
  where p.aeronave_id = m.aeronave_id
    and (p.id = any(coalesce(p_plano_itens, array[]::uuid[]))
         or p.id in (select plano_item_id from manutencao_itens where manutencao_id = p_manutencao and plano_item_id is not null and deleted_at is null));

  -- ...mais tudo o que vem dentro deles, descendo a corrente:
  -- a de 100 h puxa a de 50 h, que puxa a troca de óleo.
  with recursive dentro as (
    select p.id from plano_manutencao p where p.id = any(v_base)
    union
    select c.id from plano_manutencao c join dentro d on c.incluido_em = d.id
    where c.aeronave_id = m.aeronave_id
  )
  select coalesce(array_agg(id), '{}') into v_itens from dentro;

  -- 1) A base anterior de cada item executado (última execução digitada à mão)
  --    entra no histórico, para o "desde a última troca" continuar valendo.
  insert into plano_execucoes (plano_item_id, manutencao_id, data, horimetro)
  select p.id, null, p.ultima_data, p.ultimo_horimetro
  from plano_manutencao p
  where p.id = any(v_itens) and p.ultima_data is not null
    and not exists (select 1 from plano_execucoes e where e.plano_item_id = p.id and e.data = p.ultima_data);

  -- 2) Reprocessa os itens da nota com a data real (período POR_USO fecha na entrada).
  for it in select id from manutencao_itens where manutencao_id = p_manutencao and deleted_at is null loop
    update manutencao_itens set valor = valor where id = it.id;
  end loop;

  -- 3) Esta execução vira a nova base dos itens do plano.
  insert into plano_execucoes (plano_item_id, manutencao_id, data, horimetro)
  select p.id, p_manutencao, p_data_fim, coalesce(p_horimetro, ultimo_horimetro(m.aeronave_id))
  from plano_manutencao p
  where p.id = any(v_itens)
  on conflict (plano_item_id, manutencao_id) do update set data = excluded.data, horimetro = excluded.horimetro;

  update plano_manutencao p set ultima_data = e.data, ultimo_horimetro = coalesce(e.horimetro, p.ultimo_horimetro)
  from plano_execucoes e
  where e.plano_item_id = p.id and e.manutencao_id = p_manutencao;
end $$;

notify pgrst, 'reload schema';
