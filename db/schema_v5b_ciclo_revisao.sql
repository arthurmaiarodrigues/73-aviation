-- =====================================================================
-- schema_v5b_ciclo_revisao.sql — ciclo das revisões definido pelo Arthur:
-- a revisão de 100 h feita em Goiânia (08 a 15/09/2026) cobre os voos de
-- 26/06 a 08/09/2026. Rodar no SQL Editor depois do schema_v5. Idempotente.
--
-- 1) O período POR_USO de um item da nota fecha na ENTRADA da oficina
--    (data_inicio), não na saída: voo de teste feito durante a revisão não
--    entra no rateio dela.
-- 2) Marco inicial do ciclo (26/06/2026) nas execuções de REVISÃO 50 H e
--    REVISÃO 100 H — é a "execução anterior" que o rateio usa.
-- 3) A revisão de 100 h entra em `manutencoes` como CONCLUIDA (sem itens;
--    o admin lança a nota da oficina nela), com as execuções em 15/09.
-- =====================================================================

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
    -- fecha na entrada da oficina: o que voou depois disso é do próximo ciclo
    v_fim := m.data_inicio;
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

-- 2) Marco inicial do ciclo da sociedade
insert into plano_execucoes (plano_item_id, manutencao_id, data, horimetro)
select p.id, null, date '2026-06-26', null
from plano_manutencao p
where p.descricao in ('REVISÃO 50 H', 'REVISÃO 100 H')
  and not exists (select 1 from plano_execucoes e where e.plano_item_id = p.id and e.data = date '2026-06-26');

-- 3) A revisão de 100 h de setembro/2026
do $$
declare v_aeronave uuid; v_id uuid; v_translado uuid; v_teste uuid;
begin
  select id into v_aeronave from aeronaves where matricula = 'PP-ZNM';
  select id into v_id from manutencoes where aeronave_id = v_aeronave and descricao = 'REVISÃO DE 100 H' and data_inicio = date '2026-09-08' and deleted_at is null;
  if v_id is null then
    select id into v_translado from voos where aeronave_id = v_aeronave and data = date '2026-09-08' and natureza = 'TRANSLADO_MANUTENCAO' and deleted_at is null limit 1;
    select id into v_teste from voos where aeronave_id = v_aeronave and data = date '2026-09-12' and natureza = 'VOO_TESTE' and deleted_at is null limit 1;
    insert into manutencoes (aeronave_id, descricao, data_inicio, data_fim, status, voo_translado_id, voo_teste_id, observacao)
    values (v_aeronave, 'REVISÃO DE 100 H', date '2026-09-08', date '2026-09-15', 'CONCLUIDA', v_translado, v_teste,
            'GOIÂNIA (SBNV). INSPEÇÃO DE 100 H APROVADA EM 15/09/2026 — ULISSES DA SILVA O. NETO, ANAC 225906. HORAS DE CÉLULA 1.109,3. CICLO: VOOS DE 26/06 A 08/09/2026.')
    returning id into v_id;
  end if;

  insert into plano_execucoes (plano_item_id, manutencao_id, data, horimetro)
  select p.id, v_id, date '2026-09-15', null
  from plano_manutencao p
  where p.aeronave_id = v_aeronave and p.descricao in ('REVISÃO 50 H', 'REVISÃO 100 H')
  on conflict (plano_item_id, manutencao_id) do nothing;

  update plano_manutencao set ultima_data = date '2026-09-15'
  where aeronave_id = v_aeronave and descricao in ('REVISÃO 50 H', 'REVISÃO 100 H')
    and (ultima_data is null or ultima_data < date '2026-09-15');
end $$;

notify pgrst, 'reload schema';
