import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";
import type { CriterioRateio, StatusDespesa } from "@/lib/tipos";

export type DespesaLinha = {
  id: string;
  data: string;
  descricao: string;
  categoria: string;
  categoria_id: number;
  fornecedor: string | null;
  fornecedor_id: string | null;
  valor: number;
  pagador_socio_id: string | null;
  pagador: string;
  criterio: CriterioRateio;
  socio_direto_id: string | null;
  socio_direto: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  status: StatusDespesa;
  comprovante_path: string | null;
  voo_id: string | null;
  observacao: string | null;
  autor_id: string | null;
  /** Compra para o tanque do hangar: rateio por litros retirados desde a compra anterior. */
  tanque: "COMPRA" | "RETIRADA" | null;
  rateios: { socio_id: string; apelido: string; percentual: number; valor: number; horas_base: number | null; litros_base: number | null }[];
};

export type FiltroDespesas = {
  de?: string;
  ate?: string;
  categoria?: string;
  socio?: string;
  criterio?: string;
  status?: string;
};

const SELECT = `id, data, descricao, categoria_id, fornecedor_id, valor, pagador_socio_id, criterio, socio_direto_id,
  periodo_inicio, periodo_fim, status, comprovante_path, voo_id, observacao, autor_id, tanque,
  categorias_despesa ( nome ), fornecedores ( nome ),
  pagador:socios!despesas_pagador_socio_id_fkey ( apelido ),
  direto:socios!despesas_socio_direto_id_fkey ( apelido ),
  rateios ( socio_id, percentual, valor, horas_base, litros_base, socios ( apelido ) )`;

type Bruta = {
  id: string; data: string; descricao: string; categoria_id: number; fornecedor_id: string | null; valor: string;
  pagador_socio_id: string | null; criterio: CriterioRateio; socio_direto_id: string | null;
  periodo_inicio: string | null; periodo_fim: string | null; status: StatusDespesa; comprovante_path: string | null;
  voo_id: string | null; observacao: string | null; autor_id: string | null;
  categorias_despesa: { nome: string } | null; fornecedores: { nome: string } | null;
  pagador: { apelido: string } | null; direto: { apelido: string } | null;
  tanque?: "COMPRA" | "RETIRADA" | null;
  rateios: { socio_id: string; percentual: string; valor: string; horas_base: string | null; litros_base?: string | null; socios: { apelido: string } | null }[];
};

function mapear(d: Bruta): DespesaLinha {
  return {
    id: d.id,
    data: d.data,
    descricao: d.descricao,
    categoria: d.categorias_despesa?.nome ?? "",
    categoria_id: d.categoria_id,
    fornecedor: d.fornecedores?.nome ?? null,
    fornecedor_id: d.fornecedor_id,
    valor: Number(d.valor),
    pagador_socio_id: d.pagador_socio_id,
    pagador: d.pagador?.apelido ?? "CAIXA",
    criterio: d.criterio,
    tanque: d.tanque ?? null,
    socio_direto_id: d.socio_direto_id,
    socio_direto: d.direto?.apelido ?? null,
    periodo_inicio: d.periodo_inicio,
    periodo_fim: d.periodo_fim,
    status: d.status,
    comprovante_path: d.comprovante_path,
    voo_id: d.voo_id,
    observacao: d.observacao,
    autor_id: d.autor_id,
    rateios: (d.rateios ?? [])
      .map((r) => ({
        socio_id: r.socio_id,
        apelido: r.socios?.apelido ?? "",
        percentual: Number(r.percentual),
        valor: Number(r.valor),
        horas_base: r.horas_base === null ? null : Number(r.horas_base),
        litros_base: r.litros_base === null || r.litros_base === undefined ? null : Number(r.litros_base),
      }))
      .sort((a, b) => a.apelido.localeCompare(b.apelido)),
  };
}

export async function listarDespesas(aeronaveId: string, filtro: FiltroDespesas = {}, limite = 500): Promise<DespesaLinha[]> {
  const supabase = await criarClienteServidor();
  let q = supabase
    .from("despesas")
    .select(SELECT)
    .eq("aeronave_id", aeronaveId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);
  if (filtro.de) q = q.gte("data", filtro.de);
  if (filtro.ate) q = q.lte("data", filtro.ate);
  if (filtro.categoria) q = q.eq("categoria_id", Number(filtro.categoria));
  if (filtro.criterio) q = q.eq("criterio", filtro.criterio);
  if (filtro.status) q = q.eq("status", filtro.status);
  if (filtro.socio === "CAIXA") q = q.is("pagador_socio_id", null);
  else if (filtro.socio) q = q.or(`pagador_socio_id.eq.${filtro.socio},socio_direto_id.eq.${filtro.socio}`);

  const { data, error } = await q;
  if (error) throw new Error(`Despesas: ${error.message}`);
  return ((data ?? []) as unknown as Bruta[]).map(mapear);
}

export async function buscarDespesa(id: string): Promise<DespesaLinha | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("despesas").select(SELECT).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Despesa: ${error.message}`);
  return data ? mapear(data as unknown as Bruta) : null;
}

export type AporteLinha = {
  id: string;
  socio_id: string;
  socio: string;
  data: string;
  valor: number;
  descricao: string | null;
  comprovante_path: string | null;
  autor_id: string | null;
};

export async function listarAportes(): Promise<AporteLinha[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("aportes")
    .select("id, socio_id, data, valor, descricao, comprovante_path, autor_id, socios ( apelido )")
    .is("deleted_at", null)
    .order("data", { ascending: false });
  if (error) throw new Error(`Aportes: ${error.message}`);
  return (data ?? []).map((a) => ({
    id: a.id,
    socio_id: a.socio_id,
    socio: (a.socios as unknown as { apelido: string } | null)?.apelido ?? "",
    data: a.data,
    valor: Number(a.valor),
    descricao: a.descricao,
    comprovante_path: a.comprovante_path,
    autor_id: a.autor_id,
  }));
}

export type AbastecimentoLinha = {
  id: string;
  data: string;
  aerodromo: string | null;
  litros: number;
  valor: number;
  pagador: string;
  pagador_socio_id: string | null;
  comprovante_path: string | null;
  origem: "POSTO" | "TANQUE";
};

export async function listarAbastecimentos(aeronaveId: string, limite = 200): Promise<AbastecimentoLinha[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("abastecimentos")
    .select("id, data, aerodromo, litros, valor, pagador_socio_id, comprovante_path, origem, socios ( apelido )")
    .eq("aeronave_id", aeronaveId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Abastecimentos: ${error.message}`);
  return (data ?? []).map((a) => ({
    id: a.id,
    data: a.data,
    aerodromo: a.aerodromo,
    litros: Number(a.litros),
    valor: Number(a.valor),
    pagador: (a.socios as unknown as { apelido: string } | null)?.apelido ?? "CAIXA",
    pagador_socio_id: a.pagador_socio_id,
    comprovante_path: a.comprovante_path,
    origem: (a.origem ?? "POSTO") as "POSTO" | "TANQUE",
  }));
}

export type LinhaExtrato = {
  socio_id: string;
  data: string;
  tipo: string;
  descricao: string;
  credito: number;
  debito: number;
  origem_id: string | null;
  origem: string;
};

export async function extratoDoSocio(socioId: string): Promise<LinhaExtrato[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("v_extrato_socio")
    .select("socio_id, data, tipo, descricao, credito, debito, origem_id, origem")
    .eq("socio_id", socioId)
    .order("data", { ascending: false });
  if (error) throw new Error(`Extrato: ${error.message}`);
  return (data ?? []).map((l) => ({ ...l, credito: Number(l.credito), debito: Number(l.debito) }));
}

export type SaldoSocio = { socio_id: string; apelido: string; nome: string; cor: string; creditos: number; debitos: number; saldo: number };

export async function saldosDosSocios(): Promise<SaldoSocio[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("v_saldo_socio").select("*").order("apelido");
  if (error) throw new Error(`Saldos: ${error.message}`);
  return (data ?? []).map((s) => ({ ...s, creditos: Number(s.creditos), debitos: Number(s.debitos), saldo: Number(s.saldo) }));
}

export type CombustivelSocioMes = {
  socio_id: string;
  mes: string;
  litros_abastecidos: number;
  litros_consumidos: number;
  saldo_litros: number;
  tem_estimativa: boolean;
  preco_litro: number | null;
  valor: number;
};

export async function combustivelPorSocio(mes?: string): Promise<CombustivelSocioMes[]> {
  const supabase = await criarClienteServidor();
  let q = supabase.from("v_combustivel_socio_mes").select("*").order("mes", { ascending: false });
  if (mes) q = q.eq("mes", mes);
  const { data, error } = await q;
  if (error) throw new Error(`Combustível: ${error.message}`);
  return (data ?? []).map((c) => ({
    socio_id: c.socio_id,
    mes: c.mes,
    litros_abastecidos: Number(c.litros_abastecidos),
    litros_consumidos: Number(c.litros_consumidos),
    saldo_litros: Number(c.saldo_litros),
    tem_estimativa: c.tem_estimativa,
    preco_litro: c.preco_litro === null ? null : Number(c.preco_litro),
    valor: Number(c.valor),
  }));
}

export async function saldoDoCaixa(): Promise<{ entradas: number; saidas: number; saldo: number }> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("v_caixa").select("entrada, saida");
  if (error) throw new Error(`Caixa: ${error.message}`);
  const entradas = (data ?? []).reduce((s, l) => s + Number(l.entrada), 0);
  const saidas = (data ?? []).reduce((s, l) => s + Number(l.saida), 0);
  return { entradas, saidas, saldo: entradas - saidas };
}

export async function saldoDoFundo(aeronaveId: string): Promise<number> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("fundo_reserva_movimentos").select("tipo, valor").eq("aeronave_id", aeronaveId);
  if (error) throw new Error(`Fundo: ${error.message}`);
  return (data ?? []).reduce((s, m) => s + (m.tipo === "ENTRADA" ? Number(m.valor) : -Number(m.valor)), 0);
}

/** URL assinada para mostrar o comprovante (15 min). */
export async function urlDoComprovante(caminho: string | null): Promise<string | null> {
  if (!caminho) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.storage.from("comprovantes").createSignedUrl(caminho, 900);
  return data?.signedUrl ?? null;
}
