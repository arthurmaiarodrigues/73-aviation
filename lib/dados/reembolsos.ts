import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Reembolso ao piloto: despesa que o piloto pagou do bolso por conta de um
 * sócio (`despesas.reembolso_piloto_id`). A RLS já limita o piloto às dele.
 */
export type Reembolso = {
  id: string;
  data: string;
  descricao: string;
  categoria: string;
  valor: number;
  /** null = de todos os sócios (rateio igual, caixa devolve ao piloto). */
  socio_id: string | null;
  socio: string;
  piloto_id: string;
  piloto: string;
  comprovante_path: string | null;
  observacao: string | null;
  /** Onde o piloto gastou (GOIÂNIA, PORTO SEGURO…). */
  cidade: string | null;
  reembolsado_em: string | null;
  /** PENDENTE = esperando o admin confirmar a divisão. */
  status: "PENDENTE" | "APROVADA" | "RATEADA";
  criterio: "IGUAL" | "POR_HORAS" | "DIRETO" | "MANUAL";
  /** Quanto cabe a cada sócio (vazio enquanto o admin não confirma). */
  partes: { socio_id: string; valor: number }[];
  /** Sócios que já pagaram a parte deles ao piloto. */
  pagos: string[];
  pix: string | null;
};

const SELECT = `id, data, descricao, valor, socio_direto_id, reembolso_piloto_id, comprovante_path, observacao, cidade, reembolsado_em, status, criterio,
  categorias_despesa ( nome ), socios!despesas_socio_direto_id_fkey ( apelido ), pilotos ( nome, pix ), rateios ( socio_id, valor ),
  reembolso_pagamentos ( socio_id, pago_em )`;

type Bruta = {
  id: string; data: string; descricao: string; valor: string | number; socio_direto_id: string | null; reembolso_piloto_id: string;
  comprovante_path: string | null; observacao: string | null; cidade: string | null; reembolsado_em: string | null;
  status: "PENDENTE" | "APROVADA" | "RATEADA"; criterio: "IGUAL" | "POR_HORAS" | "DIRETO" | "MANUAL";
  categorias_despesa: { nome: string } | null; socios: { apelido: string } | null; pilotos: { nome: string; pix: string | null } | null;
  rateios: { socio_id: string; valor: string | number }[] | null;
  reembolso_pagamentos: { socio_id: string; pago_em: string }[] | null;
};

export async function listarReembolsos(aeronaveId: string, filtro: { socioId?: string; pendentes?: boolean; confirmados?: boolean } = {}, limite = 300): Promise<Reembolso[]> {
  const supabase = await criarClienteServidor();
  let q = supabase
    .from("despesas")
    .select(SELECT)
    .eq("aeronave_id", aeronaveId)
    .is("deleted_at", null)
    .not("reembolso_piloto_id", "is", null)
    .order("reembolsado_em", { ascending: true, nullsFirst: true })
    .order("data", { ascending: false })
    .limit(limite);
  // o sócio vê o que é dele e o que é de todos
  if (filtro.socioId) q = q.or(`socio_direto_id.eq.${filtro.socioId},socio_direto_id.is.null`);
  if (filtro.pendentes) q = q.is("reembolsado_em", null);
  // o sócio só vê depois que o admin confere a divisão
  if (filtro.confirmados) q = q.neq("status", "PENDENTE");
  const { data, error } = await q;
  if (error) throw new Error(`Reembolsos: ${error.message}`);
  return ((data ?? []) as unknown as Bruta[]).map((d) => ({
    id: d.id,
    data: d.data,
    descricao: d.descricao,
    categoria: d.categorias_despesa?.nome ?? "",
    valor: Number(d.valor),
    socio_id: d.socio_direto_id,
    socio: d.socio_direto_id === null ? (d.criterio === "POR_HORAS" ? "Todos (pelas horas)" : "Todos") : (d.socios?.apelido ?? ""),
    piloto_id: d.reembolso_piloto_id,
    piloto: d.pilotos?.nome ?? "",
    comprovante_path: d.comprovante_path,
    observacao: d.observacao,
    cidade: d.cidade,
    reembolsado_em: d.reembolsado_em,
    status: d.status,
    criterio: d.criterio,
    partes: (d.rateios ?? []).map((r) => ({ socio_id: r.socio_id, valor: Number(r.valor) })),
    pagos: (d.reembolso_pagamentos ?? []).map((p) => p.socio_id),
    pix: d.pilotos?.pix ?? null,
  }));
}

/** Quanto cada sócio ainda deve ao piloto, somando as partes não pagas. */
export function devidoPorSocio(reembolsos: Reembolso[]): { socio_id: string; valor: number; itens: number }[] {
  const mapa = new Map<string, { socio_id: string; valor: number; itens: number }>();
  for (const r of reembolsos) {
    if (r.status === "PENDENTE") continue;
    for (const p of r.partes) {
      if (r.pagos.includes(p.socio_id)) continue;
      const atual = mapa.get(p.socio_id) ?? { socio_id: p.socio_id, valor: 0, itens: 0 };
      atual.valor = Math.round((atual.valor + p.valor) * 100) / 100;
      atual.itens += 1;
      mapa.set(p.socio_id, atual);
    }
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}
