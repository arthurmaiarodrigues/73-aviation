-- =====================================================================
-- schema_v22b_resolver_liberado.sql — pedido em bloco liberado não espera.
-- Rodar no SQL Editor depois do v22. Idempotente.
--
-- O v22 libera os pedidos na hora em que o titular cancela. Falta o outro
-- caminho: pedido que já estava na fila quando o bloco ficou livre. Agora
-- `resolver_pedidos` (que roda toda vez que alguém abre o Início/Agenda)
-- confirma sozinho esses pedidos, sem as 48 h.
-- =====================================================================

create or replace function resolver_pedidos(p_aeronave uuid) returns uuid[]
  language plpgsql security definer set search_path = public as
$$
declare v_ids uuid[];
begin
  with liberadas as (
    update reservas r set pendente = false
    where r.aeronave_id = p_aeronave and r.status = 'CONFIRMADA' and r.pendente and not r.feriado
      and not exists (select 1 from reserva_respostas x where x.reserva_id = r.id and not x.concorda)
      and (
        -- o dono do período desistiu (cancelou o que tinha): confirma na hora
        exists (
          select 1 from semanas s
          where s.aeronave_id = r.aeronave_id and s.socio_id is not null and s.socio_id <> r.socio_id
            and s.inicio <= r.fim and s.fim >= r.inicio and bloco_liberado(s.id)
        )
        or (
          -- caso comum: 48 h sem ninguém dizer que precisa
          r.created_at < now() - interval '48 hours'
          and not exists (
            select 1
            from semanas s
            join reservas outra
              on outra.aeronave_id = r.aeronave_id and outra.status = 'CONFIRMADA'
             and outra.socio_id = s.socio_id and outra.inicio <= s.fim and outra.fim >= s.inicio
            where s.aeronave_id = r.aeronave_id and s.socio_id is not null and s.socio_id <> r.socio_id
              and s.inicio <= r.fim and s.fim >= r.inicio
          )
        )
      )
      -- nunca confirma por cima de um período que ainda é de alguém com reserva
      and not exists (
        select 1 from semanas s
        where s.aeronave_id = r.aeronave_id and s.socio_id is not null and s.socio_id <> r.socio_id
          and s.inicio <= r.fim and s.fim >= r.inicio and not bloco_liberado(s.id)
          and exists (
            select 1 from reservas o
            where o.aeronave_id = s.aeronave_id and o.socio_id = s.socio_id and o.status = 'CONFIRMADA'
              and o.inicio <= s.fim and o.fim >= s.inicio
          )
      )
    returning r.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from liberadas;
  return v_ids;
end $$;

notify pgrst, 'reload schema';
