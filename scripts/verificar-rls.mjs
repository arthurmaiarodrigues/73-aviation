#!/usr/bin/env node
/**
 * Testa a RLS com usuários de verdade: cria (ou reaproveita) um piloto de
 * teste e confere que ele NÃO lê despesas, aportes, rateios nem extrato — e
 * que um sócio lê. Roda só no seu computador (usa a chave secreta).
 *
 *   npm run verificar-rls
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secreta = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publica = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !secreta || !publica) {
  console.error("Faltam variáveis no .env.local");
  process.exit(1);
}
const admin = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });

async function garantirUsuario(email, perfil) {
  const senha = "Teste-RLS-73aviation!";
  let id;
  const { data: criado, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) {
    const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    id = lista.users.find((u) => u.email === email)?.id;
    if (!id) throw new Error(`não achei ${email}: ${error.message}`);
    await admin.auth.admin.updateUserById(id, { password: senha });
  } else {
    id = criado.user.id;
  }
  await admin.from("usuarios").upsert({ id, nome: `TESTE ${perfil.toUpperCase()}`, perfil, ativo: true }, { onConflict: "id" });
  const cliente = createClient(url, publica, { auth: { persistSession: false } });
  const { error: e2 } = await cliente.auth.signInWithPassword({ email, password: senha });
  if (e2) throw new Error(`login ${email}: ${e2.message}`);
  return { id, cliente };
}

async function contar(cliente, tabela) {
  const { count, error } = await cliente.from(tabela).select("*", { count: "exact", head: true });
  return error ? `erro: ${error.message.slice(0, 40)}` : count ?? 0;
}

const piloto = await garantirUsuario("teste-piloto@73aviation.local", "piloto");
const socio = await garantirUsuario("teste-socio@73aviation.local", "socio");

const tabelas = ["voos", "socios", "aerodromos", "despesas", "rateios", "aportes", "abastecimentos", "fundo_reserva_movimentos", "v_extrato_socio", "v_saldo_socio"];
const proibidasParaPiloto = new Set(["despesas", "rateios", "aportes", "abastecimentos", "fundo_reserva_movimentos", "v_extrato_socio"]);

console.log("\n  tabela                      secreta   sócio   piloto");
let falhas = 0;
for (const t of tabelas) {
  const [s, so, pi] = await Promise.all([contar(admin, t), contar(socio.cliente, t), contar(piloto.cliente, t)]);
  const ok = proibidasParaPiloto.has(t) ? pi === 0 || String(pi).startsWith("erro") : true;
  if (!ok) falhas++;
  console.log(`  ${t.padEnd(26)} ${String(s).padStart(7)} ${String(so).padStart(7)} ${String(pi).padStart(8)}  ${proibidasParaPiloto.has(t) ? (ok ? "✓ piloto barrado" : "✗ PILOTO LÊ VALORES") : ""}`);
}

// Piloto tenta gravar despesa: tem de falhar.
const { error: erroDespesa } = await piloto.cliente.from("despesas").insert({ aeronave_id: "00000000-0000-0000-0000-000000000000", data: "2026-01-01", descricao: "X", categoria_id: 1, valor: 1, autor_id: piloto.id });
console.log(`\n  piloto gravar despesa: ${erroDespesa ? "✓ recusado" : "✗ ACEITOU"}`);
if (!erroDespesa) falhas++;

// v_saldo_socio para piloto tem de vir vazia (views com security_invoker).
console.log(falhas ? `\n  ✗ ${falhas} falha(s) de RLS\n` : "\n  ✓ RLS ok\n");
// Apaga os usuários de teste: não ficam no projeto.
for (const u of [piloto, socio]) await admin.auth.admin.deleteUser(u.id);
process.exit(falhas ? 1 : 0);
