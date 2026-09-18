import { NextResponse } from "next/server";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";

/** GET /api/aerodromos?q=SNT → até 12 aeródromos (ICAO por prefixo, nome e cidade por trecho). */
export async function GET(request: Request) {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("buscar_aerodromos", { p_texto: q, p_limite: 12 });
  if (error) {
    // Antes do schema_v3b: cai na busca simples por ICAO.
    const { data: simples } = await supabase.from("aerodromos").select("icao, nome, cidade").ilike("icao", `${q}%`).limit(12);
    return NextResponse.json(simples ?? []);
  }
  return NextResponse.json(data ?? []);
}
