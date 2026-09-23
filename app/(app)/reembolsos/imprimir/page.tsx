import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, listarSocios } from "@/lib/dados/cadastros";
import { devidoPorSocio, listarReembolsos } from "@/lib/dados/reembolsos";
import { data as fmtData, hoje, reais } from "@/lib/formato";
import { Logo } from "@/components/logo";
import { BotaoImprimir } from "../../fechamento/formularios";

export const metadata: Metadata = { title: "Reembolsos · relatório" };

/**
 * Relatório para mandar aos sócios: o que o piloto adiantou, o que cabe a
 * cada um e o PIX para pagar. "Salvar em PDF" pelo navegador.
 */
export default async function PaginaRelatorioReembolsos() {
  const usuario = await exigirSessao();
  const aeronave = await aeronaveAtiva();
  const [reembolsos, socios] = await Promise.all([
    listarReembolsos(aeronave.id, usuario.perfil === "socio" && usuario.socioId ? { confirmados: true } : {}),
    listarSocios({ somenteAtivos: true }),
  ]);
  const confirmados = reembolsos.filter((r) => r.status !== "PENDENTE");
  const abertos = confirmados.filter((r) => r.partes.some((p) => !r.pagos.includes(p.socio_id)));
  const devido = devidoPorSocio(confirmados);
  const total = devido.reduce((s, d) => s + d.valor, 0);
  const apelido = (id: string) => socios.find((s) => s.id === id)?.apelido ?? "?";
  const pilotos = [...new Set(abertos.map((r) => r.piloto))];
  const pix = abertos.find((r) => r.pix)?.pix ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/reembolsos" className="inline-flex items-center gap-1 text-sm text-marinho-300 hover:text-laranja-700">
          <ArrowLeft className="size-4" /> Reembolsos
        </Link>
        <BotaoImprimir />
      </div>

      <header className="flex items-center justify-between border-b border-marinho-100 pb-4 dark:border-marinho-300">
        <div className="flex items-center gap-3">
          <Logo fundo="claro" className="h-10" />
          <div>
            <h1 className="text-xl font-semibold">Reembolsos ao piloto</h1>
            <p className="text-sm text-marinho-300">
              {aeronave.matricula} · {aeronave.modelo}
            </p>
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="text-marinho-300">emitido em {fmtData(hoje())}</p>
          <p className="font-semibold">{pilotos.join(" · ") || "—"}</p>
          {pix && <p className="text-marinho-300">PIX {pix}</p>}
        </div>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Quanto cada sócio deve</h2>
        <table className="w-full text-sm">
          <thead className="border-b border-marinho-100 text-left text-xs uppercase tracking-wide text-marinho-300 dark:border-marinho-300">
            <tr>
              <th className="py-2">Sócio</th>
              <th className="py-2 text-right">Lançamentos</th>
              <th className="py-2 text-right">A pagar</th>
            </tr>
          </thead>
          <tbody>
            {devido.length === 0 && (
              <tr>
                <td colSpan={3} className="py-3 text-marinho-300">
                  Nada pendente.
                </td>
              </tr>
            )}
            {devido.map((d) => (
              <tr key={d.socio_id} className="border-b border-marinho-100/60 dark:border-marinho-300/60">
                <td className="py-2 font-semibold">{apelido(d.socio_id)}</td>
                <td className="tabular py-2 text-right">{d.itens}</td>
                <td className="tabular py-2 text-right font-semibold">{reais(d.valor)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="py-2 font-semibold">Total</td>
              <td />
              <td className="tabular py-2 text-right font-semibold">{reais(total)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">O que o piloto adiantou</h2>
        <table className="w-full text-xs">
          <thead className="border-b border-marinho-100 text-left uppercase tracking-wide text-marinho-300 dark:border-marinho-300">
            <tr>
              <th className="py-2">Data</th>
              <th className="py-2">O que</th>
              <th className="py-2">Cidade</th>
              <th className="py-2">Divisão</th>
              <th className="py-2 text-right">Valor</th>
              {socios.map((s) => (
                <th key={s.id} className="py-2 text-right">
                  {s.apelido}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {abertos.length === 0 && (
              <tr>
                <td colSpan={5 + socios.length} className="py-3 text-marinho-300">
                  Nenhum reembolso em aberto.
                </td>
              </tr>
            )}
            {abertos.map((r) => (
              <tr key={r.id} className="border-b border-marinho-100/60 dark:border-marinho-300/60">
                <td className="whitespace-nowrap py-1.5">{fmtData(r.data)}</td>
                <td className="py-1.5">{r.descricao.replace(/^REEMBOLSO PILOTO: /, "")}</td>
                <td className="py-1.5">{r.cidade ?? "—"}</td>
                <td className="py-1.5 text-marinho-300">
                  {r.criterio === "DIRETO" ? `só ${r.socio}` : r.criterio === "POR_HORAS" ? "pelas horas" : "partes iguais"}
                </td>
                <td className="tabular py-1.5 text-right">{reais(r.valor)}</td>
                {socios.map((s) => {
                  const parte = r.partes.find((p) => p.socio_id === s.id);
                  const pago = r.pagos.includes(s.id);
                  return (
                    <td key={s.id} className={`tabular py-1.5 text-right ${pago ? "text-marinho-300 line-through" : ""}`}>
                      {parte ? reais(parte.valor) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-marinho-100 dark:border-marinho-300">
              <td className="py-2 font-semibold" colSpan={4}>
                Total em aberto
              </td>
              <td className="tabular py-2 text-right font-semibold">{reais(abertos.reduce((s, r) => s + r.valor, 0))}</td>
              {socios.map((s) => (
                <td key={s.id} className="tabular py-2 text-right font-semibold">
                  {reais(devido.find((d) => d.socio_id === s.id)?.valor ?? 0)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-xs text-marinho-300">Valor riscado = parte já paga ao piloto.</p>
      </section>
    </div>
  );
}
