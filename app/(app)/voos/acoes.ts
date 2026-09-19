"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { ultimoHorimetro } from "@/lib/dados/voos";
import { hoje, lerHorasHm, lerNumero } from "@/lib/formato";
import { NATUREZAS, ehUsoComum, type NaturezaVoo } from "@/lib/tipos";

export type Resultado = { ok: boolean; mensagem: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ICAO = /^[A-Z0-9]{4}$/;

function texto(form: FormData, campo: string): string | null {
  const v = form.get(campo);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function icao(form: FormData, campo: string): string | null {
  const t = texto(form, campo)?.toUpperCase() ?? null;
  return t && ICAO.test(t) ? t : null;
}

/** Escalas (campos `escala`), só as válidas e na ordem. */
function escalas(form: FormData): string[] {
  return form
    .getAll("escala")
    .map((v) => String(v).trim().toUpperCase())
    .filter((v) => ICAO.test(v));
}

/** Horas (h:mm ou decimal) e combustível de cada perna; soma só se todas as horas estão preenchidas. */
function pernasDoForm(form: FormData, qtdEscalas: number): { horas: number[]; soma: number | null; combustivel: number[] } {
  if (qtdEscalas === 0) return { horas: [], soma: null, combustivel: [] };
  const horas = form.getAll("horas_perna").map((v) => lerHorasHm(String(v)));
  const combustivel = form.getAll("combustivel_perna").map((v) => lerNumero(String(v)));
  const horasOk = horas.length === qtdEscalas + 1 && horas.every((v): v is number => v !== null && v > 0);
  return {
    horas: horasOk ? (horas as number[]) : [],
    soma: horasOk ? Math.round((horas as number[]).reduce((s, v) => s + v, 0) * 10) / 10 : null,
    combustivel: combustivel.length === qtdEscalas + 1 ? combustivel.map((v) => v ?? 0) : [],
  };
}

function leituraJson(form: FormData, campo: string): unknown {
  const t = texto(form, campo);
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function traduzir(mensagem: string): string {
  if (/está fechado/.test(mensagem)) return mensagem;
  if (/voos_horimetro_ordem/.test(mensagem)) return "O horímetro final tem de ser maior ou igual ao inicial.";
  if (/voos_socio_por_natureza/.test(mensagem)) return "Voo particular precisa de sócio; uso comum não tem sócio.";
  if (/row-level security/i.test(mensagem)) return "Sem permissão para gravar este voo.";
  if (/origem_check|destino_check/.test(mensagem)) return "Aeródromo em código ICAO de 4 letras (ex.: SNTF).";
  return mensagem;
}

/**
 * Registra o voo. Com horímetro final → CONFIRMADO; sem → RASCUNHO ("estou
 * voando"). Se o horímetro inicial não bate com o último registrado, o
 * buraco vira um voo pendente `SOCIEDADE` para o admin resolver — nada se perde.
 */
export async function salvarVoo(_anterior: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return { ok: false, mensagem: "Sem sessão." };

  const aeronave = await aeronaveAtiva();
  const data = texto(form, "data") ?? hoje();
  const natureza = (texto(form, "natureza") ?? "PARTICULAR") as NaturezaVoo;
  if (!NATUREZAS.includes(natureza)) return { ok: false, mensagem: "Natureza inválida." };

  const socioBruto = texto(form, "socio_id");
  const socioId = ehUsoComum(natureza) ? null : socioBruto && UUID.test(socioBruto) ? socioBruto : null;
  if (!ehUsoComum(natureza) && !socioId) return { ok: false, mensagem: "Escolha o sócio responsável pelo voo." };
  // Piloto contratado registra o voo em nome do sócio que o contratou (ou da sociedade); o piloto do voo é ele mesmo.
  const pilotoBruto = texto(form, "piloto_id");
  const pilotoId = usuario.pilotoId ?? (pilotoBruto && UUID.test(pilotoBruto) ? pilotoBruto : null);

  const origem = icao(form, "origem");
  const destino = icao(form, "destino");
  if (!origem) return { ok: false, mensagem: "Informe a origem (código ICAO, ex.: SNTF)." };

  const hInicial = lerNumero(form.get("horimetro_inicial"));
  const hFinal = lerNumero(form.get("horimetro_final"));
  const escalasLista = escalas(form);
  const pernas = pernasDoForm(form, escalasLista.length);
  const horasInformadas = lerNumero(form.get("horas_informadas")) ?? pernas.soma;
  if (hInicial === null && horasInformadas === null) return { ok: false, mensagem: "Informe o horímetro inicial (ou as horas de cada perna)." };
  if (hFinal !== null && hInicial !== null && hFinal < hInicial) return { ok: false, mensagem: "O horímetro final tem de ser maior que o inicial." };
  if (hFinal !== null && hInicial !== null && hFinal - hInicial > 12) return { ok: false, mensagem: "Mais de 12 h num voo só? Confira os horímetros." };

  const combInicial = (pernas.combustivel[0] ?? null) || lerNumero(form.get("combustivel_inicial_l"));
  const combFinal = lerNumero(form.get("combustivel_final_l"));
  const pousos = Math.max(0, Math.round(lerNumero(form.get("pousos")) ?? 1));

  const supabase = await criarClienteServidor();

  // Continuidade do horímetro: o inicial deste voo deveria ser o final do anterior.
  const ultimo = await ultimoHorimetro(aeronave.id);
  if (ultimo !== null && hInicial !== null && hInicial < ultimo - 0.05 && usuario.perfil !== "admin") {
    return { ok: false, mensagem: `O horímetro inicial (${hInicial.toFixed(1)}) é menor que o último registrado (${ultimo.toFixed(1)}). Confira a foto ou peça ao administrador para corrigir o voo anterior.` };
  }
  if (ultimo !== null && hInicial !== null && hInicial > ultimo + 0.05) {
    const { error } = await supabase.from("voos").insert({
      aeronave_id: aeronave.id,
      data,
      socio_id: null,
      natureza: "SOCIEDADE",
      horimetro_inicial: ultimo,
      horimetro_final: hInicial,
      pousos: 0,
      status: "RASCUNHO",
      pendente_horimetro: true,
      observacao: `SEM REGISTRO: ${(hInicial - ultimo).toFixed(1).replace(".", ",")} H ENTRE O ÚLTIMO VOO E O VOO DE ${data.split("-").reverse().join("/")}. CONFERIR QUEM VOOU.`,
      autor_id: user.id,
    });
    if (error) return { ok: false, mensagem: `Não consegui registrar o buraco de horímetro: ${traduzir(error.message)}` };
  }

  const { data: criado, error } = await supabase
    .from("voos")
    .insert({
      aeronave_id: aeronave.id,
      data,
      socio_id: socioId,
      piloto_id: pilotoId,
      origem,
      destino,
      escalas: escalasLista,
      horas_pernas: pernas.horas,
      combustivel_pernas: pernas.combustivel,
      horimetro_inicial: hInicial,
      horimetro_final: hFinal,
      horas_informadas: hInicial === null ? horasInformadas : null,
      combustivel_inicial_l: combInicial,
      combustivel_final_l: combFinal,
      pousos,
      natureza,
      observacao: texto(form, "observacao"),
      foto_horimetro_inicial: texto(form, "foto_inicial"),
      foto_horimetro_final: texto(form, "foto_final"),
      leitura_ia: { inicial: leituraJson(form, "leitura_inicial"), final: leituraJson(form, "leitura_final") },
      status: hFinal !== null || (hInicial === null && horasInformadas !== null) ? "CONFIRMADO" : "RASCUNHO",
      pendente_horimetro: hInicial === null,
      autor_id: user.id,
    })
    .select("id")
    .single();

  if (error) return { ok: false, mensagem: traduzir(error.message) };

  revalidatePath("/voos");
  revalidatePath("/inicio");
  redirect(hFinal !== null ? `/voos/${criado.id}?salvo=1` : `/voos/${criado.id}?decolou=1`);
}

/** Fecha um voo aberto: foto e horímetro final, combustível final. */
export async function registrarPouso(_anterior: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return { ok: false, mensagem: "Sem sessão." };

  const id = texto(form, "id");
  if (!id || !UUID.test(id)) return { ok: false, mensagem: "Voo inválido." };

  const hFinal = lerNumero(form.get("horimetro_final"));
  if (hFinal === null) return { ok: false, mensagem: "Informe o horímetro final." };

  const supabase = await criarClienteServidor();
  const { data: voo } = await supabase.from("voos").select("horimetro_inicial, leitura_ia, destino").eq("id", id).maybeSingle();
  if (!voo) return { ok: false, mensagem: "Voo não encontrado." };
  const hInicial = voo.horimetro_inicial === null ? null : Number(voo.horimetro_inicial);
  if (hInicial !== null && hFinal < hInicial) return { ok: false, mensagem: "O horímetro final tem de ser maior que o inicial." };
  if (hInicial !== null && hFinal - hInicial > 12) return { ok: false, mensagem: "Mais de 12 h num voo só? Confira os horímetros." };

  const destino = icao(form, "destino") ?? voo.destino;
  const leituraAnterior = (voo.leitura_ia as Record<string, unknown> | null) ?? {};

  const { error } = await supabase
    .from("voos")
    .update({
      horimetro_final: hFinal,
      destino,
      ...(form.has("escala")
        ? (() => {
            const e = escalas(form);
            const p = pernasDoForm(form, e.length);
            return { escalas: e, horas_pernas: p.horas, combustivel_pernas: p.combustivel };
          })()
        : {}),
      combustivel_final_l: lerNumero(form.get("combustivel_final_l")),
      pousos: Math.max(0, Math.round(lerNumero(form.get("pousos")) ?? 1)),
      foto_horimetro_final: texto(form, "foto_final"),
      leitura_ia: { ...leituraAnterior, final: leituraJson(form, "leitura_final") },
      observacao: texto(form, "observacao"),
      status: "CONFIRMADO",
    })
    .eq("id", id);
  if (error) return { ok: false, mensagem: traduzir(error.message) };

  revalidatePath("/voos");
  revalidatePath(`/voos/${id}`);
  revalidatePath("/inicio");
  redirect(`/voos/${id}?salvo=1`);
}

/** Edição completa (autor ou admin). */
export async function editarVoo(_anterior: Resultado, form: FormData): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return { ok: false, mensagem: "Sem sessão." };

  const id = texto(form, "id");
  if (!id || !UUID.test(id)) return { ok: false, mensagem: "Voo inválido." };

  const natureza = (texto(form, "natureza") ?? "PARTICULAR") as NaturezaVoo;
  if (!NATUREZAS.includes(natureza)) return { ok: false, mensagem: "Natureza inválida." };
  const socioBruto = texto(form, "socio_id");
  const socioId = ehUsoComum(natureza) ? null : socioBruto && UUID.test(socioBruto) ? socioBruto : null;
  if (!ehUsoComum(natureza) && !socioId) return { ok: false, mensagem: "Escolha o sócio responsável." };
  const pilotoBruto = texto(form, "piloto_id");

  const hInicial = lerNumero(form.get("horimetro_inicial"));
  const hFinal = lerNumero(form.get("horimetro_final"));
  const escalasLista = escalas(form);
  const pernas = pernasDoForm(form, escalasLista.length);
  const horasInformadas = lerNumero(form.get("horas_informadas")) ?? pernas.soma;
  if (hInicial !== null && hFinal !== null && hFinal < hInicial) return { ok: false, mensagem: "O horímetro final tem de ser maior que o inicial." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("voos")
    .update({
      data: texto(form, "data") ?? hoje(),
      socio_id: socioId,
      piloto_id: pilotoBruto && UUID.test(pilotoBruto) ? pilotoBruto : null,
      origem: icao(form, "origem"),
      destino: icao(form, "destino"),
      escalas: escalasLista,
      horas_pernas: pernas.horas,
      combustivel_pernas: pernas.combustivel,
      horimetro_inicial: hInicial,
      horimetro_final: hFinal,
      horas_informadas: hInicial === null ? horasInformadas : null,
      combustivel_inicial_l: (pernas.combustivel[0] ?? null) || lerNumero(form.get("combustivel_inicial_l")),
      combustivel_final_l: lerNumero(form.get("combustivel_final_l")),
      pousos: Math.max(0, Math.round(lerNumero(form.get("pousos")) ?? 1)),
      natureza,
      observacao: texto(form, "observacao"),
      pendente_horimetro: form.get("pendente_horimetro") === "on",
      status: hFinal !== null || horasInformadas !== null ? "CONFIRMADO" : "RASCUNHO",
    })
    .eq("id", id);
  if (error) return { ok: false, mensagem: traduzir(error.message) };

  revalidatePath("/voos");
  revalidatePath(`/voos/${id}`);
  revalidatePath("/inicio");
  return { ok: true, mensagem: "Voo atualizado." };
}

/** Soft-delete: só admin. */
export async function apagarVoo(id: string): Promise<Resultado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || usuario?.perfil !== "admin") return { ok: false, mensagem: "Só o administrador apaga voo." };
  if (!UUID.test(id)) return { ok: false, mensagem: "Voo inválido." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("voos")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq("id", id);
  if (error) return { ok: false, mensagem: traduzir(error.message) };

  revalidatePath("/voos");
  revalidatePath("/inicio");
  redirect("/voos?apagado=1");
}
