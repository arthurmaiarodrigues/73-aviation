"use server";

import { revalidatePath } from "next/cache";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva } from "@/lib/dados/cadastros";

export type Resultado = { ok: boolean; mensagem: string };

const traduzir = (m: string) => m.replace(/^.*?(?:ERROR|error):\s*/, "").replace(/\s*\(SQLSTATE.*\)$/, "");
const MES = /^\d{4}-\d{2}-01$/;

function texto(form: FormData, campo: string): string | null {
  const v = form.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function revalidar() {
  for (const p of ["/fechamento", "/inicio", "/extratos", "/despesas", "/voos"]) revalidatePath(p);
}

/** Fecha um mês ou um período (vários campos `mes`), em ordem; para no primeiro erro. */
export async function fecharMes(_a: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || usuario?.perfil !== "admin") return { ok: false, mensagem: "Só o administrador fecha o mês." };
  const meses = form.getAll("mes").map(String).filter((m) => MES.test(m)).sort();
  if (meses.length === 0) return { ok: false, mensagem: "Mês inválido." };
  const aeronave = await aeronaveAtiva();
  const supabase = await criarClienteServidor();
  const observacao = texto(form, "observacao");
  const fechados: string[] = [];
  for (const mes of meses) {
    const { data: ja } = await supabase.from("fechamentos").select("status").eq("aeronave_id", aeronave.id).eq("mes", mes).maybeSingle();
    if (ja?.status === "FECHADO") continue;
    const { error } = await supabase.rpc("fechar_mes", { p_aeronave: aeronave.id, p_mes: mes, p_observacao: observacao });
    if (error) {
      revalidar();
      return { ok: false, mensagem: `${mes.slice(5, 7)}/${mes.slice(0, 4)}: ${traduzir(error.message)}${fechados.length ? ` (já fechados: ${fechados.map((m) => m.slice(5, 7) + "/" + m.slice(0, 4)).join(", ")})` : ""}` };
    }
    fechados.push(mes);
  }
  revalidar();
  return { ok: true, mensagem: meses.length > 1 ? `Período fechado (${meses.length} meses). Rateios e fundo congelados.` : "Mês fechado. Rateios e fundo congelados; o PDF já reflete o resumo gravado." };
}

export async function reabrirMes(_a: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || usuario?.perfil !== "admin") return { ok: false, mensagem: "Só o administrador reabre o mês." };
  const mes = texto(form, "mes");
  const motivo = texto(form, "motivo");
  if (!mes || !MES.test(mes)) return { ok: false, mensagem: "Mês inválido." };
  if (!motivo) return { ok: false, mensagem: "Diga o motivo da reabertura (fica no histórico)." };
  const aeronave = await aeronaveAtiva();
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("reabrir_mes", { p_aeronave: aeronave.id, p_mes: mes, p_motivo: motivo });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar();
  return { ok: true, mensagem: "Mês reaberto. Lembre de fechar de novo depois do acerto." };
}
