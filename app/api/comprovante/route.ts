import { NextResponse } from "next/server";

import { usuarioDaSessao } from "@/lib/perfil";
import { veValores } from "@/lib/tipos";
import { lerComprovante } from "@/lib/comprovante/ler";

export const runtime = "nodejs";
export const maxDuration = 60;

const TAMANHO_MAXIMO = 25 * 1024 * 1024;
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/** POST multipart `arquivo` → dados lidos do comprovante (só quem vê valores). */
export async function POST(request: Request) {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !veValores(usuario.perfil)) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ erro: "Envio inválido." }, { status: 400 });
  }
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || !TIPOS.has(arquivo.type)) return NextResponse.json({ erro: "Mande foto ou PDF." }, { status: 400 });
  if (arquivo.size > TAMANHO_MAXIMO) return NextResponse.json({ erro: "Arquivo maior que 25 MB." }, { status: 413 });

  try {
    const leitura = await lerComprovante(Buffer.from(await arquivo.arrayBuffer()), arquivo.type);
    return NextResponse.json(leitura);
  } catch (erro) {
    return NextResponse.json({ erro: erro instanceof Error ? erro.message : "Falha na leitura." }, { status: 502 });
  }
}
