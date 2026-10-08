-- =====================================================================
-- schema_v26_item_avulso_ciclo.sql — item da nota sem item do plano usa
-- o ciclo da última revisão.
-- Rodar no SQL Editor depois do v25. Idempotente.
--
-- O Início promete: "última revisão: voos de 26/06 a 08/09 — é essa divisão
-- que a nota da oficina usa nos itens por uso". Só que um item avulso (uma
-- porca, uma arruela, que não está ligado a nenhum item do plano) caía no
-- último recurso "desde o primeiro voo da sociedade" e dividia por outro
-- período.
--
-- Agora, quando não há execução daquele item nem manutenção anterior, vale
-- a última execução registrada no plano (o marco do ciclo) antes da entrada
-- na oficina; só então o primeiro voo.
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
    -- desde a última troca daquele item; sem ela, desde a revisão anterior;
    -- sem ela, desde o marco do ciclo; e, por último, desde o primeiro voo.
    select coalesce(
      (select max(e.data) from plano_execucoes e where e.plano_item_id = new.plano_item_id
         and (e.manutencao_id is null or e.manutencao_id <> new.manutencao_id) and e.data <= m.data_inicio),
      (select p.ultima_data from plano_manutencao p where p.id = new.plano_item_id and p.ultima_data < m.data_inicio),
      (select max(x.data_fim) from manutencoes x where x.aeronave_id = m.aeronave_id and x.status = 'CONCLUIDA' and x.id <> m.id and x.deleted_at is null and x.data_fim < m.data_inicio),
      (select max(e.data) from plano_execucoes e where (e.manutencao_id is null or e.manutencao_id <> new.manutencao_id) and e.data <= m.data_inicio),
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

notify pgrst, 'reload schema';
