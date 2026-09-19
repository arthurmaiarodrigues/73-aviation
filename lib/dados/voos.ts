import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";
import type { NaturezaVoo } from "@/lib/tipos";

export type VooLinha = {
  id: string;
  data: string;
  /** Ida e volta num voo só: o dia da volta (nulo = mesmo dia). */
  data_volta: string | null;
  socio_id: string | null;
  socio: string | null;
  piloto: string | null;
  origem: string | null;
  destino: string | null;
  escalas: string[];
  horas_pernas: number[];
  combustivel_pernas: number[];
  /** Leitura do horímetro no pouso de cada perna (perna a perna). */
  horimetro_pernas: number[];
  pernas_concluidas: number;
  horimetro_inicial: number | null;
  horimetro_final: number | null;
  horas: number;
  combustivel_inicial_l: number | null;
  combustivel_final_l: number | null;
  pousos: number;
  natureza: NaturezaVoo;
  status: "RASCUNHO" | "CONFIRMADO";
  pendente_horimetro: boolean;
  observacao: string | null;
  foto_horimetro_inicial: string | null;
  foto_horimetro_final: string | null;
  autor_id: string | null;
};

export type FiltroVoos = {
  socio?: string;
  de?: string;
  ate?: string;
  natureza?: string;
  aerodromo?: string;
  pendentes?: boolean;
};

const SELECT = `id, data, data_volta, socio_id, origem, destino, escalas, horas_pernas, combustivel_pernas, horimetro_pernas, pernas_concluidas, horimetro_inicial, horimetro_final, horas,
  combustivel_inicial_l, combustivel_final_l, pousos, natureza, status, pendente_horimetro, observacao,
  foto_horimetro_inicial, foto_horimetro_final, autor_id,
  socios ( apelido ), pilotos ( nome )`;

type LinhaBruta = {
  id: string; data: string; data_volta?: string | null; socio_id: string | null; origem: string | null; destino: string | null; escalas: string[] | null; horas_pernas: (string | number)[] | null; combustivel_pernas: (string | number)[] | null; horimetro_pernas?: (string | number)[] | null; pernas_concluidas?: number | null;
  horimetro_inicial: string | null; horimetro_final: string | null; horas: string;
  combustivel_inicial_l: string | null; combustivel_final_l: string | null; pousos: number;
  natureza: NaturezaVoo; status: "RASCUNHO" | "CONFIRMADO"; pendente_horimetro: boolean; observacao: string | null;
  foto_horimetro_inicial: string | null; foto_horimetro_final: string | null; autor_id: string | null;
  socios: { apelido: string } | null; pilotos: { nome: string } | null;
};

function n(v: string | null): number | null {
  return v === null ? null : Number(v);
}

function mapear(v: LinhaBruta): VooLinha {
  return {
    id: v.id,
    data: v.data,
    data_volta: v.data_volta ?? null,
    socio_id: v.socio_id,
    socio: v.socios?.apelido ?? null,
    piloto: v.pilotos?.nome ?? null,
    origem: v.origem,
    destino: v.destino,
    escalas: v.escalas ?? [],
    horas_pernas: (v.horas_pernas ?? []).map(Number),
    combustivel_pernas: (v.combustivel_pernas ?? []).map(Number),
    horimetro_pernas: (v.horimetro_pernas ?? []).map(Number),
    pernas_concluidas: Number(v.pernas_concluidas ?? 0),
    horimetro_inicial: n(v.horimetro_inicial),
    horimetro_final: n(v.horimetro_final),
    horas: Number(v.horas),
    combustivel_inicial_l: n(v.combustivel_inicial_l),
    combustivel_final_l: n(v.combustivel_final_l),
    pousos: v.pousos,
    natureza: v.natureza,
    status: v.status,
    pendente_horimetro: v.pendente_horimetro,
    observacao: v.observacao,
    foto_horimetro_inicial: v.foto_horimetro_inicial,
    foto_horimetro_final: v.foto_horimetro_final,
    autor_id: v.autor_id,
  };
}

export async function listarVoos(aeronaveId: string, filtro: FiltroVoos = {}, limite = 500): Promise<VooLinha[]> {
  const supabase = await criarClienteServidor();
  let q = supabase
    .from("voos")
    .select(SELECT)
    .eq("aeronave_id", aeronaveId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .order("horimetro_inicial", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limite);

  if (filtro.socio === "SOCIEDADE") q = q.is("socio_id", null);
  else if (filtro.socio) q = q.eq("socio_id", filtro.socio);
  if (filtro.de) q = q.gte("data", filtro.de);
  if (filtro.ate) q = q.lte("data", filtro.ate);
  if (filtro.natureza) q = q.eq("natureza", filtro.natureza);
  if (filtro.aerodromo) q = q.or(`origem.eq.${filtro.aerodromo},destino.eq.${filtro.aerodromo},escalas.cs.{${filtro.aerodromo}}`);
  if (filtro.pendentes) q = q.or("status.eq.RASCUNHO,pendente_horimetro.eq.true,and(horimetro_final.is.null,horimetro_inicial.not.is.null)");

  const { data, error } = await q;
  if (error) throw new Error(`Voos: ${error.message}`);
  return ((data ?? []) as unknown as LinhaBruta[]).map(mapear);
}

export async function buscarVoo(id: string): Promise<VooLinha | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("voos").select(SELECT).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Voo: ${error.message}`);
  return data ? mapear(data as unknown as LinhaBruta) : null;
}

/** "SNTF → SDIY → SIFC" */
export function trecho(v: { origem: string | null; escalas?: string[]; destino: string | null }): string {
  return [v.origem ?? "?", ...(v.escalas ?? []), v.destino ?? "?"].join(" → ");
}

/** Último horímetro confirmado da aeronave — de onde o próximo voo começa. */
export async function ultimoHorimetro(aeronaveId: string): Promise<number | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("ultimo_horimetro", { p_aeronave: aeronaveId });
  if (error) return null;
  return data === null ? null : Number(data);
}

/** Voo em aberto (sem horímetro final) de quem está logado: "estou voando agora". */
export async function vooEmAberto(aeronaveId: string): Promise<VooLinha | null> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("voos")
    .select(SELECT)
    .eq("aeronave_id", aeronaveId)
    .is("deleted_at", null)
    .is("horimetro_final", null)
    .is("horas_informadas", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapear(data as unknown as LinhaBruta) : null;
}

/**
 * Onde o avião está: o destino do último voo fechado. Fora da base, o
 * próximo voo é a volta — de outro dia, com a própria data (cada perna é um
 * voo, como no diário de bordo).
 */
export async function ondeEstaAviao(aeronaveId: string): Promise<VooLinha | null> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("voos")
    .select(SELECT)
    .eq("aeronave_id", aeronaveId)
    .is("deleted_at", null)
    .or("horimetro_final.not.is.null,horas_informadas.not.is.null")
    .order("data", { ascending: false })
    .order("horimetro_final", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapear(data as unknown as LinhaBruta) : null;
}

/** Horas e voos por sócio no mês, com o uso comum já dividido. */
export async function horasPorSocioNoMes(aeronaveId: string, mes: string) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("v_socio_mes")
    .select("socio_id, apelido, cor, mes, horas, voos, custo")
    .eq("mes", mes)
    .order("apelido");
  if (error) throw new Error(`Horas do mês: ${error.message}`);
  return (data ?? []).map((l) => ({ ...l, horas: Number(l.horas), custo: Number(l.custo), voos: Number(l.voos) }));
}

/** Horas acumuladas por sócio num período (para o painel e para a agenda). */
export async function horasPorSocio(aeronaveId: string, de: string, ate: string) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("horas_por_socio", { p_aeronave: aeronaveId, p_inicio: de, p_fim: ate });
  if (error) throw new Error(`Horas por sócio: ${error.message}`);
  return ((data ?? []) as { socio_id: string; horas: string }[]).map((l) => ({ socio_id: l.socio_id, horas: Number(l.horas) }));
}

/** URL assinada para mostrar a foto do horímetro (15 min). */
export async function urlDaFoto(caminho: string | null): Promise<string | null> {
  if (!caminho) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.storage.from("horimetro").createSignedUrl(caminho, 900);
  return data?.signedUrl ?? null;
}
