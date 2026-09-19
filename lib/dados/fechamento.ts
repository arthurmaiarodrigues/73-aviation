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

/** Meses "AAAA-MM-01" de `de` até `ate` (inclusive). */
export function mesesEntre(de: string, ate: string): string[] {
  const lista: string[] = [];
  const d = new Date(`${de.slice(0, 7)}-01T00:00:00Z`);
  const fim = `${ate.slice(0, 7)}-01`;
  while (d.toISOString().slice(0, 10) <= fim && lista.length < 36) {
    lista.push(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return lista;
}

/**
 * Resumo de vários meses somados por sócio (o primeiro fechamento da
 * sociedade pega mais de um mês; depois é mensal). Mês fechado usa o resumo
 * gravado; aberto, o vivo. Acumulado = o do último mês.
 */
export async function resumoDoPeriodo(aeronaveId: string, meses: string[]): Promise<{ resumo: ResumoSocio[]; fechamentos: (Fechamento | null)[]; pendencias: Pendencia[] }> {
  const [fechamentos, vivos, pendenciasPorMes] = await Promise.all([
    Promise.all(meses.map((m) => buscarFechamento(aeronaveId, m))),
    Promise.all(meses.map((m) => resumoDoMes(aeronaveId, m))),
    Promise.all(meses.map((m) => pendenciasDoMes(aeronaveId, m))),
  ]);
  const porMes = meses.map((_, i) => (fechamentos[i]?.status === "FECHADO" && fechamentos[i]?.resumo ? fechamentos[i]!.resumo! : vivos[i]));
  const soma = new Map<string, ResumoSocio>();
  porMes.forEach((lista, i) => {
    for (const s of lista) {
      const acc = soma.get(s.socio_id) ?? { ...s, horas: 0, qtd_voos: 0, creditos: 0, debitos: 0, saldo_mes: 0, litros_abastecidos: 0, litros_consumidos: 0, saldo_litros: 0, combustivel_valor: 0, fundo: 0, rateado: 0 };
      acc.horas += s.horas;
      acc.qtd_voos += s.qtd_voos;
      acc.creditos += s.creditos;
      acc.debitos += s.debitos;
      acc.saldo_mes += s.saldo_mes;
      acc.litros_abastecidos += s.litros_abastecidos;
      acc.litros_consumidos += s.litros_consumidos;
      acc.saldo_litros += s.saldo_litros;
      acc.combustivel_valor += s.combustivel_valor;
      acc.fundo += s.fundo;
      acc.rateado += s.rateado;
      if (i === porMes.length - 1) acc.saldo_acumulado = s.saldo_acumulado;
      soma.set(s.socio_id, acc);
    }
  });
  const arred = (n: number) => Math.round(n * 100) / 100;
  const resumo = [...soma.values()].map((s) => ({ ...s, horas: Math.round(s.horas * 10) / 10, creditos: arred(s.creditos), debitos: arred(s.debitos), saldo_mes: arred(s.saldo_mes), combustivel_valor: arred(s.combustivel_valor), fundo: arred(s.fundo), rateado: arred(s.rateado) })).sort((a, b) => a.apelido.localeCompare(b.apelido));
  // pendências: soma por tipo (só dos meses ainda abertos)
  const pend = new Map<string, Pendencia>();
  pendenciasPorMes.forEach((lista, i) => {
    if (fechamentos[i]?.status === "FECHADO") return;
    for (const p of lista) {
      const acc = pend.get(p.tipo) ?? { ...p, quantidade: 0 };
      acc.quantidade += p.quantidade;
      pend.set(p.tipo, acc);
    }
  });
  return { resumo, fechamentos, pendencias: [...pend.values()] };
}

export async function linhasDoPeriodo(aeronaveId: string, meses: string[]): Promise<LinhaMes[]> {
  const listas = await Promise.all(meses.map((m) => linhasDoMes(aeronaveId, m)));
  return listas.flat();
}
