-- =====================================================================
-- schema_v44_celula_antes_da_ancora.sql — horas de célula também para
-- trás da âncora.
--
-- `celula_em` (v43) só somava os voos **depois** da referência (1109,3 h
-- em 15/09/2026), então qualquer data anterior devolvia a própria base:
-- o marco de 26/06 ficou gravado como 1109,3 h, quando na verdade era
-- 1109,3 menos as horas voadas de 27/06 a 15/09.
-- Agora a função desconta o que foi voado entre a data pedida e a
-- âncora, e as execuções e os itens do plano são recalculados.
-- Rodar no SQL Editor depois do v43. Idempotente.
-- =====================================================================

create or replace function celula_em(p_aeronave uuid, p_data date default null) returns numeric
  language sql stable as
$$
  select round(
    coalesce(a.horas_celula, 0)
    -- voos depois da referência somam
    + coalesce((
        select sum(v.horas) from voos v
        where v.aeronave_id = p_aeronave and v.deleted_at is null
          and a.horas_celula_em is not null and v.data > a.horas_celula_em
          and (p_data is null or v.data <= p_data)
      ), 0)
    -- voos entre a data pedida e a referência descontam (data no passado)
    - coalesce((
        select sum(v.horas) from voos v
        where v.aeronave_id = p_aeronave and v.deleted_at is null
          and p_data is not null and a.horas_celula_em is not null
          and v.data > p_data and v.data <= a.horas_celula_em
      ), 0)
    -- sem referência: soma tudo até a data
    + case when a.horas_celula_em is null then coalesce((
        select sum(v.horas) from voos v
        where v.aeronave_id = p_aeronave and v.deleted_at is null
          and (p_data is null or v.data <= p_data)
      ), 0) else 0 end
  , 1)
  from aeronaves a
  where a.id = p_aeronave
$$;

-- Recalcula o que o v43 gravou com a conta antiga.
update plano_execucoes e
set celula = celula_em((select p.aeronave_id from plano_manutencao p where p.id = e.plano_item_id), e.data);

update plano_manutencao p
set ultima_celula = celula_em(p.aeronave_id, p.ultima_data)
where p.ultima_data is not null;

notify pgrst, 'reload schema';
