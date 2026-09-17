"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { hoje, lerNumero } from "@/lib/formato";
import { veValores } from "@/lib/tipos";

export type Resultado = { ok: boolean; mensagem: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(form: FormData, campo: string): string | null {
  const v = form.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/**
 * Abastecimento: litros + valor + quem pagou. O banco gera a despesa
 * COMBUSTÍVEL (DIRETO de quem pagou, ou IGUAL quando é o caixa) e os litros
 * entram no saldo de combustível do sócio.
 */
export async function salvarAbastecimento(_anterior: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !veValores(usuario.perfil)) return { ok: false, mensagem: "Sem acesso." };

  const litros = lerNumero(form.get("litros"));
  const valor = lerNumero(form.get("valor"));
  if (litros === null || litros <= 0) return { ok: false, mensagem: "Informe os litros." };
  if (valor === null || valor < 0) return { ok: false, mensagem: "Informe o valor pago." };

  const aerodromo = texto(form, "aerodromo")?.toUpperCase() ?? null;
  if (aerodromo && !/^[A-Z0-9]{4}$/.test(aerodromo)) return { ok: false, mensagem: "Aeródromo em código ICAO (4 letras)." };

  const pagadorBruto = texto(form, "pagador");
  const pagador = pagadorBruto && pagadorBruto !== "CAIXA" && UUID.test(pagadorBruto) ? pagadorBruto : null;
  const vooBruto = texto(form, "voo_id");

  const aeronave = await aeronaveAtiva();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("abastecimentos")
    .insert({
      aeronave_id: aeronave.id,
      data: texto(form, "data") ?? hoje(),
      aerodromo,
      litros,
      valor,
      pagador_socio_id: pagador,
      comprovante_path: texto(form, "comprovante_path"),
      voo_id: vooBruto && UUID.test(vooBruto) ? vooBruto : null,
      observacao: texto(form, "observacao"),
      autor_id: user.id,
    })
    .select("despesa_id")
    .single();
  if (error) return { ok: false, mensagem: /está fechado/.test(error.message) ? error.message : `Falha ao gravar: ${error.message}` };

  revalidatePath("/despesas");
  revalidatePath("/extratos");
  revalidatePath("/inicio");
  redirect(data.despesa_id ? `/despesas/${data.despesa_id}?salvo=1` : "/despesas");
}
