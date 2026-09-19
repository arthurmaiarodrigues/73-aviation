"use server";

import { revalidatePath } from "next/cache";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { hoje, lerNumero } from "@/lib/formato";
import { mesesEntre } from "@/lib/dados/fechamento";

export type Resultado = { ok: boolean; mensagem: string };

/**
 * Novo valor por hora do fundo, valendo de um mês em diante. Os meses
 * abertos a partir dele são reprovisionados; mês fechado não muda.
 */
export async function definirValorDoFundo(_a: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || usuario?.perfil !== "admin") return { ok: false, mensagem: "Só o administrador altera o fundo de reserva." };
  const valor = lerNumero(form.get("valor_por_hora"));
  if (valor === null || valor < 0) return { ok: false, mensagem: "Informe o valor por hora." };
  const mesBruto = String(form.get("vigente_desde") ?? "");
  if (!/^\d{4}-\d{2}$/.test(mesBruto)) return { ok: false, mensagem: "Informe o mês a partir do qual vale." };
  const vigenteDesde = `${mesBruto}-01`;

  const aeronave = await aeronaveAtiva();
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("fundo_reserva_valores").upsert({ aeronave_id: aeronave.id, valor_por_hora: valor, vigente_desde: vigenteDesde }, { onConflict: "aeronave_id,vigente_desde" });
  if (error) return { ok: false, mensagem: error.message };

  // O valor "atual" da aeronave acompanha o mais recente já vigente.
  const mesAtual = `${hoje().slice(0, 7)}-01`;
  if (vigenteDesde <= mesAtual) await supabase.from("aeronaves").update({ fundo_reserva_por_hora: valor }).eq("id", aeronave.id);

  // Reprovisiona os meses abertos dali em diante (o banco pula os fechados).
  for (const m of mesesEntre(vigenteDesde, mesAtual)) {
    await supabase.rpc("provisionar_fundo_reserva", { p_aeronave: aeronave.id, p_mes: m });
  }

  for (const p of ["/fundo", "/inicio", "/extratos", "/fechamento", "/cadastros"]) revalidatePath(p);
  return { ok: true, mensagem: `Fundo de reserva: R$ ${valor.toFixed(2).replace(".", ",")} por hora a partir de ${mesBruto.slice(5)}/${mesBruto.slice(0, 4)}.` };
}

export async function apagarValorDoFundo(id: string): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || usuario?.perfil !== "admin") return { ok: false, mensagem: "Só o administrador." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("fundo_reserva_valores").delete().eq("id", id);
  if (error) return { ok: false, mensagem: error.message };
  for (const p of ["/fundo", "/inicio", "/cadastros"]) revalidatePath(p);
  return { ok: true, mensagem: "Valor removido do histórico." };
}
