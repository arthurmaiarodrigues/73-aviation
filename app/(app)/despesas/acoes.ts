"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { hoje, lerNumero } from "@/lib/formato";
import { CRITERIOS, veValores, type CriterioRateio } from "@/lib/tipos";

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

function traduzir(mensagem: string): string {
  if (/está fechado|precisa somar 100/.test(mensagem)) return mensagem;
  if (/row-level security/i.test(mensagem)) return "Sem permissão para gravar esta despesa.";
  if (/despesas_direto_tem_socio/.test(mensagem)) return "Rateio direto precisa do sócio.";
  return mensagem;
}

/** Lê os percentuais manuais do formulário (campo `pct_<socio_id>`). */
function percentuaisManuais(form: FormData): { socio_id: string; percentual: number }[] {
  const lista: { socio_id: string; percentual: number }[] = [];
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("pct_") || typeof v !== "string") continue;
    const id = k.slice(4);
    const n = lerNumero(v);
    if (UUID.test(id) && n !== null && n > 0) lista.push({ socio_id: id, percentual: n });
  }
  return lista;
}

type Campos = {
  data: string;
  descricao: string;
  fornecedor_id: string | null;
  categoria_id: number;
  valor: number;
  pagador_socio_id: string | null;
  criterio: CriterioRateio;
  socio_direto_id: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  comprovante_path: string | null;
  observacao: string | null;
};

function lerCampos(form: FormData): { ok: true; campos: Campos; manuais: { socio_id: string; percentual: number }[] } | { ok: false; mensagem: string } {
  const descricao = texto(form, "descricao");
  if (!descricao) return { ok: false, mensagem: "Descreva a despesa." };
  const valor = lerNumero(form.get("valor"));
  if (valor === null || valor < 0) return { ok: false, mensagem: "Informe o valor." };
  const categoria_id = Number(texto(form, "categoria_id"));
  if (!Number.isInteger(categoria_id)) return { ok: false, mensagem: "Escolha a categoria." };
  const criterio = (texto(form, "criterio") ?? "IGUAL") as CriterioRateio;
  if (!CRITERIOS.includes(criterio)) return { ok: false, mensagem: "Critério de rateio inválido." };
  const socio_direto_id = uuid(form, "socio_direto_id");
  if (criterio === "DIRETO" && !socio_direto_id) return { ok: false, mensagem: "Rateio direto: escolha o sócio." };

  const manuais = criterio === "MANUAL" ? percentuaisManuais(form) : [];
  if (criterio === "MANUAL") {
    const soma = manuais.reduce((s, m) => s + m.percentual, 0);
    if (Math.abs(soma - 100) > 0.01) return { ok: false, mensagem: `Os percentuais somam ${soma.toFixed(2).replace(".", ",")} %; precisam somar 100 %.` };
  }

  const pagadorBruto = texto(form, "pagador");
  return {
    ok: true,
    manuais,
    campos: {
      data: texto(form, "data") ?? hoje(),
      descricao,
      fornecedor_id: uuid(form, "fornecedor_id"),
      categoria_id,
      valor,
      pagador_socio_id: pagadorBruto && pagadorBruto !== "CAIXA" && UUID.test(pagadorBruto) ? pagadorBruto : null,
      criterio,
      socio_direto_id: criterio === "DIRETO" ? socio_direto_id : null,
      periodo_inicio: criterio === "POR_HORAS" ? texto(form, "periodo_inicio") : null,
      periodo_fim: criterio === "POR_HORAS" ? texto(form, "periodo_fim") : null,
      comprovante_path: texto(form, "comprovante_path"),
      observacao: texto(form, "observacao"),
    },
  };
}

/** Rateio MANUAL: o banco grava os percentuais e fecha os centavos. */
async function gravarManuais(despesaId: string, manuais: { socio_id: string; percentual: number }[]) {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("definir_rateio_manual", { p_despesa: despesaId, p_percentuais: manuais });
  if (error) throw new Error(traduzir(error.message));
}

export async function salvarDespesa(_anterior: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !veValores(usuario.perfil)) return { ok: false, mensagem: "Sem acesso." };

  const lido = lerCampos(form);
  if (!lido.ok) return lido;
  const aeronave = await aeronaveAtiva();

  const supabase = await criarClienteServidor();
  const { data: criada, error } = await supabase
    .from("despesas")
    .insert({ ...lido.campos, aeronave_id: aeronave.id, autor_id: user.id, status: "APROVADA" })
    .select("id")
    .single();
  if (error) return { ok: false, mensagem: traduzir(error.message) };

  if (lido.campos.criterio === "MANUAL") {
    try {
      await gravarManuais(criada.id, lido.manuais);
    } catch (e) {
      return { ok: false, mensagem: e instanceof Error ? e.message : "Falha no rateio manual." };
    }
  }

  revalidatePath("/despesas");
  revalidatePath("/extratos");
  revalidatePath("/inicio");
  redirect(`/despesas/${criada.id}?salvo=1`);
}

export async function editarDespesa(_anterior: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !veValores(usuario.perfil)) return { ok: false, mensagem: "Sem acesso." };
  const id = uuid(form, "id");
  if (!id) return { ok: false, mensagem: "Despesa inválida." };

  const lido = lerCampos(form);
  if (!lido.ok) return lido;

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("despesas").update(lido.campos).eq("id", id);
  if (error) return { ok: false, mensagem: traduzir(error.message) };

  if (lido.campos.criterio === "MANUAL") {
    try {
      await gravarManuais(id, lido.manuais);
    } catch (e) {
      return { ok: false, mensagem: e instanceof Error ? e.message : "Falha no rateio manual." };
    }
  }

  revalidatePath("/despesas");
  revalidatePath(`/despesas/${id}`);
  revalidatePath("/extratos");
  revalidatePath("/inicio");
  return { ok: true, mensagem: "Despesa atualizada." };
}

export async function apagarDespesa(id: string): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || usuario?.perfil !== "admin") return { ok: false, mensagem: "Só o administrador apaga despesa." };
  if (!UUID.test(id)) return { ok: false, mensagem: "Despesa inválida." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("despesas").update({ deleted_at: new Date().toISOString(), deleted_by: user.id }).eq("id", id);
  if (error) return { ok: false, mensagem: traduzir(error.message) };

  revalidatePath("/despesas");
  revalidatePath("/extratos");
  revalidatePath("/inicio");
  redirect("/despesas?apagada=1");
}

/** Fornecedor novo direto do formulário de despesa. */
export async function criarFornecedor(nome: string, tipo: "PJ" | "PF"): Promise<{ ok: true; id: string; nome: string } | { ok: false; mensagem: string }> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !veValores(usuario.perfil)) return { ok: false, mensagem: "Sem acesso." };
  const limpo = nome.trim();
  if (limpo.length < 2) return { ok: false, mensagem: "Nome muito curto." };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("fornecedores").insert({ nome: limpo, tipo }).select("id, nome").single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const { data: existente } = await supabase.from("fornecedores").select("id, nome").ilike("nome", limpo).limit(1).maybeSingle();
      if (existente) return { ok: true, id: existente.id, nome: existente.nome };
    }
    return { ok: false, mensagem: error.message };
  }
  revalidatePath("/cadastros");
  return { ok: true, id: data.id, nome: data.nome };
}
