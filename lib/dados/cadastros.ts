import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";
import type { Aeronave, Categoria, Fornecedor, Socio } from "@/lib/tipos";

/** A aeronave ativa. Hoje é uma só; a tabela existe para o dia em que houver outra. */
export async function aeronaveAtiva(): Promise<Aeronave> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("aeronaves")
    .select("id, matricula, modelo, base_icao, capacidade_combustivel_l, consumo_medio_lh, tbo_motor_horas, fundo_reserva_por_hora")
    .eq("ativo", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Aeronave: ${error.message}`);
  if (!data) throw new Error("Nenhuma aeronave cadastrada. Rode o schema.sql.");
  return {
    ...data,
    capacidade_combustivel_l: numero(data.capacidade_combustivel_l),
    consumo_medio_lh: numero(data.consumo_medio_lh),
    tbo_motor_horas: numero(data.tbo_motor_horas),
    fundo_reserva_por_hora: Number(data.fundo_reserva_por_hora),
  } as Aeronave;
}

function numero(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

export async function listarSocios(opcoes: { somenteAtivos?: boolean } = {}): Promise<Socio[]> {
  const supabase = await criarClienteServidor();
  let consulta = supabase
    .from("socios")
    .select("id, nome, apelido, cota, cor, ativo_desde, ativo_ate, usuario_id")
    .order("apelido");
  if (opcoes.somenteAtivos) consulta = consulta.is("ativo_ate", null);
  const { data, error } = await consulta;
  if (error) throw new Error(`Sócios: ${error.message}`);
  return (data ?? []).map((s) => ({ ...s, cota: Number(s.cota) })) as Socio[];
}

export async function listarPilotos(): Promise<{ id: string; nome: string; socio_id: string | null }[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("pilotos").select("id, nome, socio_id").eq("ativo", true).order("nome");
  if (error) throw new Error(`Pilotos: ${error.message}`);
  return data ?? [];
}

export async function listarCategorias(): Promise<Categoria[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("categorias_despesa").select("id, nome, ordem").order("ordem");
  if (error) throw new Error(`Categorias: ${error.message}`);
  return data ?? [];
}

export async function listarFornecedores(): Promise<Fornecedor[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, nome, cpf_cnpj, tipo, cidade")
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error(`Fornecedores: ${error.message}`);
  return (data ?? []) as Fornecedor[];
}

export async function listarAerodromos(): Promise<{ icao: string; nome: string | null; cidade: string | null }[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("aerodromos").select("icao, nome, cidade").order("icao");
  if (error) throw new Error(`Aeródromos: ${error.message}`);
  return data ?? [];
}

/** Aeródromos na ordem de uso recente (os últimos voos primeiro), para o seletor. */
export async function aerodromosRecentes(aeronaveId: string): Promise<string[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("voos")
    .select("origem, destino, data")
    .eq("aeronave_id", aeronaveId)
    .is("deleted_at", null)
    .order("data", { ascending: false })
    .limit(40);
  const vistos = new Set<string>();
  for (const v of data ?? []) {
    for (const i of [v.destino, v.origem]) if (i && !vistos.has(i)) vistos.add(i);
  }
  const todos = await listarAerodromos();
  for (const a of todos) vistos.add(a.icao);
  return [...vistos];
}
