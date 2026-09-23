-- =====================================================================
-- schema_v17_despesa_cidade.sql — cidade da despesa.
-- Rodar no SQL Editor depois do v16. Idempotente.
--
-- O piloto informa onde gastou (GOIÂNIA, PORTO SEGURO…): ajuda a conferir
-- a diária junto com o voo daquele dia.
-- =====================================================================
alter table despesas add column if not exists cidade text;

-- CAIXA ALTA também na cidade
create or replace function normalizar_texto() returns trigger
  language plpgsql as
$$
begin
  if tg_table_name = 'socios' then
    new.nome := caixa_alta(new.nome); new.apelido := caixa_alta(new.apelido);
  elsif tg_table_name = 'pilotos' then
    new.nome := caixa_alta(new.nome);
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

notify pgrst, 'reload schema';
