import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

export type SituacaoConta = "PAGA" | "VENCIDA" | "VENCE_EM_BREVE" | "ABERTA";

export type ContaPagar = {
  id: string;
  descricao: string;
  valor: number;
  vencimento: string;
  documento: string | null;
  observacao: string | null;
  boleto_path: string | null;
  despesa_id: string | null;
  pago_em: string | null;
  pagador_socio_id: string | null;
  pagador: string | null;
  comprovante_path: string | null;
  fornecedor_id: string | null;
  fornecedor: string | null;
  categoria_id: number | null;
  categoria: string | null;
  nota_descricao: string | null;
  nota_data: string | null;
  nota_valor: number | null;
  situacao: SituacaoConta;
  dias: number;
};

/** Uma nota candidata a ser a conta (conciliação). */
export type NotaCandidata = {
  despesa_id: string;
  data: string;
  descricao: string;
  valor: number;
  fornecedor: string | null;
  diferenca: number;
  distancia: number;
};

export async function listarContas(aeronaveId: string, filtro: { abertas?: boolean } = {}): Promise<ContaPagar[]> {
  const supabase = await criarClienteServidor();
  let q = supabase.from("v_contas_pagar").select("*").eq("aeronave_id", aeronaveId).order("vencimento");
  if (filtro.abertas) q = q.is("pago_em", null);
  const { data, error } = await q;
  if (error) throw new Error(`Contas a pagar: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id,
    descricao: c.descricao,
    valor: Number(c.valor),
    vencimento: c.vencimento,
    documento: c.documento,
    observacao: c.observacao,
    boleto_path: c.boleto_path,
    despesa_id: c.despesa_id,
    pago_em: c.pago_em,
    pagador_socio_id: c.pagador_socio_id,
    pagador: c.pagador,
    comprovante_path: c.comprovante_path,
    fornecedor_id: c.fornecedor_id,
    fornecedor: c.fornecedor,
    categoria_id: c.categoria_id,
    categoria: c.categoria,
    nota_descricao: c.nota_descricao,
    nota_data: c.nota_data,
    nota_valor: c.nota_valor === null ? null : Number(c.nota_valor),
    situacao: c.situacao as SituacaoConta,
    dias: Number(c.dias),
  }));
}

/** Notas lançadas que combinam com a conta: mesmo valor ou mesmo fornecedor, perto do vencimento. */
export async function notasParaConta(contaId: string): Promise<NotaCandidata[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("notas_para_conta", { p_conta: contaId });
  if (error) throw new Error(`Conciliação: ${error.message}`);
  return (data ?? []).map((n: Record<string, unknown>) => ({
    despesa_id: String(n.despesa_id),
    data: String(n.data),
    descricao: String(n.descricao),
    valor: Number(n.valor),
    fornecedor: (n.fornecedor as string | null) ?? null,
    diferenca: Number(n.diferenca),
    distancia: Number(n.distancia),
  }));
}
