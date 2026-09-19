import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";
import { data as fmtData, hoje } from "@/lib/formato";
import { notificar } from "@/lib/push";

/** Bloco do mês: semana (seg–qui) ou fim de semana (sex–dom). */
export type Semana = {
  id: string;
  mes: string;
  tipo: "SEMANA" | "FDS";
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
  dias_base: number;
  semana_id: string | null;
  fds_id: string | null;
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
  /** Pedido fora dos blocos, aguardando os outros sócios. */
  pendente: boolean;
  feriado: boolean;
  respostas: { socio_id: string; apelido: string; concorda: boolean }[];
};

export type Troca = {
  id: string;
  de_socio_id: string;
  de: string;
  para_socio_id: string;
  para: string;
  bloco_de: { id: string; tipo: Semana["tipo"]; inicio: string; fim: string };
  bloco_para: { id: string; tipo: Semana["tipo"]; inicio: string; fim: string };
  status: "PENDENTE" | "ACEITA" | "RECUSADA" | "CANCELADA";
  created_at: string;
};

export const ROTULO_BLOCO: Record<Semana["tipo"], string> = { SEMANA: "semana (seg–qui)", FDS: "fim de semana (sex–dom)" };

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
  // Pedidos de dia comum com 48 h sem objeção: aprovados; piloto e dono ficam sabendo.
  const { data: liberadas } = await supabase.rpc("resolver_pedidos", { p_aeronave: aeronaveId });
  for (const id of (liberadas as string[] | null) ?? []) {
    const { data: r } = await supabase.from("reservas").select("inicio, fim, destino, socios ( apelido, usuario_id )").eq("id", id).maybeSingle();
    if (!r) continue;
    const so = r.socios as unknown as { apelido: string; usuario_id: string | null } | null;
    const quando = `${fmtData(r.inicio)}${r.fim !== r.inicio ? ` a ${fmtData(r.fim)}` : ""}${r.destino ? ` → ${r.destino}` : ""}`;
    await notificar({ perfis: ["piloto"] }, { titulo: "Voo agendado", corpo: `${so?.apelido ?? "Sócio"}: ${quando}.`, url: "/agenda", tag: "agenda" });
    if (so?.usuario_id) await notificar({ usuarios: [so.usuario_id] }, { titulo: "Pedido aprovado", corpo: `Seu pedido de ${quando} foi aprovado (ninguém precisou do avião).`, url: "/agenda", tag: "agenda" });
  }
}

export async function listarSemanas(aeronaveId: string, mes: string): Promise<Semana[]> {
  const supabase = await criarClienteServidor();
  // Garante as semanas do mês pedido mesmo sem escolha aberta (para navegar).
  await supabase.rpc("gerar_semanas", { p_aeronave: aeronaveId, p_mes: mes });
  const { data, error } = await supabase
    .from("semanas")
    .select("id, mes, tipo, inicio, fim, socio_id, cedida_por, socios!semanas_socio_id_fkey ( apelido, cor )")
    .eq("aeronave_id", aeronaveId)
    .eq("mes", mes)
    .order("inicio");
  if (error) throw new Error(`Semanas: ${error.message}`);
  return (data ?? []).map((s) => {
    const socio = s.socios as unknown as { apelido: string; cor: string } | null;
    return { id: s.id, mes: s.mes, tipo: (s.tipo ?? "SEMANA") as Semana["tipo"], inicio: s.inicio, fim: s.fim, socio_id: s.socio_id, socio: socio?.apelido ?? null, cor: socio?.cor ?? null, cedida_por: s.cedida_por };
  });
}

export async function fila(aeronaveId: string, mes: string): Promise<LinhaFila[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("escolha_semanas")
    .select("id, socio_id, ordem, horas_base, dias_base, semana_id, fds_id, escolhido_em, prazo, pulado, socios!escolha_semanas_socio_id_fkey ( apelido, cor )")
    .eq("aeronave_id", aeronaveId)
    .eq("mes", mes)
    .order("ordem");
  if (error) throw new Error(`Fila: ${error.message}`);
  return (data ?? []).map((l) => {
    const socio = l.socios as unknown as { apelido: string; cor: string } | null;
    return { ...l, apelido: socio?.apelido ?? "", cor: socio?.cor ?? "#0E2846", horas_base: Number(l.horas_base), dias_base: Number(l.dias_base ?? 0) };
  });
}

/** De quem é a vez (a função no banco também marca os pulados). */
export async function vezDeEscolher(aeronaveId: string, mes: string): Promise<string | null> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("vez_de_escolher", { p_aeronave: aeronaveId, p_mes: mes });
  return (data as string | null) ?? null;
}

const SELECT_RESERVA = "id, socio_id, inicio, fim, destino, motivo, origem, pendente, feriado, socios!reservas_socio_id_fkey ( apelido, cor ), reserva_respostas ( socio_id, concorda, socios ( apelido ) )";

function mapearReserva(r: Record<string, unknown>): Reserva {
  const socio = r.socios as { apelido: string; cor: string } | null;
  const respostas = ((r.reserva_respostas as { socio_id: string; concorda: boolean; socios: { apelido: string } | null }[] | null) ?? []).map((x) => ({
    socio_id: x.socio_id,
    apelido: x.socios?.apelido ?? "",
    concorda: x.concorda,
  }));
  return {
    id: r.id as string,
    socio_id: r.socio_id as string,
    socio: socio?.apelido ?? "",
    cor: socio?.cor ?? "#0E2846",
    inicio: r.inicio as string,
    fim: r.fim as string,
    destino: (r.destino as string | null) ?? null,
    motivo: (r.motivo as string | null) ?? null,
    origem: r.origem as Reserva["origem"],
    pendente: Boolean(r.pendente),
    feriado: Boolean(r.feriado),
    respostas,
  };
}

/** Reservas confirmadas e pedidos pendentes do período. */
export async function listarReservas(aeronaveId: string, de: string, ate: string): Promise<Reserva[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("reservas")
    .select(SELECT_RESERVA)
    .eq("aeronave_id", aeronaveId)
    .eq("status", "CONFIRMADA")
    .lte("inicio", ate)
    .gte("fim", de)
    .order("inicio");
  if (error) throw new Error(`Reservas: ${error.message}`);
  return (data ?? []).map((r) => mapearReserva(r as unknown as Record<string, unknown>));
}

/** Pedidos ainda sem resposta final (para o Início e a agenda). */
export async function pedidosPendentes(aeronaveId: string): Promise<Reserva[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("reservas")
    .select(SELECT_RESERVA)
    .eq("aeronave_id", aeronaveId)
    .eq("status", "CONFIRMADA")
    .eq("pendente", true)
    .gte("fim", hoje())
    .order("inicio");
  if (error) throw new Error(`Pedidos: ${error.message}`);
  return (data ?? []).map((r) => mapearReserva(r as unknown as Record<string, unknown>));
}

export async function listarTrocas(aeronaveId: string): Promise<Troca[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("trocas")
    .select("id, de_socio_id, para_socio_id, status, created_at, de:socios!trocas_de_socio_id_fkey ( apelido ), para:socios!trocas_para_socio_id_fkey ( apelido ), bloco_de:semanas!trocas_bloco_de_id_fkey ( id, tipo, inicio, fim ), bloco_para:semanas!trocas_bloco_para_id_fkey ( id, tipo, inicio, fim )")
    .eq("aeronave_id", aeronaveId)
    .eq("status", "PENDENTE")
    .order("created_at");
  if (error) throw new Error(`Trocas: ${error.message}`);
  type B = { id: string; tipo: Semana["tipo"]; inicio: string; fim: string };
  return (data ?? []).map((t) => ({
    id: t.id,
    de_socio_id: t.de_socio_id,
    de: (t.de as unknown as { apelido: string } | null)?.apelido ?? "",
    para_socio_id: t.para_socio_id,
    para: (t.para as unknown as { apelido: string } | null)?.apelido ?? "",
    bloco_de: t.bloco_de as unknown as B,
    bloco_para: t.bloco_para as unknown as B,
    status: t.status,
    created_at: t.created_at,
  }));
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
    .select(SELECT_RESERVA)
    .eq("aeronave_id", aeronaveId)
    .eq("status", "CONFIRMADA")
    .eq("pendente", false)
    .gte("fim", hoje())
    .order("inicio")
    .limit(limite);
  if (error) throw new Error(`Reservas: ${error.message}`);
  return (data ?? []).map((r) => mapearReserva(r as unknown as Record<string, unknown>));
}
