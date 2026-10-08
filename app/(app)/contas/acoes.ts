"use server";

import { revalidatePath } from "next/cache";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { notasParaConta, type NotaCandidata } from "@/lib/dados/contas";
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
const uuid = (form: FormData, campo: string) => {
  const t = texto(form, campo);
  return t && UUID.test(t) ? t : null;
};

function revalidar() {
  for (const p of ["/contas", "/inicio"]) revalidatePath(p);
}

async function exigirAcesso() {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !veValores(usuario.perfil)) return null;
  return { id: user.id, admin: usuario.perfil === "admin" };
}

/**
 * Boleto a pagar: só controle de vencimento. Não gera custo nem rateio —
 * o custo entra pela nota, em Despesas, e as duas se ligam na conciliação.
 */
export async function salvarConta(_a: Resultado, form: FormData): Promise<Resultado> {
  const quem = await exigirAcesso();
  if (!quem) return { ok: false, mensagem: "Sem acesso." };

  const descricao = texto(form, "descricao");
  const valor = lerNumero(form.get("valor"));
  const vencimento = texto(form, "vencimento");
  if (!descricao) return { ok: false, mensagem: "Descreva a conta." };
  if (valor === null || valor <= 0) return { ok: false, mensagem: "Informe o valor." };
  if (!vencimento) return { ok: false, mensagem: "Informe o vencimento." };

  const categoria = texto(form, "categoria_id");
  const campos = {
    descricao,
    fornecedor_id: uuid(form, "fornecedor_id"),
    categoria_id: categoria && Number.isInteger(Number(categoria)) ? Number(categoria) : null,
    valor,
    vencimento,
    documento: texto(form, "documento"),
    observacao: texto(form, "observacao"),
    boleto_path: texto(form, "boleto_path"),
  };

  const supabase = await criarClienteServidor();
  const id = uuid(form, "id");
  if (id) {
    const { error } = await supabase.from("contas_pagar").update(campos).eq("id", id);
    if (error) return { ok: false, mensagem: `Falha ao gravar: ${error.message}` };
    revalidar();
    return { ok: true, mensagem: "Conta atualizada." };
  }

  const aeronave = await aeronaveAtiva();
  const { error } = await supabase.from("contas_pagar").insert({ ...campos, aeronave_id: aeronave.id, autor_id: quem.id });
  if (error) return { ok: false, mensagem: `Falha ao gravar: ${error.message}` };
  revalidar();
  return { ok: true, mensagem: "Conta lançada. Ela não entra no rateio — o custo vem da nota." };
}

/** Notas lançadas que combinam com a conta — buscadas só quando a pessoa pede. */
export async function sugestoesDaConta(contaId: string): Promise<{ ok: boolean; mensagem: string; notas: NotaCandidata[] }> {
  const quem = await exigirAcesso();
  if (!quem) return { ok: false, mensagem: "Sem acesso.", notas: [] };
  if (!UUID.test(contaId)) return { ok: false, mensagem: "Conta inválida.", notas: [] };
  try {
    const notas = await notasParaConta(contaId);
    return { ok: true, mensagem: notas.length === 0 ? "Nenhuma nota parecida com esta conta." : "", notas };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : "Falha na busca.", notas: [] };
  }
}

/** Liga (ou desliga) a nota já lançada que corresponde à conta. */
export async function ligarNota(contaId: string, despesaId: string | null): Promise<Resultado> {
  const quem = await exigirAcesso();
  if (!quem) return { ok: false, mensagem: "Sem acesso." };
  if (!UUID.test(contaId) || (despesaId !== null && !UUID.test(despesaId))) return { ok: false, mensagem: "Conta ou nota inválida." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("contas_pagar").update({ despesa_id: despesaId }).eq("id", contaId);
  if (error) {
    const dupe = /contas_pagar_despesa_id_key|duplicate key/.test(error.message);
    return { ok: false, mensagem: dupe ? "Essa nota já está ligada a outra conta." : error.message };
  }
  revalidar();
  return { ok: true, mensagem: despesaId ? "Nota ligada à conta." : "Nota desligada." };
}

/** Marca a conta como paga (ou desfaz), com quem pagou e o comprovante. */
export async function marcarPaga(contaId: string, dados: { data?: string; pagador?: string | null; comprovante?: string | null } | null): Promise<Resultado> {
  const quem = await exigirAcesso();
  if (!quem) return { ok: false, mensagem: "Sem acesso." };
  if (!UUID.test(contaId)) return { ok: false, mensagem: "Conta inválida." };

  const supabase = await criarClienteServidor();
  const campos = dados
    ? {
        pago_em: dados.data || hoje(),
        pago_por: quem.id,
        pagador_socio_id: dados.pagador && UUID.test(dados.pagador) ? dados.pagador : null,
        comprovante_path: dados.comprovante ?? null,
      }
    : { pago_em: null, pago_por: null, pagador_socio_id: null, comprovante_path: null };
  const { error } = await supabase.from("contas_pagar").update(campos).eq("id", contaId);
  if (error) return { ok: false, mensagem: error.message };
  revalidar();
  return { ok: true, mensagem: dados ? "Conta marcada como paga." : "Pagamento desfeito." };
}

export async function apagarConta(id: string): Promise<Resultado> {
  const quem = await exigirAcesso();
  if (!quem) return { ok: false, mensagem: "Sem acesso." };
  if (!quem.admin) return { ok: false, mensagem: "Só o administrador apaga conta." };
  if (!UUID.test(id)) return { ok: false, mensagem: "Conta inválida." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("contas_pagar").update({ deleted_at: new Date().toISOString(), deleted_by: quem.id }).eq("id", id);
  if (error) return { ok: false, mensagem: error.message };
  revalidar();
  return { ok: true, mensagem: "Conta apagada." };
}
