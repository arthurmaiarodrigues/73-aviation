import type { Metadata } from "next";
import Link from "next/link";
import { PiggyBank } from "lucide-react";

import { exigirValores } from "@/lib/perfil";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { saldoDoFundo } from "@/lib/dados/financeiro";
import { historicoDoValor, movimentosDoFundo } from "@/lib/dados/fundo";
import { data as fmtData, hoje, horas as fmtHoras, inicioDoMes, mesPorExtenso, reais } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha } from "@/components/ui/tabela";
import { BotaoApagarValor, FormularioFundo } from "./formulario-fundo";

export const metadata: Metadata = { title: "Fundo de reserva" };

/**
 * Fundo de reserva: R$ por hora voada, provisionado por sócio a cada mês.
 * Entra como débito no extrato de cada um; sai quando uma manutenção grande
 * é paga pelo fundo. Aqui: saldo, valor por hora (com histórico) e movimentos.
 */
export default async function PaginaFundo() {
  const usuario = await exigirValores();
  const aeronave = await aeronaveAtiva();
  const admin = usuario.perfil === "admin";
  const mesAtual = inicioDoMes(hoje());
  const [saldo, movimentos, historico] = await Promise.all([saldoDoFundo(aeronave.id), movimentosDoFundo(aeronave.id), historicoDoValor(aeronave.id)]);
  const entradas = movimentos.filter((m) => m.tipo === "ENTRADA").reduce((s, m) => s + m.valor, 0);
  const saidas = movimentos.filter((m) => m.tipo === "SAIDA").reduce((s, m) => s + m.valor, 0);
  const vigente = historico.find((h) => h.vigente_desde <= mesAtual) ?? null;
  const valorAtual = vigente?.valor_por_hora ?? aeronave.fundo_reserva_por_hora;

  // Entradas agrupadas por mês, uma coluna por sócio.
  const meses = [...new Set(movimentos.map((m) => m.mes))].sort().reverse();
  const socios = [...new Map(movimentos.filter((m) => m.socio).map((m) => [m.socio!, m.cor])).entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fundo de reserva</h1>
        <p className="text-sm text-marinho-300">Cada hora voada deixa um valor guardado para as revisões grandes (motor, hélice). Sai só quando uma manutenção é paga pelo fundo.</p>
        {valorAtual <= 0 && (
          <p className="mt-2 rounded-md border border-atencao bg-atencao/10 px-3 py-2 text-sm">
            Fundo zerado: nenhuma hora está sendo cobrada. Quando os sócios decidirem o valor, lance abaixo o R$/h e o mês a partir do qual vale — os meses abertos
            são recalculados na hora.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="p-4">
            <p className="text-xs uppercase tracking-wide text-marinho-300">Saldo do fundo</p>
            <CardTitle className={cn("tabular text-2xl", saldo < 0 && "text-erro")}>{reais(saldo)}</CardTitle>
            <p className="text-xs text-marinho-300">
              {reais(entradas)} provisionados · {reais(saidas)} usados
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4">
            <p className="text-xs uppercase tracking-wide text-marinho-300">Valor por hora</p>
            <CardTitle className={cn("tabular text-2xl", valorAtual <= 0 && "text-marinho-300")}>{valorAtual > 0 ? reais(valorAtual) : "a definir"}</CardTitle>
            <p className="text-xs text-marinho-300">
              {valorAtual > 0 ? (vigente ? `desde ${mesPorExtenso(vigente.vigente_desde)}` : "valor inicial da aeronave") : "nada é cobrado enquanto os sócios não decidirem"}
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4">
            <p className="text-xs uppercase tracking-wide text-marinho-300">Horas provisionadas</p>
            <CardTitle className="tabular text-2xl">{fmtHoras(movimentos.filter((m) => m.tipo === "ENTRADA").reduce((s, m) => s + (m.horas ?? 0), 0))}</CardTitle>
            <p className="text-xs text-marinho-300">todas as horas voadas, inclusive as da sociedade</p>
          </CardHeader>
        </Card>
      </div>

      {admin && (
        <Card className="border-laranja">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PiggyBank className="size-4" /> Configurar o valor por hora
            </CardTitle>
            <CardDescription>O valor pode mudar de um mês para outro; o histórico fica registrado e os meses fechados não mudam.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormularioFundo valorAtual={valorAtual} mesAtual={mesAtual} />
            {historico.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-marinho-300">Histórico</p>
                <ul className="divide-y divide-marinho-100 text-sm dark:divide-marinho-300">
                  {historico.map((h) => (
                    <li key={h.id} className="flex items-center gap-3 py-1.5">
                      <span className="tabular font-semibold">{reais(h.valor_por_hora)}/h</span>
                      <span className="text-marinho-300">a partir de {mesPorExtenso(h.vigente_desde)}</span>
                      {h.id === vigente?.id && <Badge variant="ok">vigente</Badge>}
                      <span className="ml-auto">
                        <BotaoApagarValor id={h.id} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Provisões por mês */}
      <div>
        <h2 className="mb-2 text-lg font-semibold">Provisões por mês</h2>
        <Tabela>
          <TabelaCabecalho>
            <tr>
              <Cabecalho>Mês</Cabecalho>
              <Cabecalho numerico>R$/h</Cabecalho>
              {socios.map(([apelido, cor]) => (
                <Cabecalho key={apelido} numerico>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2.5 rounded-full" style={{ background: cor ?? undefined }} /> {apelido}
                  </span>
                </Cabecalho>
              ))}
              <Cabecalho numerico>Entrada</Cabecalho>
              <Cabecalho numerico>Saída</Cabecalho>
            </tr>
          </TabelaCabecalho>
          <TabelaCorpo>
            {meses.length === 0 && (
              <TabelaLinha>
                <Celula colSpan={4 + socios.length} className="text-marinho-300">Nenhuma provisão ainda — entra com o primeiro voo.</Celula>
              </TabelaLinha>
            )}
            {meses.map((mes) => {
              const doMes = movimentos.filter((m) => m.mes === mes);
              const entrada = doMes.filter((m) => m.tipo === "ENTRADA");
              const saida = doMes.filter((m) => m.tipo === "SAIDA");
              return (
                <TabelaLinha key={mes}>
                  <Celula className="whitespace-nowrap">{mesPorExtenso(mes)}</Celula>
                  <Celula numerico>{entrada[0]?.valor_por_hora !== null && entrada[0] ? reais(entrada[0].valor_por_hora) : "—"}</Celula>
                  {socios.map(([apelido]) => {
                    const e = entrada.find((m) => m.socio === apelido);
                    return (
                      <Celula key={apelido} numerico title={e ? `${fmtHoras(e.horas)} × ${reais(e.valor_por_hora)}` : undefined}>
                        {e ? (
                          <>
                            {reais(e.valor)} <span className="text-xs text-marinho-300">({fmtHoras(e.horas)})</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </Celula>
                    );
                  })}
                  <Celula numerico className="font-semibold text-ok">{reais(entrada.reduce((s, m) => s + m.valor, 0))}</Celula>
                  <Celula numerico className={cn(saida.length > 0 && "font-semibold text-erro")}>
                    {saida.length > 0 ? (
                      <span title={saida.map((m) => m.descricao ?? "").join(" · ")}>
                        {reais(saida.reduce((s, m) => s + m.valor, 0))}
                        {saida[0]?.despesa_id && (
                          <>
                            {" "}
                            <Link href={`/despesas/${saida[0].despesa_id}`} className="text-xs text-laranja-700 hover:underline">
                              ver
                            </Link>
                          </>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Celula>
                </TabelaLinha>
              );
            })}
          </TabelaCorpo>
        </Tabela>
        <p className="mt-2 text-xs text-marinho-300">Para pagar uma manutenção com o fundo: em Manutenção, marque o item da nota como "pago pelo fundo" — a saída entra aqui sozinha.</p>
      </div>
    </div>
  );
}
