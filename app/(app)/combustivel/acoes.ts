"use server";

import { revalidatePath } from "next/cache";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { caixaAlta, hoje, lerNumero } from "@/lib/formato";
import { veValores } from "@/lib/tipos";

export type Resultado = { ok: boolean; mensagem: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS = ["COMPRA", "RETIRADA", "AJUSTE"] as const;

function texto(form: FormData, campo: string): string | null {
  const v = form.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function revalidar() {
  for (const p of ["/combustivel", "/despesas", "/extratos", "/inicio", "/fechamento"]) revalidatePath(p);
}

/**
 * Movimento do tanque do hangar. O banco reflete: COMPRA vira despesa sem
 * rateio (crédito de quem pagou); RETIRADA vira abastecimento valorado pelo
 * preço médio (débito do sócio); AJUSTE só corrige o estoque.
 */
export async function salvarMovimentoTanque(_anterior: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return { ok: false, mensagem: "Sem acesso." };

  const tipo = texto(form, "tipo") as (typeof TIPOS)[number] | null;
  if (!tipo || !TIPOS.includes(tipo)) return { ok: false, mensagem: "Tipo inválido." };
  // Piloto abastece o avião pelo tanque; compra e medição são dos sócios.
  if (!veValores(usuario.perfil) && tipo !== "RETIRADA") return { ok: false, mensagem: "Sem acesso." };

  const aeronave = await aeronaveAtiva();
  const data = texto(form, "data") ?? hoje();
  const socioBruto = texto(form, "socio_id");
  const socioId = socioBruto && socioBruto !== "SOCIEDADE" && socioBruto !== "CAIXA" && UUID.test(socioBruto) ? socioBruto : null;
  const vooBruto = texto(form, "voo_id");
  const fornecedorBruto = texto(form, "fornecedor_id");

  let litros = lerNumero(form.get("litros"));
  let valor: number | null = null;

  if (tipo === "COMPRA") {
    valor = lerNumero(form.get("valor"));
    if (litros === null || litros <= 0) return { ok: false, mensagem: "Informe os litros comprados." };
    if (valor === null || valor < 0) return { ok: false, mensagem: "Informe o valor pago." };
  } else if (tipo === "RETIRADA") {
    if (litros === null || litros <= 0) return { ok: false, mensagem: "Informe os litros colocados no avião." };
  } else {
    // Medição: a pessoa informa o que a régua marcou; o ajuste é a diferença.
    const medido = lerNumero(form.get("litros_medidos"));
    const saldoAtual = lerNumero(form.get("saldo_atual"));
    if (medido === null || medido < 0) return { ok: false, mensagem: "Informe os litros medidos no tanque." };
    litros = Math.round((medido - (saldoAtual ?? 0)) * 10) / 10;
    if (litros === 0) return { ok: false, mensagem: "A medição bate com o saldo — nada a ajustar." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("tanque_movimentos").insert({
    aeronave_id: aeronave.id,
    data,
    tipo,
    litros,
    valor,
    socio_id: socioId,
    fornecedor_id: tipo === "COMPRA" && fornecedorBruto && UUID.test(fornecedorBruto) ? fornecedorBruto : null,
    comprovante_path: tipo === "COMPRA" ? texto(form, "comprovante_path") : null,
    voo_id: tipo === "RETIRADA" && vooBruto && UUID.test(vooBruto) ? vooBruto : null,
    observacao: texto(form, "observacao") ? caixaAlta(texto(form, "observacao")!) : null,
    autor_id: user.id,
  });
  if (error) return { ok: false, mensagem: /está fechado|Registre a compra/.test(error.message) ? error.message : `Falha ao gravar: ${error.message}` };

  revalidar();
  return {
    ok: true,
    mensagem:
      tipo === "COMPRA" ? "Compra registrada: o tanque encheu e quem pagou ficou com o crédito." :
      tipo === "RETIRADA" ? (veValores(usuario.perfil) ? "Abastecimento registrado: os litros saíram do tanque e entraram na conta do sócio." : "Abastecimento registrado.") :
      `Ajuste de ${String(litros).replace(".", ",")} L registrado.`,
  };
}

export async function apagarMovimentoTanque(id: string): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !veValores(usuario.perfil)) return { ok: false, mensagem: "Sem acesso." };
  if (!UUID.test(id)) return { ok: false, mensagem: "Movimento inválido." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("tanque_movimentos").update({ deleted_at: new Date().toISOString(), deleted_by: user.id }).eq("id", id);
  if (error) return { ok: false, mensagem: error.message };

  revalidar();
  return { ok: true, mensagem: "Movimento apagado." };
}
