-- =====================================================================
-- schema_v25_fundo_zerado.sql — fundo de reserva zerado até aqui.
-- Rodar no SQL Editor depois do v24. Idempotente.
--
-- Os sócios vão se reunir para decidir o valor por hora. Até lá o fundo
-- fica em R$ 0,00/h: as provisões já feitas (R$ 150/h de maio a setembro
-- de 2026) saem dos extratos e o saldo do fundo volta a zero.
--
-- Quando decidirem, é só lançar o valor em /fundo com o mês a partir do
-- qual vale — os meses abertos são reprovisionados na hora.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Com o valor em zero não se cria provisão (linha de R$ 0,00 no extrato
-- de cada sócio só atrapalha).
-- ---------------------------------------------------------------------
create or replace function provisionar_fundo_reserva(p_aeronave uuid, p_mes date) returns void
  language plpgsql security definer set search_path = public as
$$
declare v_mes date := date_trunc('month', p_mes)::date; v_valor numeric;
begin
  if mes_fechado(p_aeronave, v_mes) then return; end if;
  v_valor := valor_fundo_em(p_aeronave, v_mes);

  delete from fundo_reserva_movimentos
  where aeronave_id = p_aeronave and mes = v_mes and tipo = 'ENTRADA';

  if coalesce(v_valor, 0) <= 0 then return; end if;

  insert into fundo_reserva_movimentos (aeronave_id, socio_id, mes, tipo, horas, valor_por_hora, valor, descricao)
  select p_aeronave, h.socio_id, v_mes, 'ENTRADA', h.horas, v_valor, round(h.horas * v_valor, 2),
         'FUNDO DE RESERVA ' || to_char(v_mes, 'MM/YYYY')
  from horas_por_socio(p_aeronave, v_mes, (v_mes + interval '1 month - 1 day')::date) h
  where h.horas > 0;
end $$;

-- ---------------------------------------------------------------------
-- Zera: nenhum valor por hora vigente e nenhuma provisão em mês aberto.
-- Mês fechado não é tocado (não há nenhum hoje).
-- ---------------------------------------------------------------------
delete from fundo_reserva_valores;

update aeronaves set fundo_reserva_por_hora = 0 where fundo_reserva_por_hora <> 0;

delete from fundo_reserva_movimentos m
where m.tipo = 'ENTRADA' and not mes_fechado(m.aeronave_id, m.mes);

notify pgrst, 'reload schema';
