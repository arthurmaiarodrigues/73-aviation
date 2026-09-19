import { NextResponse } from "next/server";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Guarda (ou remove) a inscrição push deste aparelho para o usuário logado. */
export async function POST(request: Request) {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  const corpo = (await request.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string }; aparelho?: string; remover?: boolean } | null;
  if (!corpo?.endpoint) return NextResponse.json({ erro: "Inscrição inválida." }, { status: 400 });

  const supabase = await criarClienteServidor();
  if (corpo.remover) {
    await supabase.from("push_inscricoes").delete().eq("endpoint", corpo.endpoint);
    return NextResponse.json({ ok: true });
  }
  if (!corpo.keys?.p256dh || !corpo.keys?.auth) return NextResponse.json({ erro: "Inscrição inválida." }, { status: 400 });
  const { error } = await supabase
    .from("push_inscricoes")
    .upsert({ usuario_id: user.id, endpoint: corpo.endpoint, p256dh: corpo.keys.p256dh, auth: corpo.keys.auth, aparelho: corpo.aparelho?.slice(0, 120) ?? null }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
