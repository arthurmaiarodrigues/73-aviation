import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

export type Gravidade = "OBSERVACAO" | "ATENCAO" | "URGENTE";
export const ROTULO_GRAVIDADE: Record<Gravidade, string> = { OBSERVACAO: "Observação", ATENCAO: "Atenção", URGENTE: "Urgente" };

export type Anotacao = {
  id: string;
  data: string;
  descricao: string;
  gravidade: Gravidade;
  foto_path: string | null;
  horimetro: number | null;
  resolvida_em: string | null;
  resolucao: string | null;
  autor: string | null;
  resolvida_por: string | null;
};

/** Anotações da aeronave: abertas primeiro (mais graves no topo), depois as resolvidas. */
export async function listarAnotacoes(aeronaveId: string, limite = 200): Promise<Anotacao[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("anotacoes_aeronave")
    .select("id, data, descricao, gravidade, foto_path, horimetro, resolvida_em, resolucao, autor:usuarios!anotacoes_aeronave_autor_id_fkey ( nome ), quem:usuarios!anotacoes_aeronave_resolvida_por_fkey ( nome )")
    .eq("aeronave_id", aeronaveId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Anotações: ${error.message}`);
  const peso: Record<Gravidade, number> = { URGENTE: 0, ATENCAO: 1, OBSERVACAO: 2 };
  return (data ?? [])
    .map((a) => ({
      id: a.id,
      data: a.data,
      descricao: a.descricao,
      gravidade: a.gravidade as Gravidade,
      foto_path: a.foto_path,
      horimetro: a.horimetro === null ? null : Number(a.horimetro),
      resolvida_em: a.resolvida_em,
      resolucao: a.resolucao,
      autor: (a.autor as unknown as { nome: string } | null)?.nome ?? null,
      resolvida_por: (a.quem as unknown as { nome: string } | null)?.nome ?? null,
    }))
    .sort((x, y) => Number(Boolean(x.resolvida_em)) - Number(Boolean(y.resolvida_em)) || peso[x.gravidade] - peso[y.gravidade] || y.data.localeCompare(x.data));
}

export async function urlDaAnotacao(caminho: string | null): Promise<string | null> {
  if (!caminho) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.storage.from("anotacoes").createSignedUrl(caminho, 900);
  return data?.signedUrl ?? null;
}
