"use server";

import { revalidatePath } from "next/cache";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { charsetDoOfx, lerOfx } from "@/lib/ofx";
import { lerCsvExtrato } from "@/lib/extrato-csv";

export type Resultado = { ok: boolean; mensagem: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const traduzir = (m: string) => {
  if (/extrato_banco_despesa_unq/.test(m)) return "Essa despesa já está conciliada com outra linha do extrato.";
  if (/extrato_banco_aporte_unq/.test(m)) return "Esse aporte já está conciliado com outra linha do extrato.";
  return m.replace(/^.*?(?:ERROR|error):s*/, "").replace(/s*(SQLSTATE.*)$/, "");
};

async function exigirAdminAcao(): Promise<{ ok: true; id: string } | { ok: false; mensagem: string }> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || usuario?.perfil !== "admin") return { ok: false, mensagem: "Só o administrador concilia." };
  return { ok: true, id: user.id };
}

function revalidar() {
  revalidatePath("/conciliacao");
  revalidatePath("/despesas");
  revalidatePath("/aportes");
}

/**
 * Importa OFX ou CSV. O arquivo vem pela Server Action (extrato é pequeno,
 * bem abaixo do limite de 10 MB). FITID repetido é ignorado: dá para
 * importar o mês inteiro de novo sem duplicar.
 */
export async function importarExtrato(_a: Resultado, form: FormData): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, mensagem: "Escolha o arquivo do extrato (OFX ou CSV)." };
  if (arquivo.size > 5 * 1024 * 1024) return { ok: false, mensagem: "Arquivo maior que 5 MB — não parece um extrato." };

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const inicio = bytes.subarray(0, 600).toString("latin1");
  const ehOfx = /OFXHEADER|<OFX>|<STMTTRN>/i.test(inicio) || /\.ofx$/i.test(arquivo.name);

  let banco = "SICOOB";
  let conta = String(form.get("conta") ?? "").trim().toUpperCase() || "PRINCIPAL";
  let transacoes: { fitid: string; data: string; valor: number; memo: string | null; referencia: string | null }[];
  try {
    if (ehOfx) {
      const texto = new TextDecoder(charsetDoOfx(inicio)).decode(bytes);
      const ext = lerOfx(texto);
      banco = ext.banco;
      conta = ext.conta;
      transacoes = ext.transacoes;
    } else {
      // CSV do banco costuma vir em Windows-1252; se tiver BOM/UTF-8, também lê.
      const utf = bytes.toString("utf8");
      const texto = /�/.test(utf) ? new TextDecoder("windows-1252").decode(bytes) : utf.replace(/^﻿/, "");
      transacoes = lerCsvExtrato(texto);
    }
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : "Não consegui ler o arquivo." };
  }

  const aeronave = await aeronaveAtiva();
  const supabase = await criarClienteServidor();
  const linhas = transacoes.map((t) => ({
    aeronave_id: aeronave.id,
    banco,
    conta,
    fitid: t.fitid,
    data: t.data,
    valor: t.valor,
    descricao: t.memo,
    referencia: t.referencia,
    arquivo: arquivo.name,
  }));
  const { data: antes } = await supabase.from("extrato_banco").select("fitid").eq("conta", conta).in("fitid", linhas.map((l) => l.fitid));
  const jaTinha = new Set((antes ?? []).map((a) => a.fitid));
  const novas = linhas.filter((l) => !jaTinha.has(l.fitid));
  if (novas.length > 0) {
    const { error } = await supabase.from("extrato_banco").insert(novas);
    if (error) return { ok: false, mensagem: traduzir(error.message) };
  }
  revalidar();
  const datas = transacoes.map((t) => t.data).sort();
  return {
    ok: true,
    mensagem: `${banco} · conta ${conta}: ${novas.length} lançamento(s) novo(s) de ${datas[0]?.split("-").reverse().join("/")} a ${datas[datas.length - 1]?.split("-").reverse().join("/")}${jaTinha.size ? ` (${jaTinha.size} já estavam)` : ""}.`,
  };
}

export async function conciliar(linhaId: string, tipo: "DESPESA" | "APORTE", id: string): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  if (!UUID.test(linhaId) || !UUID.test(id)) return { ok: false, mensagem: "Linha inválida." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("conciliar_linha", { p_linha: linhaId, p_tipo: tipo, p_id: id });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar();
  return { ok: true, mensagem: "Conciliado." };
}

export async function ignorar(linhaId: string, motivo: string): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  if (!UUID.test(linhaId)) return { ok: false, mensagem: "Linha inválida." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("ignorar_linha", { p_linha: linhaId, p_motivo: motivo.trim() || "IGNORADO" });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar();
  return { ok: true, mensagem: "Linha ignorada." };
}

export async function desfazer(linhaId: string): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  if (!UUID.test(linhaId)) return { ok: false, mensagem: "Linha inválida." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("desfazer_conciliacao", { p_linha: linhaId });
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  revalidar();
  return { ok: true, mensagem: "Voltou para pendente." };
}

/**
 * Linha do extrato que não tem despesa (tarifa, hangar debitado direto):
 * cria a despesa paga pelo caixa com a data e o valor da linha, na
 * categoria escolhida, e já concilia.
 */
export async function lancarDespesaDaLinha(linhaId: string, categoriaId: number, descricao: string, criterio: "IGUAL" | "POR_HORAS"): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  if (!UUID.test(linhaId)) return { ok: false, mensagem: "Linha inválida." };
  const supabase = await criarClienteServidor();
  const { data: l } = await supabase.from("extrato_banco").select("aeronave_id, data, valor, descricao, status").eq("id", linhaId).maybeSingle();
  if (!l) return { ok: false, mensagem: "Linha não encontrada." };
  if (l.status !== "PENDENTE") return { ok: false, mensagem: "Essa linha já foi tratada." };
  if (Number(l.valor) >= 0) return { ok: false, mensagem: "Entrada no extrato não vira despesa; se for aporte, cadastre em Aportes." };
  const { data: d, error } = await supabase
    .from("despesas")
    .insert({
      aeronave_id: l.aeronave_id,
      data: l.data,
      descricao: descricao.trim() || l.descricao || "LANÇAMENTO DO EXTRATO",
      categoria_id: categoriaId,
      valor: -Number(l.valor),
      pagador_socio_id: null,
      criterio,
      autor_id: adm.id,
      observacao: `DO EXTRATO: ${l.descricao ?? ""}`.trim(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  const { error: e2 } = await supabase.rpc("conciliar_linha", { p_linha: linhaId, p_tipo: "DESPESA", p_id: d.id });
  if (e2) return { ok: false, mensagem: traduzir(e2.message) };
  revalidar();
  return { ok: true, mensagem: "Despesa lançada pelo caixa e conciliada." };
}

export async function lancarAporteDaLinha(linhaId: string, socioId: string): Promise<Resultado> {
  const adm = await exigirAdminAcao();
  if (!adm.ok) return adm;
  if (!UUID.test(linhaId) || !UUID.test(socioId)) return { ok: false, mensagem: "Linha inválida." };
  const supabase = await criarClienteServidor();
  const { data: l } = await supabase.from("extrato_banco").select("data, valor, descricao, status").eq("id", linhaId).maybeSingle();
  if (!l) return { ok: false, mensagem: "Linha não encontrada." };
  if (l.status !== "PENDENTE") return { ok: false, mensagem: "Essa linha já foi tratada." };
  if (Number(l.valor) <= 0) return { ok: false, mensagem: "Saída no extrato não vira aporte." };
  const { data: a, error } = await supabase
    .from("aportes")
    .insert({ socio_id: socioId, data: l.data, valor: Number(l.valor), descricao: `DO EXTRATO: ${l.descricao ?? ""}`.trim(), autor_id: adm.id })
    .select("id")
    .single();
  if (error) return { ok: false, mensagem: traduzir(error.message) };
  const { error: e2 } = await supabase.rpc("conciliar_linha", { p_linha: linhaId, p_tipo: "APORTE", p_id: a.id });
  if (e2) return { ok: false, mensagem: traduzir(e2.message) };
  revalidar();
  return { ok: true, mensagem: "Aporte registrado e conciliado." };
}

