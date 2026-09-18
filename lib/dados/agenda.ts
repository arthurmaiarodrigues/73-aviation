import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";
import { hoje } from "@/lib/formato";

export type Semana = {
  id: string;
  mes: string;
  inicio: string;
  fim: string;
  socio_id: string | null;
  socio: string | null;
  cor: string | null;
  cedida_por: string | null;
};

export type LinhaFila = {
  id: string;
  socio_id: string;
  apelido: string;
  cor: string;
  ordem: number;
  horas_base: number;
  semana_id: string | null;
  escolhido_em: string | null;
  prazo: string | null;
  pulado: boolean;
};

export type Reserva = {
  id: string;
  socio_id: string;
  socio: string;
  cor: string;
  inicio: string;
  fim: string;
  destino: string | null;
  motivo: string | null;
  origem: "SEMANA" | "LIVRE" | "CEDIDA";
};

export type Bloqueio = {
  id: string;
  inicio: string;
  fim: string;
  tipo: "MANUTENCAO" | "DOCUMENTO" | "FORA_DA_BASE" | "OUTRO";
  motivo: string;
};

export type DiaAgenda = {
  dia: string;
  bloqueio_id: string | null;
  bloqueio_tipo: Bloqueio["tipo"] | null;
  bloqueio_motivo: string | null;
  reserva_id: string | null;
  reserva_socio_id: string | null;
  reserva_socio: string | null;
  reserva_destino: string | null;
  reserva_origem: Reserva["origem"] | null;
  semana_id: string | null;
  semana_socio_id: string | null;
  semana_socio: string | null;
};

export const ROTULO_BLOQUEIO: Record<Bloqueio["tipo"], string> = {
  MANUTENCAO: "Manutenção",
  DOCUMENTO: "Documento vencido",
  FORA_DA_BASE: "Fora da base",
  OUTRO: "Indisponível",
};

/** "AAAA-MM-01" do mês seguinte. */
export function mesSeguinte(mes: string): string {
  const d = new Date(`${mes.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function mesAnterior(mes: string): string {
  const d = new Date(`${mes.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Garante que a escolha está aberta: sempre para o mês corrente; a partir
 * do dia 15, também para o mês seguinte (regra do CLAUDE.md). Idempotente,
 * roda como definer no banco — qualquer sócio que abrir a agenda dispara.
 */
export async function garantirEscolhaAberta(aeronaveId: string): Promise<void> {
  const supabase = await criarClienteServidor();
  const h = hoje();
  const mesAtual = `${h.slice(0, 7)}-01`;
  await supabase.rpc("abrir_escolha", { p_aeronave: aeronaveId, p_mes: mesAtual });
  if (Number(h.slice(8, 10)) >= 15) {
    await supabase.rpc("abrir_escolha", { p_aeronave: aeronaveId, p_mes: mesSeguinte(mesAtual) });
  }
}

export async function listarSemanas(aeronaveId: string, mes: string): Promise<Semana[]> {
  const supabase = await criarClienteServidor();
  // Garante as semanas do mês pedido mesmo sem escolha aberta (para navegar).
  await supabase.rpc("gerar_semanas", { p_aeronave: aeronaveId, p_mes: mes });
  const { data, error } = await supabase
    .from("semanas")
    .select("id, mes, inicio, fim, socio_id, cedida_por, socios!semanas_socio_id_fkey ( apelido, cor )")
    .eq("aeronave_id", aeronaveId)
    .eq("mes", mes)
    .order("inicio");
  if (error) throw new Error(`Semanas: ${error.message}`);
  return (data ?? []).map((s) => {
    const socio = s.socios as unknown as { apelido: string; cor: string } | null;
    return { id: s.id, mes: s.mes, inicio: s.inicio, fim: s.fim, socio_id: s.socio_id, socio: socio?.apelido ?? null, cor: socio?.cor ?? null, cedida_por: s.cedida_por };
  });
}

export async function fila(aeronaveId: string, mes: string): Promise<LinhaFila[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("escolha_semanas")
    .select("id, socio_id, ordem, horas_base, semana_id, escolhido_em, prazo, pulado, socios ( apelido, cor )")
    .eq("aeronave_id", aeronaveId)
    .eq("mes", mes)
    .order("ordem");
  if (error) throw new Error(`Fila: ${error.message}`);
  return (data ?? []).map((l) => {
    const socio = l.socios as unknown as { apelido: string; cor: string } | null;
    return { ...l, apelido: socio?.apelido ?? "", cor: socio?.cor ?? "#0E2846", horas_base: Number(l.horas_base) };
  });
}

/** De quem é a vez (a função no banco também marca os pulados). */
export async function vezDeEscolher(aeronaveId: string, mes: string): Promise<string | null> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("vez_de_escolher", { p_aeronave: aeronaveId, p_mes: mes });
  return (data as string | null) ?? null;
}

export async function listarReservas(aeronaveId: string, de: string, ate: string): Promise<Reserva[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("reservas")
    .select("id, socio_id, inicio, fim, destino, motivo, origem, socios ( apelido, cor )")
    .eq("aeronave_id", aeronaveId)
    .eq("status", "CONFIRMADA")
    .lte("inicio", ate)
    .gte("fim", de)
    .order("inicio");
  if (error) throw new Error(`Reservas: ${error.message}`);
  return (data ?? []).map((r) => {
    const socio = r.socios as unknown as { apelido: string; cor: string } | null;
    return { ...r, socio: socio?.apelido ?? "", cor: socio?.cor ?? "#0E2846" } as Reserva;
  });
}

export async function listarBloqueios(aeronaveId: string, de: string, ate: string): Promise<Bloqueio[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("bloqueios")
    .select("id, inicio, fim, tipo, motivo")
    .eq("aeronave_id", aeronaveId)
    .is("deleted_at", null)
    .lte("inicio", ate)
    .gte("fim", de)
    .order("inicio");
  if (error) throw new Error(`Bloqueios: ${error.message}`);
  return (data ?? []) as Bloqueio[];
}

export async function agendaDoDia(aeronaveId: string, dia: string): Promise<DiaAgenda | null> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("v_agenda_dia").select("*").eq("aeronave_id", aeronaveId).eq("dia", dia).maybeSingle();
  return (data as DiaAgenda | null) ?? null;
}

export async function proximasReservas(aeronaveId: string, limite = 5): Promise<Reserva[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("reservas")
    .select("id, socio_id, inicio, fim, destino, motivo, origem, socios ( apelido, cor )")
    .eq("aeronave_id", aeronaveId)
    .eq("status", "CONFIRMADA")
    .gte("fim", hoje())
    .order("inicio")
    .limit(limite);
  if (error) throw new Error(`Reservas: ${error.message}`);
  return (data ?? []).map((r) => {
    const socio = r.socios as unknown as { apelido: string; cor: string } | null;
    return { ...r, socio: socio?.apelido ?? "", cor: socio?.cor ?? "#0E2846" } as Reserva;
  });
}
