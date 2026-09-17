-- v_saldo_socio: piloto externo não enxerga nem os zeros. Já está no schema.sql;
-- este arquivo é só para quem rodou o schema antes desta correção.
create or replace view v_saldo_socio with (security_invoker = true) as
select s.id as socio_id, s.apelido, s.nome, s.cor,
       coalesce(sum(e.credito), 0)::numeric(14,2) as creditos,
       coalesce(sum(e.debito), 0)::numeric(14,2) as debitos,
       (coalesce(sum(e.credito), 0) - coalesce(sum(e.debito), 0))::numeric(14,2) as saldo
from socios s left join v_extrato_socio e on e.socio_id = s.id
where ve_valores()
group by s.id, s.apelido, s.nome, s.cor;
notify pgrst, 'reload schema';
