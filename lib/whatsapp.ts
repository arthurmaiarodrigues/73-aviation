import "server-only";

import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Aviso pelo WhatsApp, pela API oficial (Cloud API da Meta).
 *
 * A Meta não deixa mandar texto livre para quem não escreveu primeiro:
 * só MODELO aprovado, com lacunas. Então existe um modelo único para
 * todos os avisos do app, com o título numa lacuna e o texto na outra.
 * É o que precisa estar cadastrado no painel da Meta (pt_BR, categoria
 * UTILIDADE), com o nome de WHATSAPP_MODELO (padrão "aviso_sociedade"):
 *
 *   Aviso do PP-ZNM — {{1}}.
 *
 *   {{2}}
 *
 *   Este aviso é automático, do app da sociedade.
 *
 *   [ botão URL "Abrir no app" → https://ppznm.vercel.app/{{1}} ]
 *
 * Sem WHATSAPP_TOKEN e WHATSAPP_PHONE_ID nada é enviado e nada falha —
 * o aviso é acessório, como o push: a ação que o disparou não pode cair
 * por causa dele.
 */

const VERSAO = process.env.WHATSAPP_API_VERSAO?.trim() || "v23.0";
const MODELO = process.env.WHATSAPP_MODELO?.trim() || "aviso_sociedade";
const IDIOMA = process.env.WHATSAPP_IDIOMA?.trim() || "pt_BR";
/** Modelo sem o botão "Abrir no app": WHATSAPP_BOTAO=0. */
const COM_BOTAO = process.env.WHATSAPP_BOTAO?.trim() !== "0";

export function whatsappConfigurado(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_ID?.trim());
}

/**
 * Lacuna de modelo não aceita quebra de linha nem tabulação, e tem
 * limite de tamanho. Deixa tudo numa linha e corta o excesso.
 */
function lacuna(texto: string, limite = 600): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!limpo) return "—";
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo;
}

type Destino = { usuario_id: string; nome: string | null; telefone: string };

/** Quem tem telefone cadastrado, login ativo e o aviso ligado. */
async function destinos(usuarios: string[]): Promise<Destino[]> {
  const admin = criarClienteAdmin();
  const { data, error } = await admin.from("v_whatsapp_destino").select("usuario_id, nome, telefone").in("usuario_id", usuarios);
  if (error) {
    console.error("whatsapp: destinos —", error.message);
    return [];
  }
  return (data ?? []) as Destino[];
}

/**
 * Manda o aviso para os logins indicados. Devolve quantos saíram.
 * Cada envio é uma chamada à Meta (modelo é sempre um a um), então vão
 * todos em paralelo; falha de um não derruba os outros.
 */
export async function enviarWhatsapp(usuarios: string[], aviso: { titulo: string; corpo: string; url?: string; tag?: string }): Promise<number> {
  try {
    if (!whatsappConfigurado() || usuarios.length === 0) return 0;
    const lista = await destinos(usuarios);
    if (lista.length === 0) return 0;

    const token = process.env.WHATSAPP_TOKEN!.trim();
    const telefoneId = process.env.WHATSAPP_PHONE_ID!.trim();
    const titulo = lacuna(aviso.titulo, 120);
    const corpo = lacuna(aviso.corpo);
    const caminho = (aviso.url ?? "/inicio").replace(/^\/+/, "").split(/[\s?#]/)[0] || "inicio";

    const componentes: unknown[] = [
      { type: "body", parameters: [{ type: "text", text: titulo }, { type: "text", text: corpo }] },
    ];
    if (COM_BOTAO) componentes.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: caminho }] });

    const admin = criarClienteAdmin();
    const envios = await Promise.all(
      lista.map(async (d) => {
        const registro = { usuario_id: d.usuario_id, telefone: d.telefone, modelo: MODELO, titulo, corpo: corpo.slice(0, 300), tag: aviso.tag ?? null };
        try {
          const r = await fetch(`https://graph.facebook.com/${VERSAO}/${telefoneId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: d.telefone,
              type: "template",
              template: { name: MODELO, language: { code: IDIOMA }, components: componentes },
            }),
            signal: AbortSignal.timeout(8000),
          });
          const corpoResposta = (await r.json().catch(() => null)) as
            | { messages?: { id?: string }[]; error?: { message?: string; error_user_msg?: string } }
            | null;
          const erro = !r.ok
            ? corpoResposta?.error?.error_user_msg || corpoResposta?.error?.message || `HTTP ${r.status}`
            : null;
          if (erro) console.error(`whatsapp: ${d.nome ?? d.usuario_id} —`, erro);
          await admin.from("whatsapp_envios").insert({ ...registro, ok: !erro, erro, wamid: corpoResposta?.messages?.[0]?.id ?? null });
          return erro ? 0 : 1;
        } catch (e) {
          const erro = e instanceof Error ? e.message : String(e);
          console.error(`whatsapp: ${d.nome ?? d.usuario_id} —`, erro);
          await admin.from("whatsapp_envios").insert({ ...registro, ok: false, erro });
          return 0;
        }
      }),
    );
    return envios.reduce<number>((a, b) => a + b, 0);
  } catch (e) {
    console.error("whatsapp:", e);
    return 0;
  }
}
