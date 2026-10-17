-- =====================================================================
-- schema_v42_horas_pelo_tempo_de_voo.sql — a hora do voo passa a ser o
-- tempo da decolagem ao pouso (Arthur, 17/10/2026).
--
-- O diário de bordo mostrou que o horímetro do avião corre mais que o
-- tempo voado: no dia da revisão de 100 h (15/09/2026) o horímetro
-- marcava 1170,0 e as horas de célula, 1109,3. É pela célula — a soma
-- dos tempos de decolagem a pouso — que o mecânico agenda a próxima
-- intervenção, e é ela que passa a valer aqui, tanto para a revisão
-- quanto para dividir o custo por uso.
--
-- `voos.horas` deixa de ser coluna calculada e passa a ser mantida por
-- gatilho, nesta ordem:
--   1. soma dos tempos de cada perna (voo com escala);
--   2. decolagem → pouso (voo de um trecho);
--   3. horímetro final − inicial (voo sem horário, como antes);
--   4. horas informadas (importação da planilha).
-- Nenhuma view precisa ser derrubada: `alter column ... drop expression`
-- mantém a coluna e os dados.
-- Rodar no SQL Editor depois do v41. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Horário de cada perna (uma entrada por trecho voado).
-- ---------------------------------------------------------------------
alter table voos add column if not exists pernas_decolagem time[] not null default '{}';
alter table voos add column if not exists pernas_pouso time[] not null default '{}';

comment on column voos.pernas_decolagem is 'Hora da decolagem de cada perna (mesma ordem das escalas).';
comment on column voos.pernas_pouso is 'Hora do pouso de cada perna.';

-- Soma dos tempos de voo das pernas, em décimos.
create or replace function tempo_das_pernas(p_decolagem time[], p_pouso time[]) returns numeric
  language sql immutable as
$$
  select case
    when p_decolagem is null or p_pouso is null then null
    when array_length(p_decolagem, 1) is null then null
    when array_length(p_decolagem, 1) <> array_length(p_pouso, 1) then null
    else (
      select round(sum(
        (extract(epoch from (p_pouso[i] - p_decolagem[i])) + case when p_pouso[i] < p_decolagem[i] then 86400 else 0 end) / 3600.0
      ), 1)::numeric(8,1)
      from generate_subscripts(p_decolagem, 1) i
    )
  end
$$;

-- ---------------------------------------------------------------------
-- `horas` sai de coluna gerada e passa a ser mantida pelo gatilho.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_attribute where attrelid = 'voos'::regclass and attname = 'horas' and attgenerated = 's') then
    alter table voos alter column horas drop expression;
  end if;
end $$;

create or replace function voos_horas() returns trigger
  language plpgsql as
$$
begin
  -- o primeiro e o último horário acompanham as pernas
  if array_length(new.pernas_decolagem, 1) is not null then
    new.hora_decolagem := new.pernas_decolagem[1];
  end if;
  if array_length(new.pernas_pouso, 1) is not null then
    new.hora_pouso := new.pernas_pouso[array_length(new.pernas_pouso, 1)];
  end if;

  new.horas := coalesce(
    tempo_das_pernas(new.pernas_decolagem, new.pernas_pouso),
    tempo_de_voo(new.hora_decolagem, new.hora_pouso),
    new.horimetro_final - new.horimetro_inicial,
    new.horas_informadas,
    0
  );
  return new;
end $$;

drop trigger if exists voos_horas on voos;
create trigger voos_horas before insert or update of
  pernas_decolagem, pernas_pouso, hora_decolagem, hora_pouso, horimetro_inicial, horimetro_final, horas_informadas
  on voos for each row execute function voos_horas();

-- Recalcula o que já está lançado (o gatilho de rateio acompanha).
update voos set horas = coalesce(
  tempo_das_pernas(pernas_decolagem, pernas_pouso),
  tempo_de_voo(hora_decolagem, hora_pouso),
  horimetro_final - horimetro_inicial,
  horas_informadas,
  0
) where deleted_at is null;

notify pgrst, 'reload schema';
