-- =====================================================================
-- schema_v29_contas_codigo.sql — o "copia e cola" da conta a pagar.
-- Rodar no SQL Editor depois do v28. Idempotente.
--
-- Guardar o boleto não adianta na hora de pagar: o que se usa no banco é
-- a linha digitável (o número do código de barras) ou o PIX copia e cola.
-- Agora os dois ficam na conta, com botão de copiar na tela.
-- =====================================================================

alter table contas_pagar add column if not exists linha_digitavel text;
alter table contas_pagar add column if not exists pix_copia_cola text;

create or replace view v_contas_pagar with (security_invoker = true) as
select c.id, c.aeronave_id, c.descricao, c.valor, c.vencimento, c.documento, c.observacao, c.boleto_path,
       c.linha_digitavel, c.pix_copia_cola,
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

-- O código não é cadastro: fica como veio do banco, sem caixa alta.
create or replace function normalizar_conta_pagar() returns trigger
  language plpgsql as
$$
begin
  new.descricao := caixa_alta(new.descricao);
  new.documento := caixa_alta(new.documento);
  new.observacao := caixa_alta(new.observacao);
  new.linha_digitavel := nullif(regexp_replace(coalesce(new.linha_digitavel, ''), '\D', '', 'g'), '');
  new.pix_copia_cola := nullif(btrim(coalesce(new.pix_copia_cola, '')), '');
  return new;
end $$;

notify pgrst, 'reload schema';
