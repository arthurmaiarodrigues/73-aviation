import "server-only";

import webpush from "web-push";

import { criarClienteAdmin } from "@/lib/supabase/admin";
import { enviarWhatsapp } from "@/lib/whatsapp";

export type Aviso = {
  titulo: string;
  corpo: string;
  url?: string;
  tag?: string;
  /** false deixa o aviso só no push (não gasta mensagem de WhatsApp). */
  whatsapp?: boolean;
};

/** Chaves VAPID válidas? Nunca lança: aviso é acessório, a ação principal não pode cair por causa dele. */
function configurado(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) return false;
  const assunto = process.env.VAPID_SUBJECT?.trim();
  const subject = assunto && /^(mailto:|https?:\/\/)/.test(assunto) ? assunto : "mailto:arthurmaiarodrigues@gmail.com";
  try {
    webpush.setVapidDetails(subject, pub, priv);
    return true;
  } catch (e) {
    console.error("push: chaves VAPID inválidas —", e instanceof Error ? e.message : e);
    return false;
  }
}

type Admin = ReturnType<typeof criarClienteAdmin>;

/** Push nos aparelhos inscritos. Inscrição morta (410/404) é apagada. */
async function enviarPush(admin: Admin, ids: string[], aviso: Aviso): Promise<number> {
  if (!configurado()) return 0;
  const { data: inscricoes } = await admin.from("push_inscricoes").select("id, endpoint, p256dh, auth").in("usuario_id", ids);
  let enviados = 0;
  for (const i of inscricoes ?? []) {
    try {
      await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, JSON.stringify({ ...aviso, url: aviso.url ?? "/inicio" }), { TTL: 60 * 60 * 24 });
      enviados++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from("push_inscricoes").delete().eq("id", i.id);
    }
  }
  return enviados;
}

/**
 * Manda um aviso para os usuários indicados (por id ou por perfil), nos
 * dois caminhos: push no celular e WhatsApp de quem tem o telefone
 * cadastrado. Acessório: falha de envio não derruba a ação que chamou.
 * Devolve quantos push saíram (o WhatsApp fica em whatsapp_envios).
 */
export async function notificar(destino: { usuarios?: string[]; perfis?: ("admin" | "socio" | "piloto")[] }, aviso: Aviso): Promise<number> {
  try {
    const admin = criarClienteAdmin();
    let ids = destino.usuarios ?? [];
    if (destino.perfis?.length) {
      const { data } = await admin.from("usuarios").select("id").in("perfil", destino.perfis).eq("ativo", true);
      ids = [...new Set([...ids, ...(data ?? []).map((u) => u.id as string)])];
    }
    if (ids.length === 0) return 0;
    const [enviados] = await Promise.all([
      enviarPush(admin, ids, aviso),
      aviso.whatsapp === false ? Promise.resolve(0) : enviarWhatsapp(ids, aviso),
    ]);
    return enviados;
  } catch (e) {
    console.error("push:", e);
    return 0;
  }
}
