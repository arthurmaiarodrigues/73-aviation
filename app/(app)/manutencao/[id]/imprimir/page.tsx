import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { exigirValores } from "@/lib/perfil";
import { aeronaveAtiva, listarSocios } from "@/lib/dados/cadastros";
import { buscarManutencao } from "@/lib/dados/manutencao";
import { despesasDaManutencao } from "@/lib/dados/financeiro";
import { ROTULO_TIPO_CUSTO } from "@/lib/manutencao-constantes";
import { data as fmtData, hoje, horas as fmtHoras, reais } from "@/lib/formato";
import { Logo } from "@/components/logo";
import { BotaoImprimir } from "../../../fechamento/formularios";

export const metadata: Metadata = { title: "Nota da oficina · relatório" };

/**
 * Relatório da nota da oficina para mandar aos sócios: cada item da nota com
 * o que cabe a cada um, e o período de horas usado nos itens por uso.
 * "Salvar em PDF" pelo navegador.
 */
export default async function PaginaRelatorioManutencao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirValores();
  const m = await buscarManutencao(id);
  if (!m) notFound();
  const [aeronave, socios, despesas] = await Promise.all([aeronaveAtiva(), listarSocios({ somenteAtivos: true }), despesasDaManutencao(id)]);

  const porDespesa = new Map(despesas.map((d) => [d.id, d]));
  const apelidos = socios.map((s) => s.apelido);
  const parte = (despesaId: string | null, apelido: string) =>
    despesaId ? (porDespesa.get(despesaId)?.rateios.find((r) => r.apelido === apelido)?.valor ?? 0) : 0;

  const totalPorSocio = Object.fromEntries(
    apelidos.map((a) => [a, m.itens.reduce((s, i) => s + parte(i.despesa_id, a), 0)]),
  ) as Record<string, number>;
  const total = m.itens.reduce((s, i) => s + i.valor, 0);

  // Período e horas dos itens por uso (todos usam o mesmo ciclo).
  const porUso = m.itens.map((i) => porDespesa.get(i.despesa_id ?? "")).find((d) => d?.criterio === "POR_HORAS") ?? null;
  const horasDoCiclo = porUso ? porUso.rateios.map((r) => ({ apelido: r.apelido, horas: r.horas_base ?? 0, percentual: r.percentual })) : [];
  const horasTotal = horasDoCiclo.reduce((s, h) => s + h.horas, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/manutencao/${m.id}`} className="inline-flex items-center gap-1 text-sm text-marinho-300 hover:text-laranja-700">
          <ArrowLeft className="size-4" /> Manutenção
        </Link>
        <BotaoImprimir />
      </div>

      <header className="flex items-center justify-between border-b border-marinho-100 pb-4 dark:border-marinho-300">
        <div className="flex items-center gap-3">
          <Logo fundo="claro" className="h-10" />
          <div>
            <h1 className="text-xl font-semibold">{m.descricao}</h1>
            <p className="text-sm text-marinho-300">
              {aeronave.matricula} · {aeronave.modelo}
            </p>
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="text-marinho-300">emitido em {fmtData(hoje())}</p>
          <p className="font-semibold">
            {fmtData(m.data_inicio)}
            {m.data_fim ? ` → ${fmtData(m.data_fim)}` : ""}
          </p>
          <p className="text-marinho-300">
            {m.fornecedor ?? "oficina não informada"} · pago por {m.pagador}
          </p>
        </div>
      </header>

      {horasDoCiclo.length > 0 && (
        <section className="rounded border border-marinho-100 p-3 text-sm dark:border-marinho-300">
          <p className="font-semibold">
            Itens por uso: horas voadas de {porUso?.periodo_inicio ? fmtData(porUso.periodo_inicio) : "—"} a{" "}
            {porUso?.periodo_fim ? fmtData(porUso.periodo_fim) : "—"} — {fmtHoras(horasTotal)} no total
          </p>
          <p className="mt-1 text-marinho-300">
            {horasDoCiclo.map((h) => `${h.apelido} ${fmtHoras(h.horas)} (${h.percentual.toFixed(1).replace(".", ",")} %)`).join(" · ")}
          </p>
        </section>
      )}

      <section>
        <table className="w-full text-sm">
          <thead className="border-b border-marinho text-left text-xs uppercase tracking-wide text-marinho-300">
            <tr>
              <th className="py-2">Item da nota</th>
              <th className="py-2">Divide</th>
              <th className="py-2 text-right">Valor</th>
              {apelidos.map((a) => (
                <th key={a} className="py-2 text-right">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.itens.length === 0 && (
              <tr>
                <td colSpan={3 + apelidos.length} className="py-6 text-center text-marinho-300">
                  Nenhum item lançado.
                </td>
              </tr>
            )}
            {m.itens.map((i) => (
              <tr key={i.id} className="border-b border-marinho-100 dark:border-marinho-300">
                <td className="py-1.5">
                  {i.descricao}
                  {i.plano_item && <span className="text-marinho-300"> · {i.plano_item}</span>}
                </td>
                <td className="py-1.5 text-marinho-300">{i.pago_pelo_fundo ? "fundo de reserva" : ROTULO_TIPO_CUSTO[i.tipo_custo]}</td>
                <td className="tabular py-1.5 text-right">{reais(i.valor)}</td>
                {apelidos.map((a) => (
                  <td key={a} className="tabular py-1.5 text-right">
                    {reais(parte(i.despesa_id, a))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-marinho font-semibold">
              <td className="py-2">Total da nota</td>
              <td />
              <td className="tabular py-2 text-right">{reais(total)}</td>
              {apelidos.map((a) => (
                <td key={a} className="tabular py-2 text-right">
                  {reais(totalPorSocio[a] ?? 0)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </section>

      <footer className="border-t border-marinho-100 pt-3 text-xs text-marinho-300 dark:border-marinho-300">
        <p>
          Peça e serviço que gastam com hora voada dividem pelas horas de cada sócio no período acima; o que vale por tempo (aferição, certificação, inspeção anual)
          divide em partes iguais.
        </p>
        <p className="mt-1">
          {m.pagador === "CAIXA"
            ? "A nota foi paga pelo caixa da sociedade."
            : `A nota foi paga por ${m.pagador}: o valor inteiro entrou como crédito no extrato dele e a parte de cada um como débito.`}
        </p>
      </footer>
    </div>
  );
}
