"use server";

import { revalidatePath } from "next/cache";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { data as fmtData } from "@/lib/formato";
import { notificar } from "@/lib/push";

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
  const { data: semana } = await supabase.from("semanas").select("inicio, fim").eq("id", semanaId).maybeSingle();
  await notificar(
    { perfis: ["piloto"] },
    { titulo: "Semana escolhida", corpo: `${usuario.socioApelido ?? "Sócio"} ficou com a semana${semana ? ` de ${fmtData(semana.inicio)} a ${fmtData(semana.fim)}` : ""}.`, url: "/agenda", tag: "agenda" },
  );
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

/** Nome do sócio da reserva (o admin pode reservar em nome de outro). */
async function apelidoDoSocio(socioId: string | null, padrao: string | null): Promise<string> {
  if (!socioId) return padrao ?? "Sócio";
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("socios").select("apelido").eq("id", socioId).maybeSingle();
  return data?.apelido ?? padrao ?? "Sócio";
}

export async function reservar(_a: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || (!usuario.socioId && usuario.perfil !== "admin")) return { ok: false, mensagem: "Só sócio reserva." };
  const inicio = texto(form, "inicio");
  const fim = texto(form, "fim") ?? inicio;
  if (!inicio) return { ok: false, mensagem: "Informe o dia." };
  const socioBruto = texto(form, "socio_id");
  const socioId = usuario.perfil === "admin" && socioBruto && UUID.test(socioBruto) ? socioBruto : null;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("reservar", {
    p_inicio: inicio,
    p_fim: fim,
    p_destino: texto(form, "destino"),
    p_motivo: texto(form, "motivo"),
    p_socio: socioId,
  });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  const destino = texto(form, "destino");
  const apelido = await apelidoDoSocio(socioId, usuario.socioApelido);
  await notificar(
    { perfis: ["piloto"] },
    {
      titulo: "Voo agendado",
      corpo: `${apelido}: ${fmtData(inicio)}${fim && fim !== inicio ? ` a ${fmtData(fim)}` : ""}${destino ? ` → ${destino.toUpperCase()}` : ""}.`,
      url: "/agenda",
      tag: "agenda",
    },
  );
  revalidar();
  return { ok: true, mensagem: socioId && socioId !== usuario.socioId ? `Reserva feita em nome de ${apelido}.` : "Reserva feita." };
}

/** Quem reservou (ou o admin) muda datas, destino e — só o admin — o sócio. */
export async function editarReserva(_a: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return { ok: false, mensagem: "Sem sessão." };
  const id = texto(form, "id");
  if (!id || !UUID.test(id)) return { ok: false, mensagem: "Reserva inválida." };
  const inicio = texto(form, "inicio");
  const fim = texto(form, "fim") ?? inicio;
  if (!inicio) return { ok: false, mensagem: "Informe o dia." };
  const socioBruto = texto(form, "socio_id");
  const socioId = usuario.perfil === "admin" && socioBruto && UUID.test(socioBruto) ? socioBruto : null;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("editar_reserva", {
    p_id: id,
    p_inicio: inicio,
    p_fim: fim,
    p_destino: texto(form, "destino"),
    p_motivo: texto(form, "motivo"),
    p_socio: socioId,
  });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  const destino = texto(form, "destino");
  const apelido = await apelidoDoSocio(socioId, usuario.socioApelido);
  await notificar(
    { perfis: ["piloto"] },
    { titulo: "Agendamento alterado", corpo: `${apelido}: agora ${fmtData(inicio)}${fim && fim !== inicio ? ` a ${fmtData(fim)}` : ""}${destino ? ` → ${destino.toUpperCase()}` : ""}.`, url: "/agenda", tag: "agenda" },
  );
  revalidar();
  return { ok: true, mensagem: "Reserva alterada." };
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
  const { data: r } = await supabase.from("reservas").select("inicio, fim, destino, socios ( apelido )").eq("id", id).maybeSingle();
  if (r) {
    const apelido = (r.socios as unknown as { apelido: string } | null)?.apelido ?? "Sócio";
    await notificar({ perfis: ["piloto"] }, { titulo: "Reserva cancelada", corpo: `${apelido}: ${fmtData(r.inicio)}${r.destino ? ` → ${r.destino}` : ""} foi cancelada.`, url: "/agenda", tag: "agenda" });
  }
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
