-- =====================================================================
-- schema_v8_catalogo_manutencao.sql — catálogo dos itens de manutenção
-- do RV-10 (Lycoming IO-540 + hélice Hartzell) com a divisão de custo.
-- Rodar no SQL Editor depois do schema_v7b. Idempotente (não mexe nos
-- itens que já existem; o admin ajusta intervalos na tela).
--
--   POR_USO   → rateio pelas horas voadas de cada sócio desde a última
--               execução do item (quem voou mais paga mais).
--   POR_TEMPO → rateio igual (vence pelo calendário, voando ou não).
--   IGUAL     → rateio igual (não é desgaste nem calendário).
-- =====================================================================

insert into plano_manutencao (aeronave_id, descricao, gatilho, intervalo_horas, intervalo_meses, tipo_custo, aviso_horas, aviso_dias, ordem)
select a.id, x.descricao, x.gatilho::gatilho_manutencao, x.horas, x.meses, x.custo::tipo_custo_manutencao, x.aviso_h, x.aviso_d, x.ordem
from aeronaves a
cross join (values
  -- ---- por uso (desgaste com as horas) ----
  ('TROCA DE ÓLEO E FILTRO',              'AMBOS',     50,   4,  'POR_USO',   10,  15, 1),
  ('REVISÃO 50 H',                        'POR_HORAS', 50,   null, 'POR_USO', 10,  30, 2),
  ('REVISÃO 100 H',                       'POR_HORAS', 100,  null, 'POR_USO', 10,  30, 3),
  ('VELAS',                               'POR_HORAS', 100,  null, 'POR_USO', 10,  30, 4),
  ('FILTRO DE AR DO MOTOR',               'POR_HORAS', 100,  null, 'POR_USO', 10,  30, 5),
  ('LUBRIFICAÇÃO DE COMANDOS E ARTICULAÇÕES', 'POR_HORAS', 100, null, 'POR_USO', 10, 30, 6),
  ('PNEUS E CÂMARAS',                     'POR_HORAS', 300,  null, 'POR_USO', 30,  30, 7),
  ('PASTILHAS E DISCOS DE FREIO',         'POR_HORAS', 300,  null, 'POR_USO', 30,  30, 8),
  ('MAGNETOS (INSPEÇÃO 500 H)',           'POR_HORAS', 500,  null, 'POR_USO', 50,  30, 9),
  ('ALTERNADOR E MOTOR DE PARTIDA',       'POR_HORAS', 500,  null, 'POR_USO', 50,  30, 10),
  ('COMPRESSÃO DOS CILINDROS (TESTE)',    'POR_HORAS', 100,  null, 'POR_USO', 10,  30, 11),
  ('REVISÃO GERAL DA HÉLICE',             'AMBOS',     2400, 72, 'POR_USO',  100, 60, 12),
  ('REVISÃO GERAL DO MOTOR (TBO)',        'AMBOS',     2000, 144, 'POR_USO', 100, 90, 13),
  -- ---- por tempo (calendário) ----
  ('INSPEÇÃO ANUAL (IAM)',                'POR_TEMPO', null, 12, 'POR_TEMPO', 10, 45, 20),
  ('BATERIA PRINCIPAL',                   'POR_TEMPO', null, 24, 'POR_TEMPO', 10, 30, 21),
  ('BATERIA DO ELT',                      'POR_TEMPO', null, 60, 'POR_TEMPO', 10, 60, 22),
  ('ELT E TRANSPONDER (AFERIÇÃO)',        'POR_TEMPO', null, 24, 'POR_TEMPO', 10, 30, 23),
  ('ALTÍMETRO E SISTEMA PITOT-ESTÁTICO (AFERIÇÃO)', 'POR_TEMPO', null, 24, 'POR_TEMPO', 10, 30, 24),
  ('MANGUEIRAS DE COMBUSTÍVEL E ÓLEO',    'POR_TEMPO', null, 60, 'POR_TEMPO', 10, 60, 25),
  ('EXTINTOR DE BORDO',                   'POR_TEMPO', null, 12, 'POR_TEMPO', 10, 30, 26),
  ('KIT DE PRIMEIROS SOCORROS',           'POR_TEMPO', null, 24, 'POR_TEMPO', 10, 30, 27),
  ('INSPEÇÃO DE CORROSÃO (CLIMA LITORÂNEO)', 'POR_TEMPO', null, 12, 'POR_TEMPO', 10, 30, 28),
  ('BANCO DE DADOS DA AVIÔNICA',          'POR_TEMPO', null, 12, 'POR_TEMPO', 10, 30, 29),
  ('LAVAGEM E POLIMENTO',                 'POR_TEMPO', null, 6,  'POR_TEMPO', 10, 15, 30)
) as x(descricao, gatilho, horas, meses, custo, aviso_h, aviso_d, ordem)
where a.ativo
on conflict (aeronave_id, descricao) do nothing;

notify pgrst, 'reload schema';
