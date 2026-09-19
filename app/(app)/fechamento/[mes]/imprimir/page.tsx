import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { exigirValores } from "@/lib/perfil";
import { aeronaveAtiva, listarSocios } from "@/lib/dados/cadastros";
import { acertoSugerido, linhasDoPeriodo, mesesEntre, resumoDoPeriodo } from "@/lib/dados/fechamento";
import { data as fmtData, horas as fmtHoras, horimetro as fmtHorimetro, litros as fmtLitros, mesPorExtenso, reais } from "@/lib/formato";
import { Logo } from "@/components/logo";
import { BotaoImprimir } from "../../formularios";

export const metadata: Metadata = { title: "Fechamento · PDF" };

/**
 * Página de impressão: "Salvar em PDF" do navegador. Sem biblioteca de PDF
 * (o CSS de impressão em globals.css esconde barra e cabeçalho). Uma linha
 * por voo, despesa e aporte, com a coluna de cada sócio — o formato que a
 * sociedade lê.
 */
export default async function PaginaImprimir({ params, searchParams }: { params: Promise<{ mes: string }>; searchParams: Promise<{ ate?: string }> }) {
  const { mes: mesParam } = await params;
  const busca = await searchParams;
  if (!/^\d{4}-\d{2}$/.test(mesParam)) notFound();
  const mes = `${mesParam}-01`;
  const ate = /^\d{4}-\d{2}$/.test(busca.ate ?? "") && `${busca.ate}-01` > mes ? `${busca.ate}-01` : mes;
  const meses = mesesEntre(mes, ate);
  const periodo = meses.length > 1;
  await exigirValores();
  const aeronave = await aeronaveAtiva();

  const [{ resumo, fechamentos }, linhas, socios] = await Promise.all([resumoDoPeriodo(aeronave.id, meses), linhasDoPeriodo(aeronave.id, meses), listarSocios()]);
  const fechamento = fechamentos[fechamentos.length - 1];
  const fechado = fechamentos.every((f) => f?.status === "FECHADO");
  const titulo = periodo ? `${mesPorExtenso(mes)} a ${mesPorExtenso(ate)}` : mesPorExtenso(mes);
  const acerto = acertoSugerido(resumo);
  const apelidos = socios.filter((s) => resumo.some((r) => r.socio_id === s.id)).map((s) => s.apelido);

  const totalHoras = linhas.filter((l) => l.tipo === "VOO").reduce((s, l) => s + (l.horas ?? 0), 0);
  const totalDespesas = linhas.filter((l) => l.tipo === "DESPESA").reduce((s, l) => s + (l.valor ?? 0), 0);
  const totalAportes = linhas.filter((l) => l.tipo === "APORTE").reduce((s, l) => s + (l.valor ?? 0), 0);
  const porSocio = (l: (typeof linhas)[number], a: string) => l.por_socio?.[a];

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/fechamento?mes=${mesParam}${periodo ? `&ate=${ate.slice(0, 7)}` : ""}`} className="inline-flex items-center gap-1 text-sm text-marinho-300 hover:text-laranja-700">
          <ArrowLeft className="size-4" /> Fechamento
        </Link>
        <BotaoImprimir />
      </div>

      <header className="flex items-start justify-between border-b border-marinho-100 pb-4">
        <div>
          <Logo fundo="claro" />
          <h1 className="mt-3 text-xl font-semibold">Fechamento · {titulo}</h1>
          <p className="text-marinho-300">
            {aeronave.matricula} · {aeronave.modelo}
            {fechamento?.horimetro_final !== null && fechado ? ` · horímetro no fim do período ${fmtHorimetro(fechamento?.horimetro_final)}` : ""}
          </p>
        </div>
        <div className="text-right text-xs text-marinho-300">
          {fechado ? (
            <>
              <p className="font-semibold text-ok">{periodo ? "PERÍODO FECHADO" : "MÊS FECHADO"}</p>
              <p>
                {fechamento?.fechado_em ? new Date(fechamento.fechado_em).toLocaleString("pt-BR", { timeZone: "America/Bahia" }) : ""}
                {fechamento?.fechado_por_nome ? ` · ${fechamento.fechado_por_nome}` : ""}
              </p>
            </>
          ) : (
            <p className="font-semibold text-atencao">PRÉVIA — {periodo ? "PERÍODO" : "MÊS"} AINDA ABERTO</p>
          )}
          <p>emitido em {new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" })}</p>
        </div>
      </header>

      {/* Linhas do mês */}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-marinho bg-areia-200">
            <th className="px-2 py-1.5 text-left">Data</th>
            <th className="px-2 py-1.5 text-left">Lançamento</th>
            <th className="px-2 py-1.5 text-left">Trecho / categoria</th>
            <th className="px-2 py-1.5 text-left">Pagou</th>
            <th className="px-2 py-1.5 text-right">Horas</th>
            <th className="px-2 py-1.5 text-right">Valor</th>
            {apelidos.map((a) => (
              <th key={a} className="px-2 py-1.5 text-right">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-marinho-100">
              <td className="whitespace-nowrap px-2 py-1">{fmtData(l.data)}</td>
              <td className="px-2 py-1">
                {l.tipo === "VOO" ? "✈ " : l.tipo === "APORTE" ? "＋ " : ""}
                {l.descricao}
                {l.criterio && l.criterio !== "IGUAL" && <span className="text-marinho-300"> · {l.criterio.toLowerCase().replace("_", " ")}</span>}
              </td>
              <td className="px-2 py-1 text-marinho-300">{l.trecho ?? ""}</td>
              <td className="px-2 py-1">{l.pagador ?? ""}</td>
              <td className="tabular whitespace-nowrap px-2 py-1 text-right">{l.horas !== null ? fmtHoras(l.horas) : ""}</td>
              <td className="tabular whitespace-nowrap px-2 py-1 text-right">{l.valor !== null ? reais(l.valor) : ""}</td>
              {apelidos.map((a) => {
                const v = porSocio(l, a);
                return (
                  <td key={a} className="tabular whitespace-nowrap px-2 py-1 text-right">
                    {v === undefined ? "" : l.tipo === "VOO" ? fmtHoras(v) : reais(v)}
                  </td>
                );
              })}
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={6 + apelidos.length} className="py-6 text-center text-marinho-300">
                Nenhum lançamento no mês.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-marinho font-semibold">
            <td className="px-2 py-1.5" colSpan={4}>
              Totais · {fmtHoras(totalHoras)} voadas · despesas {reais(totalDespesas)} · aportes {reais(totalAportes)}
            </td>
            <td className="tabular whitespace-nowrap px-2 py-1.5 text-right">{fmtHoras(totalHoras)}</td>
            <td className="tabular whitespace-nowrap px-2 py-1.5 text-right">{reais(totalDespesas)}</td>
            {apelidos.map((a) => {
              const r = resumo.find((s) => s.apelido === a);
              return (
                <td key={a} className="tabular whitespace-nowrap px-2 py-1.5 text-right">
                  {r ? reais(r.rateado) : ""}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>

      {/* Resumo por sócio */}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-marinho bg-areia-200">
            <th className="px-2 py-1.5 text-left">Resumo por sócio</th>
            {apelidos.map((a) => (
              <th key={a} className="px-2 py-1.5 text-right">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(
            [
              ["Horas voadas (uso comum já dividido)", (s) => fmtHoras(s.horas)],
              ["% de uso no mês", (s) => (totalHoras > 0 ? `${((s.horas / totalHoras) * 100).toFixed(1).replace(".", ",")} %` : "—")],
              ["Parte nos rateios", (s) => reais(s.rateado)],
              ["Fundo de reserva", (s) => reais(s.fundo)],
              ["Combustível (abastecido − usado)", (s) => `${fmtLitros(s.saldo_litros)} = ${reais(s.combustivel_valor)}`],
              ["Créditos (aportes, pagou do bolso, combustível)", (s) => reais(s.creditos)],
              ["Débitos (rateios, fundo, combustível)", (s) => reais(s.debitos)],
              ["Saldo do mês", (s) => reais(s.saldo_mes)],
              ["Saldo acumulado com a sociedade", (s) => reais(s.saldo_acumulado)],
            ] as [string, (s: (typeof resumo)[number]) => string][]
          ).map(([rotulo, f], i) => (
            <tr key={rotulo} className={i >= 7 ? "border-t border-marinho font-semibold" : "border-b border-marinho-100"}>
              <td className="px-2 py-1">{rotulo}</td>
              {apelidos.map((a) => {
                const s = resumo.find((r) => r.apelido === a);
                return (
                  <td key={a} className="tabular whitespace-nowrap px-2 py-1 text-right">
                    {s ? f(s) : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Acerto */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="mb-1 font-semibold">Acerto sugerido</h2>
          {acerto.transferencias.length === 0 ? (
            <p className="text-marinho-300">Saldos zerados.</p>
          ) : (
            <ul className="text-xs">
              {acerto.transferencias.map((t, i) => (
                <li key={i} className="flex justify-between border-b border-marinho-100 py-1">
                  <span>
                    {t.de} → {t.para}
                  </span>
                  <span className="tabular font-semibold">{reais(t.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="text-xs text-marinho-300">
          <p>Saldo positivo: a sociedade deve ao sócio. Negativo: o sócio deve à sociedade.</p>
          <p className="mt-1">Uso comum (translado, teste, piloto de fora) dividido em partes iguais. Combustível pelo preço médio dos abastecimentos do mês; sem leitura de tanque, consumo estimado por {aeronave.consumo_medio_lh ?? "—"} L/h.</p>
          <p className="mt-1">Fundo de reserva: {reais(aeronave.fundo_reserva_por_hora)} por hora voada.</p>
          {fechamento?.observacao && <p className="mt-1">Observação: {fechamento.observacao}</p>}
        </div>
      </div>
    </div>
  );
}
