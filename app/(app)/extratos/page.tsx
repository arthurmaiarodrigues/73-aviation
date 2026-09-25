import type { Metadata } from "next";
import Link from "next/link";

import { exigirValores } from "@/lib/perfil";
import { aeronaveAtiva, listarSocios } from "@/lib/dados/cadastros";
import { combustivelPorSocio, extratoDoSocio, saldosDosSocios } from "@/lib/dados/financeiro";
import { data as fmtData, litros as fmtLitros, mesPorExtenso, reais } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha } from "@/components/ui/tabela";

export const metadata: Metadata = { title: "Extratos" };

const ROTULO_TIPO: Record<string, string> = {
  APORTE: "Aporte",
  PAGOU: "Pagou do bolso",
  RATEIO: "Sua parte",
  FUNDO: "Fundo de reserva",
  COMBUSTÍVEL: "Combustível",
};

export default async function PaginaExtratos({ searchParams }: { searchParams: Promise<{ socio?: string }> }) {
  const busca = await searchParams;
  const usuario = await exigirValores();
  const aeronave = await aeronaveAtiva();
  const [socios, saldos] = await Promise.all([listarSocios(), saldosDosSocios()]);

  const selecionado = socios.find((s) => s.id === busca.socio) ?? socios.find((s) => s.id === usuario.socioId) ?? socios[0];
  const [extrato, combustivel] = selecionado ? await Promise.all([extratoDoSocio(selecionado.id), combustivelPorSocio()]) : [[], []];
  const combustivelDele = combustivel.filter((c) => c.socio_id === selecionado?.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Extratos</h1>
        <p className="mt-1 text-sm text-marinho-300">
          Créditos (aportes, o que pagou do bolso) − débitos (sua parte nos rateios, fundo de reserva). Saldo positivo: a sociedade deve a você. O
          combustível entra na compra do tanque, dividida pelos litros que cada um retirou.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {saldos.map((s) => (
          <Link
            key={s.socio_id}
            href={`/extratos?socio=${s.socio_id}`}
            className={cn(
              "rounded-lg border p-4 transition-colors hover:border-laranja",
              s.socio_id === selecionado?.id ? "border-laranja bg-laranja-100/40 dark:bg-marinho-700" : "border-marinho-100 bg-areia-200 dark:border-marinho-300 dark:bg-marinho-700",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: s.cor }} />
              <span className="text-sm font-semibold">{s.apelido}</span>
            </div>
            <p className={cn("mt-1 whitespace-nowrap text-xl font-semibold tabular", s.saldo < 0 ? "text-erro" : "text-ok")}>{reais(s.saldo)}</p>
            <p className="text-xs text-marinho-300 tabular">
              +{reais(s.creditos)} · −{reais(s.debitos)}
            </p>
          </Link>
        ))}
      </div>

      {selecionado && (
        <>
          {combustivelDele.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Combustível de {selecionado.apelido}</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabela>
                  <TabelaCabecalho>
                    <tr>
                      <Cabecalho>Mês</Cabecalho>
                      <Cabecalho numerico>Abasteceu</Cabecalho>
                      <Cabecalho numerico>Usou</Cabecalho>
                      <Cabecalho numerico>Saldo</Cabecalho>
                    </tr>
                  </TabelaCabecalho>
                  <TabelaCorpo>
                    {combustivelDele.map((c) => (
                      <TabelaLinha key={c.mes}>
                        <Celula>{mesPorExtenso(c.mes)}</Celula>
                        <Celula numerico>{fmtLitros(c.litros_abastecidos)}</Celula>
                        <Celula numerico>
                          {fmtLitros(c.litros_consumidos)}
                          {c.tem_estimativa && (
                            <Badge variant="atencao" className="ml-2">
                              parte estimada
                            </Badge>
                          )}
                        </Celula>
                        <Celula numerico className={cn("font-semibold", c.saldo_litros < 0 ? "text-erro" : "text-ok")}>
                          {fmtLitros(c.saldo_litros)}
                        </Celula>
                      </TabelaLinha>
                    ))}
                  </TabelaCorpo>
                </Tabela>
                <p className="mt-2 text-xs text-marinho-300">
                  Controle de litros, sem valor no extrato: o combustível é pago na compra do tanque, dividida pelos litros que cada sócio retirou desde a compra
                  anterior. Consumo sem leitura de tanque é estimado por {aeronave.consumo_medio_lh ?? "—"} L/h.
                </p>
              </CardContent>
            </Card>
          )}

          <Tabela>
            <TabelaCabecalho>
              <tr>
                <Cabecalho>Data</Cabecalho>
                <Cabecalho>Tipo</Cabecalho>
                <Cabecalho>Descrição</Cabecalho>
                <Cabecalho numerico>Crédito</Cabecalho>
                <Cabecalho numerico>Débito</Cabecalho>
              </tr>
            </TabelaCabecalho>
            <TabelaCorpo>
              {extrato.length === 0 && (
                <TabelaLinha>
                  <Celula colSpan={5} className="py-10 text-center text-marinho-300">
                    Nenhum lançamento para {selecionado.apelido}.
                  </Celula>
                </TabelaLinha>
              )}
              {extrato.map((l, i) => (
                <TabelaLinha key={`${l.origem}-${l.origem_id ?? i}-${l.tipo}`}>
                  <Celula className="whitespace-nowrap">{fmtData(l.data)}</Celula>
                  <Celula className="whitespace-nowrap text-marinho-300">{ROTULO_TIPO[l.tipo] ?? l.tipo}</Celula>
                  <Celula>
                    {l.origem === "despesas" && l.origem_id ? (
                      <Link href={`/despesas/${l.origem_id}`} className="hover:underline">
                        {l.descricao}
                      </Link>
                    ) : (
                      l.descricao
                    )}
                  </Celula>
                  <Celula numerico className="text-ok">{l.credito ? reais(l.credito) : ""}</Celula>
                  <Celula numerico className="text-erro">{l.debito ? reais(l.debito) : ""}</Celula>
                </TabelaLinha>
              ))}
            </TabelaCorpo>
          </Tabela>
        </>
      )}
    </div>
  );
}
