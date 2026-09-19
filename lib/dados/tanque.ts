import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

export type TipoMovimentoTanque = "COMPRA" | "RETIRADA" | "AJUSTE";
export const ROTULO_MOVIMENTO: Record<TipoMovimentoTanque, string> = {
  COMPRA: "Compra para o tanque",
  RETIRADA: "Abastecimento do avião",
  AJUSTE: "Medição / ajuste",
};

export type SaldoTanque = {
  capacidade_l: number;
  litros: number;
  preco_litro: number | null;
  valor_estoque: number;
  ultima_compra: string | null;
  ultima_medicao: string | null;
};

export type MovimentoTanque = {
  id: string;
  data: string;
  tipo: TipoMovimentoTanque;
  litros: number;
  valor: number | null;
  preco_litro: number | null;
  socio_id: string | null;
  socio: string | null;
  fornecedor: string | null;
  comprovante_path: string | null;
  voo_id: string | null;
  observacao: string | null;
  saldo_litros: number;
};

export type TanqueSocioMes = { socio_id: string; apelido: string; cor: string; mes: string; litros: number; valor: number };

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function saldoDoTanque(aeronaveId: string): Promise<SaldoTanque> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("v_tanque_saldo").select("*").eq("aeronave_id", aeronaveId).maybeSingle();
  if (error) throw new Error(`Tanque: ${error.message}`);
  return {
    capacidade_l: Number(data?.capacidade_l ?? 2000),
    litros: Number(data?.litros ?? 0),
    preco_litro: n(data?.preco_litro),
    valor_estoque: Number(data?.valor_estoque ?? 0),
    ultima_compra: data?.ultima_compra ?? null,
    ultima_medicao: data?.ultima_medicao ?? null,
  };
}

export async function movimentosDoTanque(aeronaveId: string, limite = 300): Promise<MovimentoTanque[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("v_tanque_movimentos")
    .select("*")
    .eq("aeronave_id", aeronaveId)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Movimentos do tanque: ${error.message}`);
  return (data ?? []).map((m) => ({
    id: m.id,
    data: m.data,
    tipo: m.tipo,
    litros: Number(m.litros),
    valor: n(m.valor),
    preco_litro: n(m.preco_litro),
    socio_id: m.socio_id,
    socio: m.socio,
    fornecedor: m.fornecedor,
    comprovante_path: m.comprovante_path,
    voo_id: m.voo_id,
    observacao: m.observacao,
    saldo_litros: Number(m.saldo_litros),
  }));
}

/** Litros retirados por sócio (a parte da sociedade já dividida), por mês. */
export async function tanquePorSocio(aeronaveId: string): Promise<TanqueSocioMes[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("v_tanque_socio_mes").select("*").eq("aeronave_id", aeronaveId).order("mes", { ascending: false });
  if (error) throw new Error(`Uso do tanque: ${error.message}`);
  return (data ?? []).map((l) => ({ socio_id: l.socio_id, apelido: l.apelido, cor: l.cor, mes: l.mes, litros: Number(l.litros), valor: Number(l.valor) }));
}
