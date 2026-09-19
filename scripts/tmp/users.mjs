import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: lista } = await db.auth.admin.listUsers({ page: 1, perPage: 100 });
for (const u of lista.users) console.log(u.email, "| criado", u.created_at?.slice(0, 10), "| confirmado", u.email_confirmed_at?.slice(0, 10) ?? "-", "| último login", u.last_sign_in_at?.slice(0, 10) ?? "-", "| convite", u.invited_at?.slice(0, 10) ?? "-");
const { data: us } = await db.from("usuarios").select("id,nome,perfil,ativo");
console.log(us);
const { data: so } = await db.from("socios").select("apelido,usuario_id");
console.log(so);
