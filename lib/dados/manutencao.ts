import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

export type { Gatilho, TipoCusto, StatusManutencao, Situacao } from "@/lib/manutencao-constantes";
export { ROTULO_GATILHO, ROTULO_TIPO_CUSTO, ROTULO_STATUS, TIPOS_DOCUMENTO } from "@/lib/manutencao-constantes";
import type { Gatilho, TipoCusto, StatusManutencao, Situacao } from "@/lib/manutencao-constantes";

export type ItemPlano = {
  id: string;
  descricao: string;
  gatilho: Gatilho;
  intervalo_horas: number | null;
  intervalo_meses: number | null;
  ultima_data: string | null;
  ultimo_horimetro: number | null;
  aviso_horas: number;
  aviso_dias: number;
  tipo_custo: TipoCusto;
  ordem: number;
  horimetro_atual: number | null;
  proximo_horimetro: number | null;
  proxima_data: string | null;
  horas_restantes: number | null;
  dias_restantes: number | null;
  situacao: Situacao;
};

export type Manutencao = {
  id: string;
  descricao: string;
  fornecedor_id: string | null;
  fornecedor: string | null;
  data_inicio: string;
  data_fim: string | null;
  horimetro: number | null;
  status: StatusManutencao;
  pagador_socio_id: string | null;
  pagador: string;
  voo_translado_id: string | null;
  voo_teste_id: string | null;
  observacao: string | null;
  total: number;
  itens: ItemManutencao[];
};

export type ItemManutencao = {
  id: string;
  plano_item_id: string | null;
  plano_item: string | null;
  descricao: string;
  valor: number;
  tipo_custo: TipoCusto;
  pago_pelo_fundo: boolean;
  despesa_id: string | null;
};

export type Documento = {
  id: string;
  tipo: string;
  numero: string | null;
  emissao: string | null;
  vencimento: string;
  arquivo_path: string | null;
  observacao: string | null;
  dias_restantes: number;
  situacao: "OK" | "AVISO" | "VENCIDO";
};

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function listarPlano(aeronaveId: string): Promise<ItemPlano[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("v_plano_status").select("*").eq("aeronave_id", aeronaveId).order("ordem").order("descricao");
  if (error) throw new Error(`Plano: ${error.message}`);
  return (data ?? []).map((p) => ({
    id: p.id,
    descricao: p.descricao,
    gatilho: p.gatilho,
    intervalo_horas: n(p.intervalo_horas),
    intervalo_meses: n(p.intervalo_meses),
    ultima_data: p.ultima_data,
    ultimo_horimetro: n(p.ultimo_horimetro),
    aviso_horas: Number(p.aviso_horas),
    aviso_dias: Number(p.aviso_dias),
    tipo_custo: p.tipo_custo,
    ordem: p.ordem,
    horimetro_atual: n(p.horimetro_atual),
    proximo_horimetro: n(p.proximo_horimetro),
    proxima_data: p.proxima_data,
    horas_restantes: n(p.horas_restantes),
    dias_restantes: n(p.dias_restantes),
    situacao: p.situacao,
  }));
}

const SELECT_MANUTENCAO = `id, descricao, fornecedor_id, data_inicio, data_fim, horimetro, status, pagador_socio_id, voo_translado_id, voo_teste_id, observacao,
  fornecedores ( nome ), socios ( apelido ),
  manutencao_itens ( id, plano_item_id, descricao, valor, tipo_custo, pago_pelo_fundo, despesa_id, deleted_at, plano_manutencao ( descricao ) )`;

type Bruta = {
  id: string; descricao: string; fornecedor_id: string | null; data_inicio: string; data_fim: string | null; horimetro: string | null;
  status: StatusManutencao; pagador_socio_id: string | null; voo_translado_id: string | null; voo_teste_id: string | null; observacao: string | null;
  fornecedores: { nome: string } | null; socios: { apelido: string } | null;
  manutencao_itens: { id: string; plano_item_id: string | null; descricao: string; valor: string; tipo_custo: TipoCusto; pago_pelo_fundo: boolean; despesa_id: string | null; deleted_at: string | null; plano_manutencao: { descricao: string } | null }[];
};

function mapear(m: Bruta): Manutencao {
  const itens = (m.manutencao_itens ?? [])
    .filter((i) => !i.deleted_at)
    .map((i) => ({
      id: i.id,
      plano_item_id: i.plano_item_id,
      plano_item: i.plano_manutencao?.descricao ?? null,
      descricao: i.descricao,
      valor: Number(i.valor),
      tipo_custo: i.tipo_custo,
      pago_pelo_fundo: i.pago_pelo_fundo,
      despesa_id: i.despesa_id,
    }));
  return {
    id: m.id,
    descricao: m.descricao,
    fornecedor_id: m.fornecedor_id,
    fornecedor: m.fornecedores?.nome ?? null,
    data_inicio: m.data_inicio,
    data_fim: m.data_fim,
    horimetro: n(m.horimetro),
    status: m.status,
    pagador_socio_id: m.pagador_socio_id,
    pagador: m.socios?.apelido ?? "CAIXA",
    voo_translado_id: m.voo_translado_id,
    voo_teste_id: m.voo_teste_id,
    observacao: m.observacao,
    total: itens.reduce((s, i) => s + i.valor, 0),
    itens,
  };
}

export async function listarManutencoes(aeronaveId: string): Promise<Manutencao[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("manutencoes")
    .select(SELECT_MANUTENCAO)
    .eq("aeronave_id", aeronaveId)
    .is("deleted_at", null)
    .order("data_inicio", { ascending: false });
  if (error) throw new Error(`Manutenções: ${error.message}`);
  return ((data ?? []) as unknown as Bruta[]).map(mapear);
}

export async function buscarManutencao(id: string): Promise<Manutencao | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("manutencoes").select(SELECT_MANUTENCAO).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Manutenção: ${error.message}`);
  return data ? mapear(data as unknown as Bruta) : null;
}

export async function listarDocumentos(aeronaveId: string): Promise<Documento[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("v_documentos_status").select("*").eq("aeronave_id", aeronaveId).order("vencimento");
  if (error) throw new Error(`Documentos: ${error.message}`);
  return (data ?? []).map((d) => ({ ...d, dias_restantes: Number(d.dias_restantes) })) as Documento[];
}

/** Resumo para o Início: o item do plano que vence primeiro e os documentos em alerta. */
export async function resumoManutencao(aeronaveId: string) {
  const [plano, documentos] = await Promise.all([listarPlano(aeronaveId), listarDocumentos(aeronaveId)]);
  const ordem: Record<Situacao, number> = { VENCIDO: 0, AVISO: 1, OK: 2, SEM_REGISTRO: 3 };
  const proximo = [...plano]
    .filter((p) => p.situacao !== "SEM_REGISTRO")
    .sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || (a.horas_restantes ?? 1e9) - (b.horas_restantes ?? 1e9) || (a.dias_restantes ?? 1e9) - (b.dias_restantes ?? 1e9))[0] ?? null;
  return {
    proximo,
    semRegistro: plano.filter((p) => p.situacao === "SEM_REGISTRO").length,
    documentosAlerta: documentos.filter((d) => d.situacao !== "OK"),
  };
}

export async function urlDoDocumento(caminho: string | null): Promise<string | null> {
  if (!caminho) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.storage.from("documentos-aeronave").createSignedUrl(caminho, 900);
  return data?.signedUrl ?? null;
}
