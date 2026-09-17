"use server";

import { revalidatePath } from "next/cache";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
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

export async function salvarAporte(_anterior: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !veValores(usuario.perfil)) return { ok: false, mensagem: "Sem acesso." };

  const socioId = texto(form, "socio_id");
  if (!socioId || !UUID.test(socioId)) return { ok: false, mensagem: "Escolha o sócio." };
  const valor = lerNumero(form.get("valor"));
  if (valor === null || valor <= 0) return { ok: false, mensagem: "Informe o valor." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("aportes").insert({
    socio_id: socioId,
    data: texto(form, "data") ?? hoje(),
    valor,
    descricao: texto(form, "descricao"),
    comprovante_path: texto(form, "comprovante_path"),
    autor_id: user.id,
  });
  if (error) return { ok: false, mensagem: /está fechado/.test(error.message) ? error.message : `Falha ao gravar: ${error.message}` };

  revalidatePath("/aportes");
  revalidatePath("/extratos");
  revalidatePath("/inicio");
  return { ok: true, mensagem: "Aporte registrado." };
}

export async function apagarAporte(id: string): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || usuario?.perfil !== "admin") return { ok: false, mensagem: "Só o administrador apaga aporte." };
  if (!UUID.test(id)) return { ok: false, mensagem: "Aporte inválido." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("aportes").update({ deleted_at: new Date().toISOString(), deleted_by: user.id }).eq("id", id);
  if (error) return { ok: false, mensagem: error.message };

  revalidatePath("/aportes");
  revalidatePath("/extratos");
  revalidatePath("/inicio");
  return { ok: true, mensagem: "Aporte apagado." };
}
