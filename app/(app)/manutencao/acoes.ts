"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { hoje, lerNumero } from "@/lib/formato";

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
const traduzir = (m: string) => m.replace(/^.*?(?:ERROR|error):\s*/, "").replace(/\s*\(SQLSTATE.*\)$/, "");

async function exigirAdminAcao(): Promise<{ ok: true; id: string } | { ok: false; mensagem: string }> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || usuario?.perfil !== "admin") return { ok: false, mensagem: "Só o administrador altera a manutenção." };
  return { ok: true, id: user.id };
}

/** Programar, atualizar e concluir: admin ou o piloto contratado (que acompanha a oficina). */
async function exigirOperador(): Promise<{ ok: true; id: string } | { ok: false; mensagem: string }> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !["admin", "piloto"].includes(usuario.perfil)) return { ok: false, mensagem: "Só o administrador ou o piloto altera a manutenção." };
  return { ok: true, id: user.id };
}

function revalidar(id?: string) {
  revalidatePath("/manutencao");
  if (id) revalidatePath(`/manutencao/${id}`);
  revalidatePath("/inicio");
  revalidatePath("/agenda");
  revalidatePath("/despesas");
  revalidatePath("/extratos");
}

// ---------------------------------------------------------------- plano
export async function salvarItemPlano(_a: Resultado, form: FormData): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  const descricao = texto(form, "descricao");
  if (!descricao) return { ok: false, mensagem: "Descreva o item." };
  const gatilho = texto(form, "gatilho") ?? "POR_HORAS";
  const campos = {
    descricao,
    gatilho,
    intervalo_horas: gatilho === "POR_TEMPO" ? null : lerNumero(form.get("intervalo_horas")),
    intervalo_meses: gatilho === "POR_HORAS" ? null : Math.round(lerNumero(form.get("intervalo_meses")) ?? 0) || null,
    ultima_data: texto(form, "ultima_data"),
    ultimo_horimetro: lerNumero(form.get("ultimo_horimetro")),
    aviso_horas: lerNumero(form.get("aviso_horas")) ?? 10,
    aviso_dias: Math.round(lerNumero(form.get("aviso_dias")) ?? 30),
    tipo_custo: texto(form, "tipo_custo") ?? "POR_USO",
    ativo: form.get("ativo") !== "off",
  };
  const supabase = await criarClienteServidor();
  const id = uuid(form, "id");
  const { error } = id
    ? await supabase.from("plano_manutencao").update(campos).eq("id", id)
    : await supabase.from("plano_manutencao").insert({ ...campos, aeronave_id: (await aeronaveAtiva()).id });
  if (error) return { ok: false, mensagem: /plano_intervalo/.test(error.message) ? "Informe o intervalo em horas e/ou em meses conforme o gatilho." : /unique|duplicate/i.test(error.message) ? "Já existe item com essa descrição." : traduzir(error.message) };
  revalidar();
  return { ok: true, mensagem: "Item do plano salvo." };
}

export async function desativarItemPlano(id: string): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  if (!UUID.test(id)) return { ok: false, mensagem: "Item inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("plano_manutencao").update({ ativo: false }).eq("id", id);
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar();
  return { ok: true, mensagem: "Item retirado do plano." };
}

// ---------------------------------------------------------- manutenções
export async function salvarManutencao(_a: Resultado, form: FormData): Promise<Resultado> {
  const adm = await exigirOperador();
  if (!adm.ok) return adm;
  const descricao = texto(form, "descricao");
  const data_inicio = texto(form, "data_inicio");
  if (!descricao || !data_inicio) return { ok: false, mensagem: "Descrição e data de entrada são obrigatórias." };
  const status = texto(form, "status") ?? "PROGRAMADA";
  if (!["PROGRAMADA", "EM_OFICINA"].includes(status)) return { ok: false, mensagem: "Concluir é pelo botão próprio." };
  const pagador = texto(form, "pagador");
  const campos = {
    descricao,
    fornecedor_id: uuid(form, "fornecedor_id"),
    data_inicio,
    data_fim: texto(form, "data_fim"),
    horimetro: lerNumero(form.get("horimetro")),
    status,
    pagador_socio_id: pagador && pagador !== "CAIXA" && UUID.test(pagador) ? pagador : null,
    voo_translado_id: uuid(form, "voo_translado_id"),
    voo_teste_id: uuid(form, "voo_teste_id"),
    observacao: texto(form, "observacao"),
  };
  const supabase = await criarClienteServidor();
  const id = uuid(form, "id");
  if (id) {
    const { error } = await supabase.from("manutencoes").update(campos).eq("id", id);
    if (error) return { ok: false, mensagem: traduzir(error.message) };
    revalidar(id);
    return { ok: true, mensagem: "Manutenção atualizada." };
  }
  const { data, error } = await supabase
    .from("manutencoes")
    .insert({ ...campos, aeronave_id: (await aeronaveAtiva()).id, autor_id: adm.id })
    .select("id")
    .single();
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar(data.id);
  redirect(`/manutencao/${data.id}?salvo=1`);
}

export async function salvarItemManutencao(_a: Resultado, form: FormData): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  const manutencaoId = uuid(form, "manutencao_id");
  if (!manutencaoId) return { ok: false, mensagem: "Manutenção inválida." };
  const descricao = texto(form, "descricao");
  const valor = lerNumero(form.get("valor"));
  if (!descricao || valor === null || valor < 0) return { ok: false, mensagem: "Descreva o item e informe o valor." };
  const campos = {
    manutencao_id: manutencaoId,
    plano_item_id: uuid(form, "plano_item_id"),
    descricao,
    valor,
    tipo_custo: texto(form, "tipo_custo") ?? "IGUAL",
    pago_pelo_fundo: form.get("pago_pelo_fundo") === "on",
  };
  const supabase = await criarClienteServidor();
  const id = uuid(form, "id");
  const { error } = id ? await supabase.from("manutencao_itens").update(campos).eq("id", id) : await supabase.from("manutencao_itens").insert(campos);
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar(manutencaoId);
  return { ok: true, mensagem: "Item lançado; a despesa e o rateio foram gerados." };
}

export async function apagarItemManutencao(id: string, manutencaoId: string): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  if (!UUID.test(id)) return { ok: false, mensagem: "Item inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("manutencao_itens").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar(manutencaoId);
  return { ok: true, mensagem: "Item removido (e a despesa dele)." };
}

export async function concluirManutencao(_a: Resultado, form: FormData): Promise<Resultado> {
  const adm = await exigirOperador();
  if (!adm.ok) return adm;
  const id = uuid(form, "id");
  if (!id) return { ok: false, mensagem: "Manutenção inválida." };
  const dataFim = texto(form, "data_fim") ?? hoje();
  const horimetro = lerNumero(form.get("horimetro"));
  const planoItens = form.getAll("plano_itens").map(String).filter((x) => UUID.test(x));
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("concluir_manutencao", { p_manutencao: id, p_data_fim: dataFim, p_horimetro: horimetro, p_plano_itens: planoItens });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar(id);
  return { ok: true, mensagem: "Manutenção concluída. Plano atualizado e avião liberado na agenda." };
}

export async function apagarManutencao(id: string): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  if (!UUID.test(id)) return { ok: false, mensagem: "Manutenção inválida." };
  const supabase = await criarClienteServidor();
  // Itens primeiro: cada um apaga a própria despesa e a saída do fundo.
  const { data: itens } = await supabase.from("manutencao_itens").select("id").eq("manutencao_id", id).is("deleted_at", null);
  for (const it of itens ?? []) await supabase.from("manutencao_itens").update({ deleted_at: new Date().toISOString() }).eq("id", it.id);
  const { error } = await supabase.from("manutencoes").update({ deleted_at: new Date().toISOString(), deleted_by: adm.id }).eq("id", id);
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar();
  redirect("/manutencao?apagada=1");
}

// ------------------------------------------------------------ documentos
export async function salvarDocumento(_a: Resultado, form: FormData): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  const tipo = texto(form, "tipo");
  const vencimento = texto(form, "vencimento");
  if (!tipo || !vencimento) return { ok: false, mensagem: "Tipo e vencimento são obrigatórios." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("documentos_aeronave").insert({
    aeronave_id: (await aeronaveAtiva()).id,
    tipo,
    numero: texto(form, "numero"),
    emissao: texto(form, "emissao"),
    vencimento,
    arquivo_path: texto(form, "arquivo_path"),
    observacao: texto(form, "observacao"),
    autor_id: adm.id,
  });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar();
  return { ok: true, mensagem: "Documento registrado." };
}

export async function apagarDocumento(id: string): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  if (!UUID.test(id)) return { ok: false, mensagem: "Documento inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("documentos_aeronave").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar();
  return { ok: true, mensagem: "Documento removido." };
}
