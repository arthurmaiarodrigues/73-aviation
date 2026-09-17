import { NextResponse } from "next/server";

import { usuarioDaSessao } from "@/lib/perfil";
import { ChaveAusenteError, lerHorimetro } from "@/lib/horimetro/ler";

export const runtime = "nodejs";
export const maxDuration = 60;

const TAMANHO_MAXIMO = 25 * 1024 * 1024;

/**
 * POST multipart: `foto` (imagem) e opcional `esperado` (último horímetro).
 * Devolve a leitura bruta; quem decide é o piloto na tela de confirmação.
 * Falha aqui nunca barra o voo: o app cai para a digitação.
 */
export async function POST(request: Request) {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ erro: "Envio inválido." }, { status: 400 });
  }

  const foto = form.get("foto");
  if (!(foto instanceof File) || !foto.type.startsWith("image/")) {
    return NextResponse.json({ erro: "Mande uma foto." }, { status: 400 });
  }
  if (foto.size > TAMANHO_MAXIMO) return NextResponse.json({ erro: "Foto maior que 25 MB." }, { status: 413 });

  const esperadoBruto = form.get("esperado");
  const esperado = esperadoBruto ? Number(esperadoBruto) : null;

  try {
    const bytes = Buffer.from(await foto.arrayBuffer());
    const leitura = await lerHorimetro(bytes, { esperadoPerto: Number.isFinite(esperado) ? esperado : null });
    return NextResponse.json(leitura);
  } catch (erro) {
    if (erro instanceof ChaveAusenteError) return NextResponse.json({ erro: erro.message }, { status: 503 });
    const mensagem = erro instanceof Error ? erro.message : "Falha na leitura.";
    return NextResponse.json({ erro: mensagem }, { status: 502 });
  }
}
