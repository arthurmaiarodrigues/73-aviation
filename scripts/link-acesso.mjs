#!/usr/bin/env node
/**
 * Link pessoal de acesso para mandar por WhatsApp: a pessoa abre, escolhe a
 * senha e entra. O token vai no fragmento (#th=…), que a prévia do WhatsApp
 * não consome — o link do Supabase (auth/v1/verify?token=…) era gasto pela
 * prévia antes de a pessoa tocar. Validade: "Email OTP Expiration" do Auth.
 *
 *   npm run link-acesso -- <email> [<email> …]
 */
import { createClient } from "@supabase/supabase-js";

const emails = process.argv.slice(2).map((e) => e.trim().toLowerCase()).filter(Boolean);
if (emails.length === 0) { console.error("Uso: npm run link-acesso -- <email> [<email> …]"); process.exit(1); }
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ppznm.vercel.app";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
for (const email of emails) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  console.log(error ? `${email}: ERRO ${error.message}` : `${email}: ${site}/auth/definir-senha#th=${data.properties.hashed_token}`);
}
