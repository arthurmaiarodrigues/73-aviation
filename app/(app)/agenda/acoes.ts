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
  const { data: reservaId, error } = await supabase.rpc("reservar", {
    p_inicio: inicio,
    p_fim: fim,
    p_destino: texto(form, "destino"),
    p_motivo: texto(form, "motivo"),
    p_socio: socioId,
  });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  const destino = texto(form, "destino");
  const apelido = await apelidoDoSocio(socioId, usuario.socioApelido);
  const quando = `${fmtData(inicio)}${fim && fim !== inicio ? ` a ${fmtData(fim)}` : ""}${destino ? ` → ${destino.toUpperCase()}` : ""}`;
  const { data: feita } = await supabase.from("reservas").select("pendente, feriado, socio_id").eq("id", reservaId as string).maybeSingle();

  if (feita?.pendente) {
    // Dentro do bloco de alguém, quem decide é o titular; fora, os outros sócios.
    const { data: titular } = await supabase.rpc("titular_do_periodo", {
      p_socio: feita.socio_id,
      p_inicio: inicio,
      p_fim: fim,
    });
    if (titular) {
      const { data: dono } = await supabase.from("socios").select("apelido, usuario_id").eq("id", titular as string).maybeSingle();
      if (dono?.usuario_id) {
        await notificar(
          { usuarios: [dono.usuario_id] },
          {
            titulo: "Pedem a sua semana",
            corpo: `${apelido} quer o avião ${quando} — é o seu período. Se precisar, diga "preciso" na agenda; se não for usar, libere.`,
            url: "/agenda",
            tag: "pedido",
          },
        );
      }
    } else {
      await notificarOutrosSocios(feita.socio_id, {
        titulo: feita.feriado ? "Pedido de feriado — precisa do seu OK" : "Pedido de reserva",
        corpo: `${apelido} pediu o avião ${quando}. ${feita.feriado ? "Feriado: só confirma com o OK de todos." : "Alguém precisa? Sem objeção em 48 h, confirma."}`,
        url: "/agenda",
        tag: "pedido",
      });
    }
    revalidar();
    return {
      ok: true,
      mensagem: feita.feriado
        ? "Pedido enviado: por ser feriado prolongado, só confirma quando todos os outros sócios concordarem."
        : "Pedido enviado aos sócios: se ninguém precisar do avião em 48 h, confirma sozinho.",
    };
  }

  await notificar({ perfis: ["piloto"] }, { titulo: "Voo agendado", corpo: `${apelido}: ${quando}.`, url: "/agenda", tag: "agenda" });
  revalidar();
  return { ok: true, mensagem: socioId && socioId !== usuario.socioId ? `Reserva feita em nome de ${apelido}.` : "Reserva feita." };
}

/** Avisa os sócios (menos um) — os logins ligados a eles. */
async function notificarOutrosSocios(excetoSocioId: string | null, aviso: { titulo: string; corpo: string; url: string; tag: string }) {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("socios").select("id, usuario_id").eq("ativo", true).not("usuario_id", "is", null);
  const ids = (data ?? []).filter((so) => so.id !== excetoSocioId).map((so) => so.usuario_id as string);
  if (ids.length) await notificar({ usuarios: ids }, aviso);
}

/** Outro sócio responde ao pedido: concordo / preciso do avião. */
export async function responderPedido(id: string, concorda: boolean): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !usuario.socioId) return { ok: false, mensagem: "Só sócio responde." };
  if (!UUID.test(id)) return { ok: false, mensagem: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("responder_pedido", { p_reserva: id, p_concorda: concorda });
  if (error) return { ok: false, mensagem: traduzir(error.message) };

  const { data: r } = await supabase.from("reservas").select("inicio, fim, destino, status, pendente, socios!reservas_socio_id_fkey ( apelido, usuario_id )").eq("id", id).maybeSingle();
  if (r) {
    const so = r.socios as unknown as { apelido: string; usuario_id: string | null } | null;
    const quando = `${fmtData(r.inicio)}${r.fim !== r.inicio ? ` a ${fmtData(r.fim)}` : ""}${r.destino ? ` → ${r.destino}` : ""}`;
    if (r.status === "CANCELADA") {
      if (so?.usuario_id) await notificar({ usuarios: [so.usuario_id] }, { titulo: "Pedido negado", corpo: `${usuario.socioApelido} precisa do avião ${quando}. Seu pedido foi cancelado.`, url: "/agenda", tag: "agenda" });
    } else if (!r.pendente) {
      if (so?.usuario_id) await notificar({ usuarios: [so.usuario_id] }, { titulo: "Pedido aprovado", corpo: `Todos concordaram: ${quando} é seu.`, url: "/agenda", tag: "agenda" });
      await notificar({ perfis: ["piloto"] }, { titulo: "Voo agendado", corpo: `${so?.apelido ?? "Sócio"}: ${quando}.`, url: "/agenda", tag: "agenda" });
    }
  }
  revalidar();
  return { ok: true, mensagem: concorda ? "Resposta registrada: você concorda." : "Registrado: você precisa do avião. O pedido foi cancelado." };
}

/** Propor troca de bloco (semana por semana, fim de semana por fim de semana). */
export async function proporTroca(meuBloco: string, blocoDele: string): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !usuario.socioId) return { ok: false, mensagem: "Só sócio propõe troca." };
  if (!UUID.test(meuBloco) || !UUID.test(blocoDele)) return { ok: false, mensagem: "Período inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("propor_troca", { p_meu_bloco: meuBloco, p_bloco_dele: blocoDele });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  const { data: b } = await supabase.from("semanas").select("inicio, fim, socios!semanas_socio_id_fkey ( apelido, usuario_id )").eq("id", blocoDele).maybeSingle();
  const { data: meu } = await supabase.from("semanas").select("inicio, fim").eq("id", meuBloco).maybeSingle();
  const so = b?.socios as unknown as { apelido: string; usuario_id: string | null } | null;
  if (so?.usuario_id && b && meu) {
    await notificar({ usuarios: [so.usuario_id] }, { titulo: "Proposta de troca", corpo: `${usuario.socioApelido} quer trocar ${fmtData(meu.inicio)}–${fmtData(meu.fim)} pelo seu ${fmtData(b.inicio)}–${fmtData(b.fim)}. Aceita?`, url: "/agenda", tag: "troca" });
  }
  revalidar();
  return { ok: true, mensagem: `Proposta enviada a ${so?.apelido ?? "sócio"}. Vale quando ele aceitar.` };
}

export async function responderTroca(id: string, aceita: boolean): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return { ok: false, mensagem: "Sem sessão." };
  if (!UUID.test(id)) return { ok: false, mensagem: "Proposta inválida." };
  const supabase = await criarClienteServidor();
  const { data: t } = await supabase.from("trocas").select("de_socio_id, para_socio_id, de:socios!trocas_de_socio_id_fkey ( apelido, usuario_id )").eq("id", id).maybeSingle();
  const { error } = await supabase.rpc("responder_troca", { p_troca: id, p_aceita: aceita });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  const de = t?.de as unknown as { apelido: string; usuario_id: string | null } | null;
  if (de?.usuario_id && t?.de_socio_id !== usuario.socioId) {
    await notificar({ usuarios: [de.usuario_id] }, { titulo: aceita ? "Troca aceita" : "Troca recusada", corpo: `${usuario.socioApelido} ${aceita ? "aceitou" : "recusou"} a troca de períodos.`, url: "/agenda", tag: "troca" });
  }
  if (aceita) await notificar({ perfis: ["piloto"] }, { titulo: "Agenda alterada", corpo: "Dois sócios trocaram de período. Confira a agenda.", url: "/agenda", tag: "agenda" });
  revalidar();
  return { ok: true, mensagem: aceita ? "Troca feita: os períodos foram invertidos." : t?.de_socio_id === usuario.socioId ? "Proposta cancelada." : "Troca recusada." };
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

/** Reserva que terminou sem voo: piloto, sócio dono ou admin marca como não realizada. */
export async function marcarNaoRealizada(id: string): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return { ok: false, mensagem: "Sem sessão." };
  if (!UUID.test(id)) return { ok: false, mensagem: "Reserva inválida." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("marcar_nao_realizada", { p_reserva: id });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar();
  return { ok: true, mensagem: "Marcada como não realizada. Não conta como uso." };
}
