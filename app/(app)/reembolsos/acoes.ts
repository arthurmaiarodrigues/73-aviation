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
  const cidade = texto(form, "cidade");
  if (!descricao) return { ok: false, mensagem: "Descreva o que pagou." };
  if (valor === null || valor <= 0) return { ok: false, mensagem: "Informe o valor." };
  // TODOS_IGUAL: uniforme, salário, CVA, homologação, revisão obrigatória.
  // TODOS_HORAS: manutenção e peças — divide conforme as horas voadas.
  const porHoras = socioId === "TODOS_HORAS";
  const deTodos = porHoras || socioId === "TODOS" || socioId === "TODOS_IGUAL";
  if (!deTodos && (!socioId || !UUID.test(socioId))) return { ok: false, mensagem: "Escolha quem deve reembolsar." };
  if (!Number.isInteger(categoriaId)) return { ok: false, mensagem: "Escolha a categoria." };
  if (!cidade) return { ok: false, mensagem: "Informe a cidade onde você gastou." };

  const aeronave = await aeronaveAtiva();
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("despesas").insert({
    aeronave_id: aeronave.id,
    data: texto(form, "data") ?? hoje(),
    descricao: `REEMBOLSO PILOTO: ${caixaAlta(descricao)}`,
    categoria_id: categoriaId,
    valor,
    comprovante_path: texto(form, "comprovante_path"),
    cidade: caixaAlta(cidade),
    pagador_socio_id: deTodos ? null : socioId,
    criterio: deTodos ? (porHoras ? "POR_HORAS" : "IGUAL") : "DIRETO",
    socio_direto_id: deTodos ? null : socioId,
    reembolso_piloto_id: usuario.pilotoId,
    // Entra valendo: o administrador ajusta a divisão depois, se precisar.
    status: "APROVADA",
    pago_pelos_socios: deTodos,
    observacao: texto(form, "observacao") ? caixaAlta(texto(form, "observacao")!) : null,
    autor_id: user.id,
  });
  if (error) return { ok: false, mensagem: /está fechado/.test(error.message) ? error.message : `Falha ao gravar: ${error.message}` };

  // Já vale: avisa quem vai pagar (o sócio, ou todos) e o administrador.
  const valorTexto = `R$ ${valor.toFixed(2).replace(".", ",")}`;
  const divisao = deTodos ? (porHoras ? ", dividido pelas horas voadas" : ", dividido em partes iguais") : "";
  const alvo = deTodos
    ? await supabase.from("socios").select("usuario_id").is("ativo_ate", null).not("usuario_id", "is", null).then((r) => (r.data ?? []).map((s) => s.usuario_id as string))
    : await supabase.from("socios").select("usuario_id").eq("id", socioId!).maybeSingle().then((r) => (r.data?.usuario_id ? [r.data.usuario_id as string] : []));
  const aviso = {
    titulo: "Reembolso ao piloto",
    corpo: `${usuario.nome.split(" ")[0]} pagou ${caixaAlta(descricao)} em ${caixaAlta(cidade)} — ${valorTexto}${divisao}.`,
    url: "/reembolsos",
    tag: "reembolso",
  };
  if (alvo.length > 0) await notificar({ usuarios: alvo }, aviso);
  await notificar({ perfis: ["admin"] }, aviso);
  revalidar();
  return { ok: true, mensagem: "Lançado e já dividido. Os sócios foram avisados; o administrador pode ajustar a divisão depois." };
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
 * O reembolso já entra valendo com a divisão que o piloto escolheu; aqui o
 * administrador ajusta depois (um sócio, todos igual, todos pelas horas) e
 * o rateio é refeito na hora.
 */
export async function confirmarReembolso(id: string, criterio: "IGUAL" | "POR_HORAS" | "DIRETO", socio?: string | null): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || usuario.perfil !== "admin") return { ok: false, mensagem: "Só o administrador ajusta a divisão." };
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
  return { ok: true, mensagem: "Divisão ajustada — o rateio foi refeito." };
}

/** Ajusta a divisão de vários de uma vez; `criterio` nulo mantém o que está. */
export async function confirmarVarios(ids: string[], criterio: "IGUAL" | "POR_HORAS" | "DIRETO" | null, socio?: string | null): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || usuario.perfil !== "admin") return { ok: false, mensagem: "Só o administrador ajusta a divisão." };
  const lista = ids.filter((id) => UUID.test(id));
  if (lista.length === 0) return { ok: false, mensagem: "Escolha ao menos um reembolso." };
  if (criterio === "DIRETO" && (!socio || !UUID.test(socio))) return { ok: false, mensagem: "Escolha o sócio." };

  const supabase = await criarClienteServidor();
  const avisar = new Set<string>();
  let feitos = 0;
  const falhas: string[] = [];
  for (const id of lista) {
    const { error } = await supabase.rpc("confirmar_reembolso", { p_despesa: id, p_criterio: criterio, p_socio: criterio === "DIRETO" ? socio : null });
    if (error) {
      falhas.push(error.message.replace(/^.*?(?:ERROR|error):\s*/, ""));
      continue;
    }
    feitos++;
    const { data: d } = await supabase.from("despesas").select("criterio, socio_direto_id").eq("id", id).maybeSingle();
    if (d?.criterio === "DIRETO" && d.socio_direto_id) {
      const { data: s } = await supabase.from("socios").select("usuario_id").eq("id", d.socio_direto_id).maybeSingle();
      if (s?.usuario_id) avisar.add(s.usuario_id as string);
    } else {
      const { data: todos } = await supabase.from("socios").select("usuario_id").is("ativo_ate", null).not("usuario_id", "is", null);
      for (const s of todos ?? []) avisar.add(s.usuario_id as string);
    }
  }
  if (avisar.size > 0) {
    await notificar(
      { usuarios: [...avisar] },
      { titulo: "Reembolso ao piloto", corpo: `${feitos === 1 ? "1 reembolso teve a divisão ajustada" : `${feitos} reembolsos tiveram a divisão ajustada`} pelo administrador — veja a sua parte.`, url: "/reembolsos", tag: "reembolso" },
    );
  }
  revalidar();
  if (feitos === 0) return { ok: false, mensagem: falhas[0] ?? "Nada ajustado." };
  return {
    ok: true,
    mensagem: `${feitos === 1 ? "1 reembolso ajustado" : `${feitos} reembolsos ajustados`}.${falhas.length > 0 ? ` ${falhas.length} falharam: ${falhas[0]}` : ""}`,
  };
}

/** Marca (ou desmarca) que um sócio pagou ao piloto a parte dele. */
export async function marcarPagoDoSocio(socioId: string, desfazer = false, comprovante?: string | null): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return { ok: false, mensagem: "Sem sessão." };
  if (!UUID.test(socioId)) return { ok: false, mensagem: "Sócio inválido." };
  if (usuario.perfil === "socio" && usuario.socioId !== socioId) return { ok: false, mensagem: "Cada sócio marca a própria parte." };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("marcar_reembolso_socio", {
    p_socio: socioId,
    p_despesas: null,
    p_desfazer: desfazer,
    p_comprovante: comprovante ?? null,
  });
  if (error) return { ok: false, mensagem: error.message.replace(/^.*?(?:ERROR|error):\s*/, "") };
  // O piloto fica sabendo na hora de quem entrou o PIX.
  if (!desfazer) {
    const { data: so } = await supabase.from("socios").select("apelido").eq("id", socioId).maybeSingle();
    await notificar(
      { perfis: ["piloto"] },
      { titulo: "Reembolso pago", corpo: `${so?.apelido ?? "Um sócio"} marcou o pagamento da parte dele${comprovante ? " e anexou o comprovante" : ""}.`, url: "/reembolsos", tag: "reembolso" },
    );
  }
  revalidar();
  const n = Number(data ?? 0);
  return {
    ok: true,
    mensagem: desfazer ? "Voltou para pendente." : n > 0 ? `${n} ${n === 1 ? "parte marcada" : "partes marcadas"} como paga.` : "Nada pendente para este sócio.",
  };
}
