-- =====================================================================
-- schema_v41_horarios_do_voo.sql — hora da decolagem e hora do pouso no
-- diário de bordo (Arthur, 17/10/2026).
--
-- A revisão conta o tempo **da decolagem ao pouso** — que é o que o
-- horímetro mede. Agora o voo guarda também os horários:
--   · servem de conferência contra a diferença do horímetro;
--   · quando o voo não tem horímetro (os lançados da planilha), são
--     eles que dão as horas do voo — e, por tabela, as horas que entram
--     na revisão e no rateio por uso.
--
-- `voos.horas` continua sendo a coluna calculada de sempre
-- (horímetro final − inicial, senão as horas informadas); quem lança o
-- voo com horário e sem horímetro tem as horas informadas preenchidas
-- pelo app a partir do tempo de voo.
-- Rodar no SQL Editor depois do v40. Idempotente.
-- =====================================================================

alter table voos add column if not exists hora_decolagem time;
alter table voos add column if not exists hora_pouso time;

comment on column voos.hora_decolagem is 'Hora da decolagem (início da contagem da revisão).';
comment on column voos.hora_pouso is 'Hora do pouso; com a decolagem dá o tempo de voo.';

-- Tempo de voo em décimos, quando os dois horários estão preenchidos.
-- Pouso antes da decolagem = voo que virou o dia (soma 24 h).
create or replace function tempo_de_voo(p_decolagem time, p_pouso time) returns numeric
  language sql immutable as
$$
  select case
    when p_decolagem is null or p_pouso is null then null
    else round(
      (extract(epoch from (p_pouso - p_decolagem)) + case when p_pouso < p_decolagem then 86400 else 0 end) / 3600.0,
      1
    )::numeric(8,1)
  end
$$;

notify pgrst, 'reload schema';
