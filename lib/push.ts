import "server-only";

import webpush from "web-push";

import { criarClienteAdmin } from "@/lib/supabase/admin";

export type Aviso = { titulo: string; corpo: string; url?: string; tag?: string };

function configurado(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:contato@ppznm.app", pub, priv);
  return true;
}

/**
 * Manda um aviso para os aparelhos inscritos dos usuários indicados (por id
 * ou por perfil). Acessório: falha de envio não derruba a ação que chamou.
 * Inscrição morta (410/404) é apagada.
 */
export async function notificar(destino: { usuarios?: string[]; perfis?: ("admin" | "socio" | "piloto")[] }, aviso: Aviso): Promise<number> {
  if (!configurado()) return 0;
  try {
    const admin = criarClienteAdmin();
    let ids = destino.usuarios ?? [];
    if (destino.perfis?.length) {
      const { data } = await admin.from("usuarios").select("id").in("perfil", destino.perfis).eq("ativo", true);
      ids = [...new Set([...ids, ...(data ?? []).map((u) => u.id as string)])];
    }
    if (ids.length === 0) return 0;
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
  } catch (e) {
    console.error("push:", e);
    return 0;
  }
}
