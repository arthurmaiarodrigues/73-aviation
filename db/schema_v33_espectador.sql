-- =====================================================================
-- schema_v33_espectador.sql — perfil ESPECTADOR: vê tudo, não mexe em nada.
-- Rodar no SQL Editor depois do v32. Idempotente.
--
-- Quem entra como espectador abre as mesmas telas do sócio (voos,
-- despesas, extratos, agenda, manutenção, contas) e enxerga os valores,
-- mas o banco recusa qualquer gravação: nenhuma policy de insert/update
-- aceita esse perfil.
--
-- Se o SQL Editor reclamar do valor novo do enum na primeira vez, rode o
-- arquivo outra vez — o tipo já terá o valor.
-- =====================================================================

alter type perfil_usuario add value if not exists 'espectador';

-- ---------------------------------------------------------------------
-- ve_valores() continua sendo "pode mexer no dinheiro" (admin e sócio).
-- ve_dados() é só para LER: inclui o espectador.
-- ---------------------------------------------------------------------
create or replace function ve_dados() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce(meu_perfil()::text in ('admin', 'socio', 'espectador'), false) $$;

-- ---------------------------------------------------------------------
-- Leitura: o espectador passa a enxergar o que o sócio enxerga.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['despesas', 'abastecimentos', 'aportes', 'rateios', 'fundo_reserva_movimentos', 'fechamentos'] loop
    execute format('drop policy if exists %I_ler on %I', t, t);
    execute format('create policy %I_ler on %I for select using (ve_dados())', t, t);
  end loop;
end $$;

drop policy if exists manutencao_itens_ler on manutencao_itens;
create policy manutencao_itens_ler on manutencao_itens for select using (ve_dados());

drop policy if exists extrato_banco_ler on extrato_banco;
create policy extrato_banco_ler on extrato_banco for select using (ve_dados());

drop policy if exists tanque_ler on tanque_movimentos;
create policy tanque_ler on tanque_movimentos for select using (ve_dados());

drop policy if exists contas_pagar_ler on contas_pagar;
create policy contas_pagar_ler on contas_pagar for select using (meu_perfil()::text in ('admin', 'socio', 'espectador'));

drop policy if exists despesa_pagadores_ler on despesa_pagadores;
create policy despesa_pagadores_ler on despesa_pagadores for select using (meu_perfil()::text in ('admin', 'socio', 'espectador'));

drop policy if exists comprovantes_ler on storage.objects;
create policy comprovantes_ler on storage.objects for select using (bucket_id = 'comprovantes' and ve_dados());

-- Saldo por sócio: a view trava a leitura em ve_valores().
create or replace view v_saldo_socio with (security_invoker = true) as
select s.id as socio_id, s.apelido, s.nome, s.cor,
       coalesce(sum(e.credito), 0)::numeric(14,2) as creditos,
       coalesce(sum(e.debito), 0)::numeric(14,2) as debitos,
       (coalesce(sum(e.credito), 0) - coalesce(sum(e.debito), 0))::numeric(14,2) as saldo
from socios s left join v_extrato_socio e on e.socio_id = s.id
where ve_dados()
group by s.id, s.apelido, s.nome, s.cor;

-- ---------------------------------------------------------------------
-- Escrita: o que aceitava "qualquer logado" passa a recusar o espectador.
-- (O resto já exige admin, sócio ou piloto.)
-- ---------------------------------------------------------------------
drop policy if exists voos_lancar on voos;
create policy voos_lancar on voos for insert
  with check (meu_perfil()::text in ('admin', 'socio', 'piloto') and autor_id = auth.uid());

drop policy if exists voos_proprio on voos;
create policy voos_proprio on voos for update
  using (meu_perfil()::text <> 'espectador' and (autor_id = auth.uid() or sou_admin()))
  with check (meu_perfil()::text <> 'espectador' and (autor_id = auth.uid() or sou_admin()));

drop policy if exists horimetro_gravar on storage.objects;
create policy horimetro_gravar on storage.objects for insert
  with check (bucket_id = 'horimetro' and meu_perfil()::text in ('admin', 'socio', 'piloto'));

drop policy if exists anotacoes_fotos_gravar on storage.objects;
create policy anotacoes_fotos_gravar on storage.objects for insert
  with check (bucket_id = 'anotacoes' and meu_perfil()::text in ('admin', 'socio', 'piloto'));

drop policy if exists anotacoes_ler on anotacoes_aeronave;
create policy anotacoes_ler on anotacoes_aeronave for select using (meu_perfil() is not null);

notify pgrst, 'reload schema';
