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
  // TODOS_IGUAL: uniforme, salário, CVA, homologação, revisão obrigatória.
  // TODOS_HORAS: manutenção e peças — divide conforme as horas voadas.
  const porHoras = socioId === "TODOS_HORAS";
  const deTodos = porHoras || socioId === "TODOS" || socioId === "TODOS_IGUAL";
  if (!deTodos && (!socioId || !UUID.test(socioId))) return { ok: false, mensagem: "Escolha quem deve reembolsar." };
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
    pagador_socio_id: deTodos ? null : socioId,
    criterio: deTodos ? (porHoras ? "POR_HORAS" : "IGUAL") : "DIRETO",
    socio_direto_id: deTodos ? null : socioId,
    reembolso_piloto_id: usuario.pilotoId,
    status: "PENDENTE",
    observacao: texto(form, "observacao") ? caixaAlta(texto(form, "observacao")!) : null,
    autor_id: user.id,
  });
  if (error) return { ok: false, mensagem: /está fechado/.test(error.message) ? error.message : `Falha ao gravar: ${error.message}` };

  // A divisão só vale depois que o administrador confere: é ele quem recebe o aviso.
  const valorTexto = `R$ ${valor.toFixed(2).replace(".", ",")}`;
  const divisao = deTodos ? (porHoras ? "todos, conforme as horas voadas" : "todos, partes iguais") : "um sócio";
  await notificar(
    { perfis: ["admin"] },
    { titulo: "Reembolso a conferir", corpo: `${usuario.nome.split(" ")[0]} pagou ${caixaAlta(descricao)} — ${valorTexto} (${divisao}).`, url: "/reembolsos", tag: "reembolso" },
  );
  revalidar();
  return { ok: true, mensagem: "Lançado. O administrador confere a divisão e confirma; aí os sócios são avisados." };
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

/**
 * O administrador confere a divisão antes de o reembolso entrar nas contas:
 * confirma como está ou corrige (um sócio, todos igual, todos pelas horas).
 * Só depois disso vira rateio, extrato e saída de caixa.
 */
export async function confirmarReembolso(id: string, criterio: "IGUAL" | "POR_HORAS" | "DIRETO", socio?: string | null): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || usuario.perfil !== "admin") return { ok: false, mensagem: "Só o administrador confirma." };
  if (!UUID.test(id)) return { ok: false, mensagem: "Reembolso inválido." };
  if (criterio === "DIRETO" && (!socio || !UUID.test(socio))) return { ok: false, mensagem: "Escolha o sócio." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("confirmar_reembolso", { p_despesa: id, p_criterio: criterio, p_socio: criterio === "DIRETO" ? socio : null });
  if (error) return { ok: false, mensagem: error.message.replace(/^.*?(?:ERROR|error):\s*/, "") };

  // Avisa quem passa a dever: o sócio (DIRETO) ou todos (IGUAL/POR_HORAS).
  const { data: d } = await supabase.from("despesas").select("descricao, valor, socio_direto_id").eq("id", id).maybeSingle();
  const alvo = criterio === "DIRETO"
    ? await supabase.from("socios").select("usuario_id").eq("id", socio!).maybeSingle().then((r) => (r.data?.usuario_id ? [r.data.usuario_id as string] : []))
    : await supabase.from("socios").select("usuario_id").is("ativo_ate", null).not("usuario_id", "is", null).then((r) => (r.data ?? []).map((s) => s.usuario_id as string));
  if (alvo.length > 0 && d) {
    await notificar(
      { usuarios: alvo },
      {
        titulo: "Reembolso ao piloto",
        corpo: `${d.descricao.replace(/^REEMBOLSO PILOTO: /, "")} — R$ ${Number(d.valor).toFixed(2).replace(".", ",")}${criterio === "DIRETO" ? "" : criterio === "POR_HORAS" ? ", dividido pelas horas voadas" : ", dividido em partes iguais"}.`,
        url: "/reembolsos",
        tag: "reembolso",
      },
    );
  }
  revalidar();
  return { ok: true, mensagem: "Confirmado — a divisão entrou nas contas." };
}
