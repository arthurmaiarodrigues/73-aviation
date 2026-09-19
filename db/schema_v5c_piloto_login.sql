-- =====================================================================
-- schema_v5c_piloto_login.sql — login do piloto contratado.
-- Rodar no SQL Editor depois do schema_v5b. Idempotente.
--
-- `pilotos.usuario_id` liga o cadastro do piloto ao login (como
-- `socios.usuario_id`). O piloto registra voo em nome do sócio que o
-- contratou (ou da sociedade) e continua sem ver valores (RLS já cuida).
-- =====================================================================

alter table pilotos add column if not exists usuario_id uuid unique references usuarios(id);

notify pgrst, 'reload schema';
