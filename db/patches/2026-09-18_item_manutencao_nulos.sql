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
notify pgrst, 'reload schema';
