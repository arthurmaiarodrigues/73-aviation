"use server";

import { revalidatePath } from "next/cache";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hoje, lerNumero } from "@/lib/formato";

export type Resultado = { ok: boolean; mensagem: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(form: FormData, campo: string): string | null {
  const v = form.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

async function exigirAdminAcao(): Promise<{ ok: true; id: string } | { ok: false; mensagem: string }> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || usuario?.perfil !== "admin") return { ok: false, mensagem: "Só o administrador altera cadastros." };
  return { ok: true, id: user.id };
}

export async function salvarAeronave(_a: Resultado, form: FormData): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  const id = texto(form, "id");
  if (!id || !UUID.test(id)) return { ok: false, mensagem: "Aeronave inválida." };

  const fundo = lerNumero(form.get("fundo_reserva_por_hora"));
  if (fundo === null || fundo < 0) return { ok: false, mensagem: "Informe o fundo de reserva por hora." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("aeronaves")
    .update({
      matricula: texto(form, "matricula")?.toUpperCase(),
      modelo: texto(form, "modelo")?.toUpperCase(),
      base_icao: texto(form, "base_icao")?.toUpperCase() ?? null,
      capacidade_combustivel_l: lerNumero(form.get("capacidade_combustivel_l")),
      consumo_medio_lh: lerNumero(form.get("consumo_medio_lh")),
      tbo_motor_horas: lerNumero(form.get("tbo_motor_horas")),
      fundo_reserva_por_hora: fundo,
    })
    .eq("id", id);
  if (error) return { ok: false, mensagem: error.message };

  // Histórico do valor por hora: vale deste mês em diante; meses fechados não mudam.
  const { error: e2 } = await supabase
    .from("fundo_reserva_valores")
    .upsert({ aeronave_id: id, valor_por_hora: fundo, vigente_desde: `${hoje().slice(0, 7)}-01` }, { onConflict: "aeronave_id,vigente_desde" });
  if (e2) return { ok: false, mensagem: e2.message };

  revalidatePath("/cadastros");
  revalidatePath("/inicio");
  return { ok: true, mensagem: "Aeronave atualizada." };
}

export async function salvarSocio(_a: Resultado, form: FormData): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;

  const nome = texto(form, "nome");
  const apelido = texto(form, "apelido");
  if (!nome || !apelido) return { ok: false, mensagem: "Nome e apelido são obrigatórios." };
  const cota = lerNumero(form.get("cota"));
  if (cota === null || cota <= 0 || cota > 100) return { ok: false, mensagem: "Cota entre 0 e 100." };
  const usuarioBruto = texto(form, "usuario_id");

  const campos = {
    nome,
    apelido,
    cpf: texto(form, "cpf"),
    cota,
    cor: texto(form, "cor") ?? "#0E2846",
    ativo_desde: texto(form, "ativo_desde") ?? hoje(),
    ativo_ate: texto(form, "ativo_ate"),
    usuario_id: usuarioBruto && UUID.test(usuarioBruto) ? usuarioBruto : null,
  };

  const supabase = await criarClienteServidor();
  const id = texto(form, "id");
  const { error } = id && UUID.test(id) ? await supabase.from("socios").update(campos).eq("id", id) : await supabase.from("socios").insert(campos);
  if (error) return { ok: false, mensagem: /unique|duplicate/i.test(error.message) ? "Já existe sócio com esse apelido ou esse usuário." : error.message };

  revalidatePath("/cadastros");
  revalidatePath("/inicio");
  return { ok: true, mensagem: "Sócio salvo." };
}

export async function salvarUsuario(_a: Resultado, form: FormData): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  const id = texto(form, "id");
  if (!id || !UUID.test(id)) return { ok: false, mensagem: "Usuário inválido." };
  const perfil = texto(form, "perfil");
  if (!perfil || !["admin", "socio", "piloto"].includes(perfil)) return { ok: false, mensagem: "Perfil inválido." };
  if (id === adm.id && perfil !== "admin") return { ok: false, mensagem: "Você não pode tirar o próprio perfil de administrador." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("usuarios")
    .update({ nome: texto(form, "nome") ?? undefined, perfil, ativo: form.get("ativo") === "on" || id === adm.id })
    .eq("id", id);
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath("/cadastros");
  return { ok: true, mensagem: "Usuário atualizado." };
}

export async function salvarPiloto(_a: Resultado, form: FormData): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  const nome = texto(form, "nome");
  if (!nome) return { ok: false, mensagem: "Informe o nome." };
  const supabase = await criarClienteServidor();
  const id = texto(form, "id");
  const campos = {
    nome,
    licenca: texto(form, "licenca")?.toUpperCase() ?? null,
    validade_licenca: texto(form, "validade_licenca"),
    pix: texto(form, "pix"),
    ativo: form.get("ativo") !== "off",
  };
  const { error } = id && UUID.test(id) ? await supabase.from("pilotos").update(campos).eq("id", id) : await supabase.from("pilotos").insert(campos);
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath("/cadastros");
  return { ok: true, mensagem: "Piloto salvo." };
}

/**
 * Remover piloto: apaga de vez. Voo antigo que apontava para ele fica sem
 * piloto (o registro do voo continua inteiro). Nenhum sócio pilota, então
 * não há vínculo a preservar.
 */
export async function removerPiloto(id: string): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  if (!UUID.test(id)) return { ok: false, mensagem: "Piloto inválido." };
  const supabase = await criarClienteServidor();
  const { data: p } = await supabase.from("pilotos").select("id, nome").eq("id", id).maybeSingle();
  if (!p) return { ok: false, mensagem: "Piloto não encontrado." };
  const { count } = await supabase.from("voos").select("*", { count: "exact", head: true }).eq("piloto_id", id);
  if ((count ?? 0) > 0) {
    const { error } = await supabase.from("voos").update({ piloto_id: null }).eq("piloto_id", id);
    if (error) return { ok: false, mensagem: error.message };
  }
  const { error } = await supabase.from("pilotos").delete().eq("id", id);
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath("/cadastros");
  revalidatePath("/voos");
  return { ok: true, mensagem: `${p.nome} apagado${count ? ` (${count} voo(s) ficaram sem piloto)` : ""}.` };
}

/** Inativar tira o piloto das listas sem apagar (voltou a voar? reativa). */
export async function ativarPiloto(id: string, ativo: boolean): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  if (!UUID.test(id)) return { ok: false, mensagem: "Piloto inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("pilotos").update({ ativo }).eq("id", id);
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath("/cadastros");
  revalidatePath("/voos/novo");
  return { ok: true, mensagem: ativo ? "Piloto reativado." : "Piloto inativado." };
}

export async function salvarFornecedor(_a: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || usuario.perfil === "piloto") return { ok: false, mensagem: "Sem acesso." };
  const nome = texto(form, "nome");
  if (!nome) return { ok: false, mensagem: "Informe o nome." };
  const tipo = texto(form, "tipo") === "PF" ? "PF" : "PJ";
  const supabase = await criarClienteServidor();
  const id = texto(form, "id");
  const campos = { nome, tipo, cpf_cnpj: texto(form, "cpf_cnpj"), cidade: texto(form, "cidade") };
  if (id && UUID.test(id)) {
    if (usuario.perfil !== "admin") return { ok: false, mensagem: "Só o administrador altera fornecedor." };
    const { error } = await supabase.from("fornecedores").update({ ...campos, ativo: form.get("ativo") !== "off" }).eq("id", id);
    if (error) return { ok: false, mensagem: error.message };
  } else {
    const { error } = await supabase.from("fornecedores").insert(campos);
    if (error) return { ok: false, mensagem: /unique|duplicate/i.test(error.message) ? "Já existe fornecedor com esse nome." : error.message };
  }
  revalidatePath("/cadastros");
  return { ok: true, mensagem: "Fornecedor salvo." };
}

export async function salvarAerodromo(_a: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return { ok: false, mensagem: "Sem acesso." };
  const icao = texto(form, "icao")?.toUpperCase();
  if (!icao || !/^[A-Z0-9]{4}$/.test(icao)) return { ok: false, mensagem: "Código ICAO de 4 letras." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("aerodromos").upsert({ icao, nome: texto(form, "nome"), cidade: texto(form, "cidade") }, { onConflict: "icao" });
  if (error) return { ok: false, mensagem: /row-level/i.test(error.message) ? "Só o administrador altera aeródromo já cadastrado." : error.message };
  revalidatePath("/cadastros");
  return { ok: true, mensagem: "Aeródromo salvo." };
}
