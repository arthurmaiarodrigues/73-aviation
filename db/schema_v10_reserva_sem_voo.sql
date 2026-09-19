-- =====================================================================
-- schema_v10_reserva_sem_voo.sql — reserva que terminou sem voo lançado.
-- Rodar no SQL Editor depois do schema_v9b. Idempotente.
--
-- Quando o período de uma reserva confirmada termina e não há voo com data
-- dentro dele, o piloto (e o sócio) recebem aviso: ou lançam o voo, ou
-- marcam a reserva como NÃO REALIZADA (vira CANCELADA, e deixa de contar
-- como dias de uso na fila).
-- =====================================================================

alter table reservas add column if not exists aviso_sem_voo_em timestamptz;
alter table reservas add column if not exists nao_realizada boolean not null default false;

-- Reservas terminadas (ontem para trás) sem nenhum voo no período.
create or replace function reservas_sem_voo(p_aeronave uuid)
  returns table (id uuid, socio_id uuid, apelido text, inicio date, fim date, destino text, aviso_sem_voo_em timestamptz)
  language sql stable security invoker as
$$
  select r.id, r.socio_id, s.apelido, r.inicio, r.fim, r.destino, r.aviso_sem_voo_em
  from reservas r join socios s on s.id = r.socio_id
  where r.aeronave_id = p_aeronave and r.status = 'CONFIRMADA' and not r.pendente
    and r.fim < current_date and r.fim >= current_date - 60
    and not exists (select 1 from voos v where v.aeronave_id = p_aeronave and v.deleted_at is null and v.data between r.inicio and r.fim)
  order by r.fim desc
$$;

-- Marca "não realizada": piloto, o sócio dono ou o admin.
create or replace function marcar_nao_realizada(p_reserva uuid) returns void
  language plpgsql security definer set search_path = public as
$$
declare r reservas%rowtype; v_meu uuid;
begin
  select * into r from reservas where id = p_reserva and status = 'CONFIRMADA';
  if not found then raise exception 'Reserva não encontrada ou já encerrada.'; end if;
  select id into v_meu from socios where usuario_id = auth.uid();
  if not (sou_admin() or meu_perfil() = 'piloto' or r.socio_id = v_meu) then
    raise exception 'Só o piloto, o sócio da reserva ou o administrador marca como não realizada.';
  end if;
  update reservas set status = 'CANCELADA', nao_realizada = true, cancelada_em = now(), cancelada_por = auth.uid(),
    motivo = left(coalesce(motivo || ' · ', '') || 'NÃO REALIZADA (SEM VOO)', 200)
  where id = p_reserva;
end $$;

-- Piloto pode registrar o aviso enviado (só essa coluna, via função).
create or replace function registrar_aviso_sem_voo(p_reserva uuid) returns void
  language sql security definer set search_path = public as
$$
  update reservas set aviso_sem_voo_em = now() where id = p_reserva and aviso_sem_voo_em is null
$$;

notify pgrst, 'reload schema';
