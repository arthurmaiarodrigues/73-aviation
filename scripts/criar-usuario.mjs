#!/usr/bin/env node
/**
 * Cria (ou atualiza) um usuário do app: cria no Supabase Auth com e-mail já
 * confirmado e grava a linha correspondente em `usuarios` com o perfil.
 *
 * Uso:
 *   npm run criar-usuario -- <email> <senha> "<NOME COMPLETO>" [perfil]
 *
 * Exemplo (primeiro admin):
 *   npm run criar-usuario -- arthur@email.com SenhaForte123 "ARTHUR" admin
 *
 * Perfis: admin | socio | piloto   (padrão: socio)
 * Usa a chave secreta (sb_secret_…) — roda só no seu computador, nunca no front.
 */

import { createClient } from "@supabase/supabase-js";
import { vincularSocio } from "./vincular-socio.mjs";

const PERFIS = ["admin", "socio", "piloto"];

const [email, senha, nome, perfil = "socio"] = process.argv.slice(2);

function erro(mensagem) {
  console.error(`\n  ✗ ${mensagem}\n`);
  process.exit(1);
}

if (!email || !senha || !nome) {
  erro(
    'Uso: npm run criar-usuario -- <email> <senha> "<NOME COMPLETO>" [admin|socio|piloto]',
  );
}
if (!PERFIS.includes(perfil)) erro(`Perfil inválido: "${perfil}". Use um de: ${PERFIS.join(", ")}.`);
if (senha.length < 8) erro("A senha precisa de pelo menos 8 caracteres.");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secreta = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !secreta) {
  erro(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.\n" +
      "    Confira o .env.local (copie de .env.local.exemplo).",
  );
}

const admin = createClient(url, secreta, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Todo cadastro de texto vai em CAIXA ALTA e sem espaços duplos (CLAUDE.md §9).
const nomeNormalizado = nome.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
const emailNormalizado = email.trim().toLowerCase();

console.log(`\n  Criando ${emailNormalizado} — ${nomeNormalizado} (${perfil})…`);

let usuarioId;

const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
  email: emailNormalizado,
  password: senha,
  email_confirm: true,
  user_metadata: { nome: nomeNormalizado },
});

if (erroCriar) {
  const jaExiste =
    erroCriar.status === 422 || /already been registered|already exists/i.test(erroCriar.message);

  if (!jaExiste) erro(`Falha no Auth: ${erroCriar.message}`);

  // Já existe: encontra o id e redefine a senha, para o script ser repetível.
  console.log("  · E-mail já existe no Auth. Atualizando senha e perfil.");

  const { data: lista, error: erroLista } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (erroLista) erro(`Falha ao listar usuários: ${erroLista.message}`);

  const existente = lista.users.find((u) => u.email?.toLowerCase() === emailNormalizado);
  if (!existente) erro("E-mail consta como existente, mas não foi encontrado na listagem.");

  usuarioId = existente.id;

  const { error: erroUpdate } = await admin.auth.admin.updateUserById(usuarioId, {
    password: senha,
    email_confirm: true,
    user_metadata: { nome: nomeNormalizado },
  });
  if (erroUpdate) erro(`Falha ao atualizar o usuário: ${erroUpdate.message}`);
} else {
  usuarioId = criado.user.id;
}

const { error: erroPerfil } = await admin
  .from("usuarios")
  .upsert({ id: usuarioId, nome: nomeNormalizado, perfil, ativo: true }, { onConflict: "id" });

if (erroPerfil) {
  erro(
    `Usuário criado no Auth (${usuarioId}), mas falhou ao gravar em usuarios: ${erroPerfil.message}`,
  );
}

// Sócio com o mesmo apelido e sem login: vincula na hora.
if (perfil !== 'piloto') {
  const apelido = nomeNormalizado.split(' ')[0];
  const { data: socio } = await admin.from('socios').select('id, apelido, usuario_id').eq('apelido', apelido).maybeSingle();
  if (socio && !socio.usuario_id) {
    const { error: erroVinculo } = await admin.from('socios').update({ usuario_id: usuarioId }).eq('id', socio.id);
    console.log(erroVinculo ?  : );
  } else if (socio?.usuario_id && socio.usuario_id !== usuarioId) {
    console.log();
  }
}

await vincularSocio(admin, usuarioId, nomeNormalizado, perfil);

console.log(`
  ✓ Pronto.

    E-mail : ${emailNormalizado}
    Nome   : ${nomeNormalizado}
    Perfil : ${perfil}
    id     : ${usuarioId}

    Entre em http://localhost:3000/login
`);
