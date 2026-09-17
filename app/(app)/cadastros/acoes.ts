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

  // Todo sócio é piloto.
  if (!id) {
    const { data: novo } = await supabase.from("socios").select("id").eq("apelido", apelido.toUpperCase()).maybeSingle();
    if (novo) await supabase.from("pilotos").upsert({ nome, socio_id: novo.id }, { onConflict: "socio_id" });
  }

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
  const campos = { nome, licenca: texto(form, "licenca")?.toUpperCase() ?? null, validade_licenca: texto(form, "validade_licenca"), ativo: form.get("ativo") !== "off" };
  const { error } = id && UUID.test(id) ? await supabase.from("pilotos").update(campos).eq("id", id) : await supabase.from("pilotos").insert(campos);
  if (error) return { ok: false, mensagem: error.message };
  revalidatePath("/cadastros");
  return { ok: true, mensagem: "Piloto salvo." };
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
