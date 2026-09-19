"use server";

import { revalidatePath } from "next/cache";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { caixaAlta, hoje, lerNumero } from "@/lib/formato";
import { notificar } from "@/lib/push";

export type Resultado = { ok: boolean; mensagem: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(form: FormData, campo: string): string | null {
  const v = form.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function revalidar() {
  for (const p of ["/reembolsos", "/despesas", "/inicio"]) revalidatePath(p);
}

/**
 * O piloto lança o que pagou do bolso por conta de um sócio. Entra como
 * despesa DIRETO do sócio, paga por ele (custo dele), marcada com o piloto.
 */
export async function salvarReembolso(_a: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || usuario.perfil !== "piloto" || !usuario.pilotoId) return { ok: false, mensagem: "Só o piloto cadastrado lança reembolso." };

  const descricao = texto(form, "descricao");
  const valor = lerNumero(form.get("valor"));
  const socioId = texto(form, "socio_id");
  const categoriaId = Number(texto(form, "categoria_id") ?? "");
  if (!descricao) return { ok: false, mensagem: "Descreva o que pagou." };
  if (valor === null || valor <= 0) return { ok: false, mensagem: "Informe o valor." };
  if (!socioId || !UUID.test(socioId)) return { ok: false, mensagem: "Escolha o sócio que deve reembolsar." };
  if (!Number.isInteger(categoriaId)) return { ok: false, mensagem: "Escolha a categoria." };

  const aeronave = await aeronaveAtiva();
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("despesas").insert({
    aeronave_id: aeronave.id,
    data: texto(form, "data") ?? hoje(),
    descricao: `REEMBOLSO PILOTO: ${caixaAlta(descricao)}`,
    categoria_id: categoriaId,
    valor,
    comprovante_path: texto(form, "comprovante_path"),
    pagador_socio_id: socioId,
    criterio: "DIRETO",
    socio_direto_id: socioId,
    reembolso_piloto_id: usuario.pilotoId,
    observacao: texto(form, "observacao") ? caixaAlta(texto(form, "observacao")!) : null,
    autor_id: user.id,
  });
  if (error) return { ok: false, mensagem: /está fechado/.test(error.message) ? error.message : `Falha ao gravar: ${error.message}` };

  const { data: socio } = await supabase.from("socios").select("apelido, usuario_id").eq("id", socioId).maybeSingle();
  if (socio?.usuario_id) {
    await notificar(
      { usuarios: [socio.usuario_id] },
      { titulo: "Reembolso ao piloto", corpo: `${usuario.nome.split(" ")[0]} pagou ${caixaAlta(descricao)} — R$ ${valor.toFixed(2).replace(".", ",")}.`, url: "/reembolsos", tag: "reembolso" },
    );
  }
  revalidar();
  return { ok: true, mensagem: `Lançado. ${socio?.apelido ?? "O sócio"} recebe o aviso e marca quando reembolsar.` };
}

/** Sócio que deve, piloto (ao receber) ou admin. */
export async function marcarReembolsado(id: string, desfazer = false): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return { ok: false, mensagem: "Sem sessão." };
  if (!UUID.test(id)) return { ok: false, mensagem: "Reembolso inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("marcar_reembolsado", { p_despesa: id, p_desfazer: desfazer });
  if (error) return { ok: false, mensagem: error.message.replace(/^.*?(?:ERROR|error):\s*/, "") };
  revalidar();
  return { ok: true, mensagem: desfazer ? "Voltou para pendente." : "Marcado como reembolsado." };
}
