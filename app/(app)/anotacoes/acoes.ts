"use server";

import { revalidatePath } from "next/cache";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { hoje, lerNumero } from "@/lib/formato";
import { notificar } from "@/lib/push";

export type Resultado = { ok: boolean; mensagem: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRAVIDADES = ["OBSERVACAO", "ATENCAO", "URGENTE"] as const;

function texto(form: FormData, campo: string): string | null {
  const v = form.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function revalidar() {
  for (const p of ["/anotacoes", "/manutencao", "/inicio"]) revalidatePath(p);
}

async function podeAnotar(): Promise<{ ok: true; id: string; nome: string } | { ok: false; mensagem: string }> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !["admin", "piloto"].includes(usuario.perfil)) return { ok: false, mensagem: "Só o administrador e o piloto anotam." };
  return { ok: true, id: user.id, nome: usuario.nome };
}

/** Nova anotação. Urgente avisa admin e sócios na hora. */
export async function salvarAnotacao(_a: Resultado, form: FormData): Promise<Resultado> {
  const quem = await podeAnotar();
  if (!quem.ok) return quem;
  const descricao = texto(form, "descricao");
  if (!descricao) return { ok: false, mensagem: "Descreva o problema." };
  const gravidade = (texto(form, "gravidade") ?? "OBSERVACAO") as (typeof GRAVIDADES)[number];
  if (!GRAVIDADES.includes(gravidade)) return { ok: false, mensagem: "Gravidade inválida." };

  const aeronave = await aeronaveAtiva();
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("anotacoes_aeronave").insert({
    aeronave_id: aeronave.id,
    data: texto(form, "data") ?? hoje(),
    descricao,
    gravidade,
    foto_path: texto(form, "foto_path"),
    horimetro: lerNumero(form.get("horimetro")),
    autor_id: quem.id,
  });
  if (error) return { ok: false, mensagem: `Falha ao gravar: ${error.message}` };

  if (gravidade === "URGENTE") {
    await notificar({ perfis: ["admin", "socio"] }, { titulo: "Problema urgente na aeronave", corpo: `${quem.nome.split(" ")[0]}: ${descricao.toUpperCase().slice(0, 120)}`, url: "/anotacoes", tag: "anotacao" });
  }
  revalidar();
  return { ok: true, mensagem: gravidade === "URGENTE" ? "Anotado e os sócios foram avisados." : "Anotado para a próxima revisão." };
}

export async function resolverAnotacao(id: string, resolucao: string | null, desfazer = false): Promise<Resultado> {
  const quem = await podeAnotar();
  if (!quem.ok) return quem;
  if (!UUID.test(id)) return { ok: false, mensagem: "Anotação inválida." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("anotacoes_aeronave")
    .update(desfazer ? { resolvida_em: null, resolvida_por: null, resolucao: null } : { resolvida_em: hoje(), resolvida_por: quem.id, resolucao: resolucao?.trim() || null })
    .eq("id", id);
  if (error) return { ok: false, mensagem: error.message };
  revalidar();
  return { ok: true, mensagem: desfazer ? "Reaberta." : "Marcada como resolvida." };
}

export async function apagarAnotacao(id: string): Promise<Resultado> {
  const quem = await podeAnotar();
  if (!quem.ok) return quem;
  if (!UUID.test(id)) return { ok: false, mensagem: "Anotação inválida." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("anotacoes_aeronave").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, mensagem: error.message };
  revalidar();
  return { ok: true, mensagem: "Anotação apagada." };
}
