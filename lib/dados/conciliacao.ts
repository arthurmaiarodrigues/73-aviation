import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

export type LinhaExtrato = {
  id: string;
  banco: string;
  conta: string;
  data: string;
  valor: number;
  descricao: string | null;
  referencia: string | null;
  status: "PENDENTE" | "CONCILIADO" | "IGNORADO";
  despesa_id: string | null;
  aporte_id: string | null;
  motivo_ignorar: string | null;
  conciliado_em: string | null;
  casado: string | null;
};

export type Sugestao = { tipo: "DESPESA" | "APORTE"; id: string; data: string; descricao: string; valor: number; quem: string; dias: number };

export type ResumoConciliacao = { mes: string; linhas: number; pendentes: number; conciliadas: number; ignoradas: number; entradas: number; saidas: number };

const n = (v: unknown) => Number(v ?? 0);

export async function listarExtrato(aeronaveId: string, opcoes: { status?: string; mes?: string } = {}): Promise<LinhaExtrato[]> {
  const supabase = await criarClienteServidor();
  let q = supabase
    .from("extrato_banco")
    .select("id, banco, conta, data, valor, descricao, referencia, status, despesa_id, aporte_id, motivo_ignorar, conciliado_em, despesas ( descricao ), aportes ( descricao, socios ( apelido ) )")
    .eq("aeronave_id", aeronaveId)
    .order("data", { ascending: false })
    .order("valor")
    .limit(500);
  if (opcoes.status) q = q.eq("status", opcoes.status);
  if (opcoes.mes) {
    const fim = new Date(`${opcoes.mes.slice(0, 7)}-01T00:00:00Z`);
    fim.setUTCMonth(fim.getUTCMonth() + 1);
    q = q.gte("data", `${opcoes.mes.slice(0, 7)}-01`).lt("data", fim.toISOString().slice(0, 10));
  }
  const { data, error } = await q;
  if (error) throw new Error(`Extrato: ${error.message}`);
  return (data ?? []).map((l) => {
    const d = l.despesas as unknown as { descricao: string } | null;
    const a = l.aportes as unknown as { descricao: string | null; socios: { apelido: string } | null } | null;
    return {
      id: l.id,
      banco: l.banco,
      conta: l.conta,
      data: l.data,
      valor: n(l.valor),
      descricao: l.descricao,
      referencia: l.referencia,
      status: l.status,
      despesa_id: l.despesa_id,
      aporte_id: l.aporte_id,
      motivo_ignorar: l.motivo_ignorar,
      conciliado_em: l.conciliado_em,
      casado: d ? `DESPESA · ${d.descricao}` : a ? `APORTE ${a.socios?.apelido ?? ""}${a.descricao ? ` · ${a.descricao}` : ""}` : null,
    };
  });
}

/** Sugestões de todas as pendentes de uma vez (uma consulta por linha, mas poucas linhas). */
export async function sugestoesPara(linhas: LinhaExtrato[]): Promise<Record<string, Sugestao[]>> {
  const supabase = await criarClienteServidor();
  const saida: Record<string, Sugestao[]> = {};
  await Promise.all(
    linhas.map(async (l) => {
      const { data } = await supabase.rpc("sugestoes_extrato", { p_linha: l.id });
      saida[l.id] = ((data ?? []) as Record<string, unknown>[]).map((s) => ({
        tipo: s.tipo as Sugestao["tipo"],
        id: String(s.id),
        data: String(s.data),
        descricao: String(s.descricao),
        valor: n(s.valor),
        quem: String(s.quem),
        dias: n(s.dias),
      }));
    }),
  );
  return saida;
}

export async function resumoConciliacao(aeronaveId: string): Promise<ResumoConciliacao[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("v_conciliacao_mes").select("*").eq("aeronave_id", aeronaveId).order("mes", { ascending: false });
  if (error) throw new Error(`Conciliação: ${error.message}`);
  return (data ?? []).map((r) => ({ mes: r.mes, linhas: n(r.linhas), pendentes: n(r.pendentes), conciliadas: n(r.conciliadas), ignoradas: n(r.ignoradas), entradas: n(r.entradas), saidas: n(r.saidas) }));
}

/** Despesas do caixa e aportes ainda sem linha do extrato (para o casamento manual). */
export async function semExtrato(aeronaveId: string): Promise<{ despesas: { id: string; data: string; descricao: string; valor: number }[]; aportes: { id: string; data: string; descricao: string; valor: number }[] }> {
  const supabase = await criarClienteServidor();
  const [{ data: ex }, { data: ds }, { data: as }] = await Promise.all([
    supabase.from("extrato_banco").select("despesa_id, aporte_id").eq("aeronave_id", aeronaveId).eq("status", "CONCILIADO"),
    supabase.from("despesas").select("id, data, descricao, valor").eq("aeronave_id", aeronaveId).is("deleted_at", null).is("pagador_socio_id", null).order("data", { ascending: false }).limit(200),
    supabase.from("aportes").select("id, data, descricao, valor, socios ( apelido )").is("deleted_at", null).order("data", { ascending: false }).limit(200),
  ]);
  const usadasD = new Set((ex ?? []).map((e) => e.despesa_id).filter(Boolean));
  const usadasA = new Set((ex ?? []).map((e) => e.aporte_id).filter(Boolean));
  return {
    despesas: (ds ?? []).filter((d) => !usadasD.has(d.id)).map((d) => ({ id: d.id, data: d.data, descricao: d.descricao, valor: n(d.valor) })),
    aportes: (as ?? [])
      .filter((a) => !usadasA.has(a.id))
      .map((a) => ({ id: a.id, data: a.data, descricao: `APORTE ${(a.socios as unknown as { apelido: string } | null)?.apelido ?? ""}${a.descricao ? ` · ${a.descricao}` : ""}`, valor: n(a.valor) })),
  };
}
