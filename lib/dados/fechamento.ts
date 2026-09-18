import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

export type ResumoSocio = {
  socio_id: string;
  apelido: string;
  cor: string;
  horas: number;
  qtd_voos: number;
  creditos: number;
  debitos: number;
  saldo_mes: number;
  saldo_acumulado: number;
  litros_abastecidos: number;
  litros_consumidos: number;
  saldo_litros: number;
  combustivel_valor: number;
  fundo: number;
  rateado: number;
};

export type Pendencia = { tipo: string; quantidade: number; bloqueia: boolean };

export type Fechamento = {
  id: string;
  mes: string;
  status: "ABERTO" | "FECHADO";
  fechado_em: string | null;
  fechado_por_nome: string | null;
  reaberto_em: string | null;
  horimetro_final: number | null;
  resumo: ResumoSocio[] | null;
  observacao: string | null;
};

export type LinhaMes = {
  data: string;
  tipo: "VOO" | "DESPESA" | "APORTE";
  descricao: string;
  trecho: string | null;
  horas: number | null;
  valor: number | null;
  pagador: string | null;
  criterio: string | null;
  por_socio: Record<string, number> | null;
};

/** Uma transferência sugerida no acerto. */
export type Transferencia = { de: string; para: string; valor: number };

const n = (v: unknown) => Number(v ?? 0);

function mapearResumo(r: Record<string, unknown>): ResumoSocio {
  return {
    socio_id: String(r.socio_id),
    apelido: String(r.apelido),
    cor: String(r.cor ?? "#0E2846"),
    horas: n(r.horas),
    qtd_voos: n(r.qtd_voos),
    creditos: n(r.creditos),
    debitos: n(r.debitos),
    saldo_mes: n(r.saldo_mes),
    saldo_acumulado: n(r.saldo_acumulado),
    litros_abastecidos: n(r.litros_abastecidos),
    litros_consumidos: n(r.litros_consumidos),
    saldo_litros: n(r.saldo_litros),
    combustivel_valor: n(r.combustivel_valor),
    fundo: n(r.fundo),
    rateado: n(r.rateado),
  };
}

export async function resumoDoMes(aeronaveId: string, mes: string): Promise<ResumoSocio[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("resumo_mes", { p_aeronave: aeronaveId, p_mes: mes });
  if (error) throw new Error(`Resumo do mês: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapearResumo);
}

export async function pendenciasDoMes(aeronaveId: string, mes: string): Promise<Pendencia[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("pendencias_mes", { p_aeronave: aeronaveId, p_mes: mes });
  if (error) throw new Error(`Pendências: ${error.message}`);
  return ((data ?? []) as Pendencia[]).filter((p) => p.quantidade > 0);
}

export async function buscarFechamento(aeronaveId: string, mes: string): Promise<Fechamento | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("fechamentos")
    .select("id, mes, status, fechado_em, reaberto_em, horimetro_final, resumo, observacao, usuarios!fechamentos_fechado_por_fkey ( nome )")
    .eq("aeronave_id", aeronaveId)
    .eq("mes", mes)
    .maybeSingle();
  if (error) throw new Error(`Fechamento: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    mes: data.mes,
    status: data.status,
    fechado_em: data.fechado_em,
    fechado_por_nome: (data.usuarios as unknown as { nome: string } | null)?.nome ?? null,
    reaberto_em: data.reaberto_em,
    horimetro_final: data.horimetro_final === null ? null : Number(data.horimetro_final),
    resumo: Array.isArray(data.resumo) ? (data.resumo as Record<string, unknown>[]).map(mapearResumo) : null,
    observacao: data.observacao,
  };
}

export async function listarFechamentos(aeronaveId: string): Promise<{ mes: string; status: "ABERTO" | "FECHADO"; fechado_em: string | null }[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("fechamentos").select("mes, status, fechado_em").eq("aeronave_id", aeronaveId).order("mes", { ascending: false });
  if (error) throw new Error(`Fechamentos: ${error.message}`);
  return data ?? [];
}

export async function linhasDoMes(aeronaveId: string, mes: string): Promise<LinhaMes[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("linhas_mes", { p_aeronave: aeronaveId, p_mes: mes });
  if (error) throw new Error(`Linhas do mês: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((l) => ({
    data: String(l.data),
    tipo: l.tipo as LinhaMes["tipo"],
    descricao: String(l.descricao),
    trecho: (l.trecho as string | null) ?? null,
    horas: l.horas === null ? null : Number(l.horas),
    valor: l.valor === null ? null : Number(l.valor),
    pagador: (l.pagador as string | null) ?? null,
    criterio: (l.criterio as string | null) ?? null,
    por_socio: (l.por_socio as Record<string, number> | null) ?? null,
  }));
}

/** Meses com movimento (voo, despesa ou aporte), do mais recente ao mais antigo. */
export async function mesesComMovimento(aeronaveId: string): Promise<string[]> {
  const supabase = await criarClienteServidor();
  const [v, d, a] = await Promise.all([
    supabase.from("voos").select("data").eq("aeronave_id", aeronaveId).is("deleted_at", null),
    supabase.from("despesas").select("data").eq("aeronave_id", aeronaveId).is("deleted_at", null),
    supabase.from("aportes").select("data").is("deleted_at", null),
  ]);
  const meses = new Set<string>();
  for (const l of [...(v.data ?? []), ...(d.data ?? []), ...(a.data ?? [])]) meses.add(`${String(l.data).slice(0, 7)}-01`);
  return [...meses].sort().reverse();
}

/**
 * Acerto sugerido a partir do saldo acumulado de cada sócio: quem está
 * negativo paga, quem está positivo recebe, com o menor número de
 * transferências (casamento guloso maior devedor × maior credor). O que
 * sobrar vai para o caixa (ou sai dele).
 */
export function acertoSugerido(resumo: ResumoSocio[]): { transferencias: Transferencia[]; caixa: number } {
  const devedores = resumo.filter((s) => s.saldo_acumulado < -0.005).map((s) => ({ apelido: s.apelido, valor: -s.saldo_acumulado })).sort((a, b) => b.valor - a.valor);
  const credores = resumo.filter((s) => s.saldo_acumulado > 0.005).map((s) => ({ apelido: s.apelido, valor: s.saldo_acumulado })).sort((a, b) => b.valor - a.valor);
  const transferencias: Transferencia[] = [];
  let i = 0;
  let j = 0;
  while (i < devedores.length && j < credores.length) {
    const v = Math.min(devedores[i].valor, credores[j].valor);
    transferencias.push({ de: devedores[i].apelido, para: credores[j].apelido, valor: Math.round(v * 100) / 100 });
    devedores[i].valor -= v;
    credores[j].valor -= v;
    if (devedores[i].valor < 0.005) i++;
    if (credores[j].valor < 0.005) j++;
  }
  for (; i < devedores.length; i++) if (devedores[i].valor > 0.005) transferencias.push({ de: devedores[i].apelido, para: "CAIXA", valor: Math.round(devedores[i].valor * 100) / 100 });
  for (; j < credores.length; j++) if (credores[j].valor > 0.005) transferencias.push({ de: "CAIXA", para: credores[j].apelido, valor: Math.round(credores[j].valor * 100) / 100 });
  const caixa = transferencias.reduce((s, t) => s + (t.para === "CAIXA" ? t.valor : 0) - (t.de === "CAIXA" ? t.valor : 0), 0);
  return { transferencias, caixa: Math.round(caixa * 100) / 100 };
}
