import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

export type MovimentoFundo = {
  id: string;
  mes: string;
  tipo: "ENTRADA" | "SAIDA";
  socio: string | null;
  cor: string | null;
  horas: number | null;
  valor_por_hora: number | null;
  valor: number;
  descricao: string | null;
  despesa_id: string | null;
};

export type ValorFundo = { id: string; valor_por_hora: number; vigente_desde: string };

export async function movimentosDoFundo(aeronaveId: string, limite = 300): Promise<MovimentoFundo[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("fundo_reserva_movimentos")
    .select("id, mes, tipo, horas, valor_por_hora, valor, descricao, despesa_id, socios ( apelido, cor )")
    .eq("aeronave_id", aeronaveId)
    .order("mes", { ascending: false })
    .order("tipo")
    .limit(limite);
  if (error) throw new Error(`Fundo: ${error.message}`);
  return (data ?? []).map((m) => {
    const s = m.socios as unknown as { apelido: string; cor: string } | null;
    return {
      id: m.id,
      mes: m.mes,
      tipo: m.tipo,
      socio: s?.apelido ?? null,
      cor: s?.cor ?? null,
      horas: m.horas === null ? null : Number(m.horas),
      valor_por_hora: m.valor_por_hora === null ? null : Number(m.valor_por_hora),
      valor: Number(m.valor),
      descricao: m.descricao,
      despesa_id: m.despesa_id,
    };
  });
}

export async function historicoDoValor(aeronaveId: string): Promise<ValorFundo[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("fundo_reserva_valores").select("id, valor_por_hora, vigente_desde").eq("aeronave_id", aeronaveId).order("vigente_desde", { ascending: false });
  if (error) throw new Error(`Valores do fundo: ${error.message}`);
  return (data ?? []).map((v) => ({ id: v.id, valor_por_hora: Number(v.valor_por_hora), vigente_desde: v.vigente_desde }));
}
