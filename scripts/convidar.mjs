#!/usr/bin/env node
/**
 * Convida alguém para o app por e-mail: o Supabase manda o link, a pessoa
 * escolhe a senha em /auth/definir-senha e já entra. Grava a linha em
 * `usuarios` com o perfil e liga ao cadastro: sócio pelo apelido (primeira
 * palavra do nome) ou piloto pelo começo do nome em `pilotos`.
 *
 *   npm run convidar -- <email> "<NOME>" [socio|piloto|admin]
 *
 * Antes: Supabase → Authentication → URL Configuration → Site URL =
 * https://ppznm.vercel.app (senão o link do e-mail aponta para localhost).
 * Usa a chave secreta — roda só no seu computador.
 */
import { createClient } from "@supabase/supabase-js";
import { vincularSocio } from "./vincular-socio.mjs";

const PERFIS = ["admin", "socio", "piloto"];
const [email, nome, perfil = "socio"] = process.argv.slice(2);
const erro = (m) => { console.error(`\n  ✗ ${m}\n`); process.exit(1); };
if (!email || !nome) erro('Uso: npm run convidar -- <email> "<NOME>" [socio|piloto|admin]');
if (!PERFIS.includes(perfil)) erro(`Perfil inválido: ${perfil}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secreta = process.env.SUPABASE_SERVICE_ROLE_KEY;
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ppznm.vercel.app";
if (!url || !secreta) erro("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env.local");

const admin = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });
const nomeNormalizado = nome.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
const emailNormalizado = email.trim().toLowerCase();

console.log(`\n  Convidando ${emailNormalizado} — ${nomeNormalizado} (${perfil})…`);

let usuarioId;
const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const existente = lista?.users.find((u) => u.email?.toLowerCase() === emailNormalizado);
if (existente) {
  usuarioId = existente.id;
  console.log(`  · já existe no Auth (${existente.last_sign_in_at ? "já entrou" : "ainda não entrou"}); não mando outro convite.`);
} else {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(emailNormalizado, {
    redirectTo: `${site}/auth/definir-senha`,
    data: { nome: nomeNormalizado },
  });
  if (error) erro(`Falha ao convidar: ${error.message}`);
  usuarioId = data.user.id;
  console.log("  · convite enviado por e-mail.");
}

const { error: erroPerfil } = await admin.from("usuarios").upsert({ id: usuarioId, nome: nomeNormalizado, perfil, ativo: true }, { onConflict: "id" });
if (erroPerfil) erro(`Falhou ao gravar em usuarios: ${erroPerfil.message}`);

if (perfil === "piloto") {
  const primeiro = nomeNormalizado.split(" ")[0];
  const { data: piloto } = await admin.from("pilotos").select("id, nome, usuario_id").ilike("nome", `${primeiro}%`).order("nome").limit(1).maybeSingle();
  if (!piloto) console.log(`  · nenhum piloto começando com ${primeiro} em Cadastros; cadastre e rode de novo.`);
  else if (piloto.usuario_id && piloto.usuario_id !== usuarioId) console.log(`  · o piloto ${piloto.nome} já tem outro login.`);
  else {
    const { error } = await admin.from("pilotos").update({ usuario_id: usuarioId }).eq("id", piloto.id);
    console.log(error ? `  · não vinculei ao piloto: ${error.message}` : `  · vinculado ao piloto ${piloto.nome}.`);
  }
} else {
  await vincularSocio(admin, usuarioId, nomeNormalizado, perfil);
}

console.log(`\n  ✓ Pronto — ${emailNormalizado} (${perfil}, id ${usuarioId}).\n`);
