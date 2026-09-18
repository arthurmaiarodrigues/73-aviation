"use server";

import { revalidatePath } from "next/cache";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva } from "@/lib/dados/cadastros";

export type Resultado = { ok: boolean; mensagem: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(form: FormData, campo: string): string | null {
  const v = form.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/** Mensagens do banco já vêm em português (raise exception); só tira o prefixo. */
function traduzir(m: string): string {
  return m.replace(/^.*?(?:ERROR|error):\s*/, "").replace(/\s*\(SQLSTATE.*\)$/, "");
}

function revalidar() {
  revalidatePath("/agenda");
  revalidatePath("/inicio");
}

export async function escolherSemana(semanaId: string): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !usuario.socioId) return { ok: false, mensagem: "Só sócio escolhe semana." };
  if (!UUID.test(semanaId)) return { ok: false, mensagem: "Semana inválida." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("escolher_semana", { p_semana: semanaId });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar();
  return { ok: true, mensagem: "Semana escolhida." };
}

export async function cederSemana(semanaId: string): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return { ok: false, mensagem: "Sem sessão." };
  if (!UUID.test(semanaId)) return { ok: false, mensagem: "Semana inválida." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("ceder_semana", { p_semana: semanaId });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar();
  return { ok: true, mensagem: "Semana devolvida ao pool." };
}

export async function reservar(_a: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !usuario.socioId) return { ok: false, mensagem: "Só sócio reserva." };
  const inicio = texto(form, "inicio");
  const fim = texto(form, "fim") ?? inicio;
  if (!inicio) return { ok: false, mensagem: "Informe o dia." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("reservar", {
    p_inicio: inicio,
    p_fim: fim,
    p_destino: texto(form, "destino"),
    p_motivo: texto(form, "motivo"),
  });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar();
  return { ok: true, mensagem: "Reserva feita." };
}

export async function cancelarReserva(id: string): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return { ok: false, mensagem: "Sem sessão." };
  if (!UUID.test(id)) return { ok: false, mensagem: "Reserva inválida." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("reservas")
    .update({ status: "CANCELADA", cancelada_em: new Date().toISOString(), cancelada_por: user.id })
    .eq("id", id);
  if (error) return { ok: false, mensagem: /row-level/i.test(error.message) ? "Só quem reservou (ou o administrador) cancela." : error.message };
  revalidar();
  return { ok: true, mensagem: "Reserva cancelada." };
}

export async function bloquear(_a: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || usuario?.perfil !== "admin") return { ok: false, mensagem: "Só o administrador bloqueia o avião." };
  const inicio = texto(form, "inicio");
  const fim = texto(form, "fim") ?? inicio;
  const motivo = texto(form, "motivo");
  if (!inicio || !motivo) return { ok: false, mensagem: "Informe o período e o motivo." };
  const tipo = texto(form, "tipo") ?? "OUTRO";
  const aeronave = await aeronaveAtiva();
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("bloqueios").insert({ aeronave_id: aeronave.id, inicio, fim, tipo, motivo, autor_id: user.id });
  if (error) return { ok: false, mensagem: error.message };
  revalidar();
  return { ok: true, mensagem: "Bloqueio registrado. Quem tinha reserva no período vê o aviso na agenda." };
}

export async function removerBloqueio(id: string): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || usuario?.perfil !== "admin") return { ok: false, mensagem: "Só o administrador." };
  if (!UUID.test(id)) return { ok: false, mensagem: "Bloqueio inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("bloqueios").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, mensagem: error.message };
  revalidar();
  return { ok: true, mensagem: "Bloqueio removido." };
}
