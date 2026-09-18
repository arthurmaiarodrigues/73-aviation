import type { Metadata } from "next";
import Link from "next/link";
import { Landmark } from "lucide-react";

import { exigirValores } from "@/lib/perfil";
import { aeronaveAtiva, listarCategorias, listarSocios } from "@/lib/dados/cadastros";
import { listarExtrato, resumoConciliacao, semExtrato, sugestoesPara } from "@/lib/dados/conciliacao";
import { saldoDoCaixa } from "@/lib/dados/financeiro";
import { data as fmtData, mesPorExtenso, reais } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha } from "@/components/ui/tabela";
import { AcoesLinha, BotaoDesfazer, FormularioImportar } from "./componentes";

export const metadata: Metadata = { title: "Conciliação" };

export default async function PaginaConciliacao({ searchParams }: { searchParams: Promise<{ ver?: string; mes?: string }> }) {
  const busca = await searchParams;
  const usuario = await exigirValores();
  const aeronave = await aeronaveAtiva();
  const admin = usuario.perfil === "admin";
  const ver = busca.ver === "todas" ? undefined : busca.ver === "conciliadas" ? "CONCILIADO" : busca.ver === "ignoradas" ? "IGNORADO" : "PENDENTE";

  const [linhas, resumo, caixa, categorias, socios, avulsos] = await Promise.all([
    listarExtrato(aeronave.id, { status: ver, mes: busca.mes }),
    resumoConciliacao(aeronave.id),
    saldoDoCaixa(),
    listarCategorias(),
    listarSocios({ somenteAtivos: true }),
    semExtrato(aeronave.id),
  ]);
  const pendentes = linhas.filter((l) => l.status === "PENDENTE");
  const sugestoes = admin ? await sugestoesPara(pendentes) : {};
  const totalPendentes = resumo.reduce((s, r) => s + r.pendentes, 0);
  const saldoExtrato = resumo.reduce((s, r) => s + r.entradas - r.saidas, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Landmark className="size-6" /> Conciliação bancária
        </h1>
        <p className="mt-1 text-sm text-marinho-300">Cada linha do extrato casa com uma despesa paga pelo caixa ou um aporte. O que sobrar vira despesa nova, aporte novo ou é ignorado (tarifa).</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="p-4">
            <p className="text-xs uppercase tracking-wide text-marinho-300">Pendentes</p>
            <CardTitle className={cn("text-xl", totalPendentes > 0 ? "text-atencao" : "text-ok")}>{totalPendentes}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4">
            <p className="text-xs uppercase tracking-wide text-marinho-300">Movimento importado</p>
            <CardTitle className="tabular text-xl">{reais(saldoExtrato)}</CardTitle>
            <p className="text-xs text-marinho-300">entradas − saídas do extrato</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4">
            <p className="text-xs uppercase tracking-wide text-marinho-300">Caixa no app</p>
            <CardTitle className="tabular text-xl">{reais(caixa.saldo)}</CardTitle>
            <p className="text-xs text-marinho-300">aportes − despesas do caixa</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4">
            <p className="text-xs uppercase tracking-wide text-marinho-300">Sem linha no extrato</p>
            <CardTitle className="text-xl">
              {avulsos.despesas.length + avulsos.aportes.length}
            </CardTitle>
            <p className="text-xs text-marinho-300">
              {avulsos.despesas.length} despesa(s) do caixa · {avulsos.aportes.length} aporte(s)
            </p>
          </CardHeader>
        </Card>
      </div>

      {admin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Importar extrato</CardTitle>
            <CardDescription>OFX é o formato mais seguro (cada lançamento tem identificador). CSV também funciona.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioImportar />
          </CardContent>
        </Card>
      )}

      {resumo.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {resumo.map((r) => (
            <Link key={r.mes} href={`/conciliacao?mes=${r.mes.slice(0, 7)}&ver=todas`} className={cn("rounded border px-2 py-1 hover:border-laranja", busca.mes === r.mes.slice(0, 7) ? "border-laranja" : "border-marinho-100 dark:border-marinho-300")}>
              {mesPorExtenso(r.mes)}: {r.conciliadas}/{r.linhas}
              {r.pendentes > 0 && <span className="text-atencao"> · {r.pendentes} pend.</span>}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {[
          ["pendentes", "Pendentes"],
          ["conciliadas", "Conciliadas"],
          ["ignoradas", "Ignoradas"],
          ["todas", "Todas"],
        ].map(([v, r]) => (
          <Link key={v} href={`/conciliacao?ver=${v}${busca.mes ? `&mes=${busca.mes}` : ""}`} className={cn("rounded px-3 py-1", (busca.ver ?? "pendentes") === v ? "bg-laranja text-marinho" : "hover:bg-areia-200 dark:hover:bg-marinho-700")}>
            {r}
          </Link>
        ))}
      </div>

      <Tabela>
        <TabelaCabecalho>
          <tr>
            <Cabecalho>Data</Cabecalho>
            <Cabecalho>Extrato</Cabecalho>
            <Cabecalho numerico>Valor</Cabecalho>
            <Cabecalho>Situação</Cabecalho>
          </tr>
        </TabelaCabecalho>
        <TabelaCorpo>
          {linhas.length === 0 && (
            <TabelaLinha>
              <Celula colSpan={4} className="py-10 text-center text-marinho-300">
                {resumo.length === 0 ? "Nenhum extrato importado ainda." : "Nada aqui."}
              </Celula>
            </TabelaLinha>
          )}
          {linhas.map((l) => (
            <TabelaLinha key={l.id}>
              <Celula className="whitespace-nowrap align-top">{fmtData(l.data)}</Celula>
              <Celula className="align-top">
                <p>{l.descricao ?? "—"}</p>
                {l.referencia && <p className="text-xs text-marinho-300">doc. {l.referencia}</p>}
                {l.status === "PENDENTE" && admin && (
                  <div className="mt-2">
                    <AcoesLinha linhaId={l.id} valor={l.valor} descricao={l.descricao} sugestoes={sugestoes[l.id] ?? []} despesas={avulsos.despesas} aportes={avulsos.aportes} categorias={categorias} socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))} />
                  </div>
                )}
              </Celula>
              <Celula numerico className={cn("align-top font-semibold", l.valor < 0 ? "text-erro" : "text-ok")}>
                {reais(l.valor)}
              </Celula>
              <Celula className="align-top">
                {l.status === "PENDENTE" && <Badge variant="atencao">pendente</Badge>}
                {l.status === "CONCILIADO" && (
                  <div className="space-y-1">
                    <Badge variant="ok">conciliado</Badge>
                    <p className="text-xs">
                      {l.despesa_id ? (
                        <Link href={`/despesas/${l.despesa_id}`} className="text-laranja-700 hover:underline">
                          {l.casado}
                        </Link>
                      ) : (
                        l.casado
                      )}
                    </p>
                    {admin && <BotaoDesfazer linhaId={l.id} />}
                  </div>
                )}
                {l.status === "IGNORADO" && (
                  <div className="space-y-1">
                    <Badge variant="neutro">ignorado</Badge>
                    <p className="text-xs text-marinho-300">{l.motivo_ignorar}</p>
                    {admin && <BotaoDesfazer linhaId={l.id} />}
                  </div>
                )}
              </Celula>
            </TabelaLinha>
          ))}
        </TabelaCorpo>
      </Tabela>
    </div>
  );
}
