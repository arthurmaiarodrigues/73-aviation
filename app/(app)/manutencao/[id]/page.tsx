import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, listarFornecedores, listarSocios } from "@/lib/dados/cadastros";
import { buscarVoo, listarVoos } from "@/lib/dados/voos";
import { ROTULO_STATUS, ROTULO_TIPO_CUSTO, buscarManutencao, listarPlano } from "@/lib/dados/manutencao";
import { data as fmtData, hoje, horas as fmtHoras, horimetro as fmtHorimetro, reais } from "@/lib/formato";
import { veValores } from "@/lib/tipos";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha, TabelaRodape } from "@/components/ui/tabela";
import { BotaoAcao, BotaoApagarManutencao, FormularioConcluir, FormularioItemManutencao, FormularioManutencao, apagarItemManutencaoAcao } from "../componentes";

export const metadata: Metadata = { title: "Manutenção" };

export default async function PaginaManutencaoFicha({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvo?: string }> }) {
  const [{ id }, busca] = await Promise.all([params, searchParams]);
  const usuario = await exigirSessao();
  const m = await buscarManutencao(id);
  if (!m) notFound();
  const aeronave = await aeronaveAtiva();
  const admin = usuario.perfil === "admin";
  const valores = veValores(usuario.perfil);

  const [plano, fornecedores, socios, voos, translado, teste] = await Promise.all([
    listarPlano(aeronave.id),
    listarFornecedores(),
    listarSocios({ somenteAtivos: true }),
    listarVoos(aeronave.id, {}, 40),
    m.voo_translado_id ? buscarVoo(m.voo_translado_id) : null,
    m.voo_teste_id ? buscarVoo(m.voo_teste_id) : null,
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/manutencao" className="inline-flex items-center gap-1 text-sm text-marinho-300 hover:text-laranja-700">
          <ArrowLeft className="size-4" /> Manutenção
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{m.descricao}</h1>
          <Badge variant={m.status === "CONCLUIDA" ? "ok" : m.status === "EM_OFICINA" ? "atencao" : "info"}>{ROTULO_STATUS[m.status]}</Badge>
        </div>
        <p className="mt-1 text-sm text-marinho-300">
          {fmtData(m.data_inicio)}
          {m.data_fim ? ` → ${fmtData(m.data_fim)}` : ""}
          {m.fornecedor ? ` · ${m.fornecedor}` : ""} · horímetro {fmtHorimetro(m.horimetro)} · pago por {m.pagador}
        </p>
      </div>

      {busca.salvo && <Alerta tom="ok">Manutenção programada. O avião ficou bloqueado na agenda no período.</Alerta>}

      {(translado || teste) && (
        <p className="text-sm text-marinho-300">
          {translado && (
            <>
              Translado: <Link href={`/voos/${translado.id}`} className="text-laranja-700 hover:underline">{fmtData(translado.data)} {translado.origem} → {translado.destino} ({fmtHoras(translado.horas)})</Link>
            </>
          )}
          {translado && teste && " · "}
          {teste && (
            <>
              Teste/volta: <Link href={`/voos/${teste.id}`} className="text-laranja-700 hover:underline">{fmtData(teste.data)} {teste.origem} → {teste.destino} ({fmtHoras(teste.horas)})</Link>
            </>
          )}
        </p>
      )}

      {valores && (
        <Card>
          <CardHeader className="flex-row items-baseline justify-between">
            <CardTitle>Nota da oficina · {reais(m.total)}</CardTitle>
            <span className="text-sm text-marinho-300">{m.itens.length} item{m.itens.length === 1 ? "" : "ns"}</span>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabela>
              <TabelaCabecalho>
                <tr>
                  <Cabecalho>Item</Cabecalho>
                  <Cabecalho>Do plano</Cabecalho>
                  <Cabecalho>Divide</Cabecalho>
                  <Cabecalho numerico>Valor</Cabecalho>
                  <Cabecalho></Cabecalho>
                </tr>
              </TabelaCabecalho>
              <TabelaCorpo>
                {m.itens.length === 0 && (
                  <TabelaLinha>
                    <Celula colSpan={5} className="py-6 text-center text-marinho-300">
                      Nenhum item lançado ainda.
                    </Celula>
                  </TabelaLinha>
                )}
                {m.itens.map((i) => (
                  <TabelaLinha key={i.id}>
                    <Celula>{i.descricao}</Celula>
                    <Celula className="text-marinho-300">{i.plano_item ?? "—"}</Celula>
                    <Celula className="whitespace-nowrap">
                      {i.pago_pelo_fundo ? <Badge variant="info">fundo de reserva</Badge> : ROTULO_TIPO_CUSTO[i.tipo_custo]}
                    </Celula>
                    <Celula numerico className="font-semibold">{reais(i.valor)}</Celula>
                    <Celula className="whitespace-nowrap text-right">
                      {i.despesa_id && (
                        <Link href={`/despesas/${i.despesa_id}`} className="mr-3 text-xs text-laranja-700 hover:underline">
                          rateio
                        </Link>
                      )}
                      {admin && <BotaoAcao acao={apagarItemManutencaoAcao(i.id, m.id)} rotulo="Remover" confirmar="Remover o item e a despesa dele?" />}
                    </Celula>
                  </TabelaLinha>
                ))}
              </TabelaCorpo>
              {m.itens.length > 0 && (
                <TabelaRodape>
                  <tr>
                    <Celula colSpan={3}>Total</Celula>
                    <Celula numerico>{reais(m.total)}</Celula>
                    <Celula />
                  </tr>
                </TabelaRodape>
              )}
            </Tabela>
            {admin && (
              <details className="rounded border border-dashed border-marinho-300 p-3" open={m.itens.length === 0}>
                <summary className="cursor-pointer text-sm font-semibold text-laranja-700">+ Item da nota</summary>
                <div className="mt-3">
                  <FormularioItemManutencao manutencaoId={m.id} plano={plano} />
                </div>
              </details>
            )}
            {admin && m.itens.length > 0 && (
              <details className="rounded border border-marinho-100 p-3 dark:border-marinho-300">
                <summary className="cursor-pointer text-sm font-semibold">Editar itens</summary>
                <div className="mt-3 space-y-4">
                  {m.itens.map((i) => (
                    <FormularioItemManutencao key={i.id} manutencaoId={m.id} plano={plano} item={i} />
                  ))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {admin && m.status !== "CONCLUIDA" && (
        <Card className="border-ok">
          <CardHeader>
            <CardTitle className="text-lg">Concluir</CardTitle>
            <CardDescription>Data e horímetro reais; os itens do plano marcados passam a contar daqui. O avião volta para a agenda.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioConcluir manutencao={m} plano={plano} hoje={hoje()} />
          </CardContent>
        </Card>
      )}

      {admin && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-laranja-700">Editar dados da manutenção</summary>
          <div className="mt-4 space-y-4">
            <FormularioManutencao
              manutencao={m}
              fornecedores={fornecedores}
              socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))}
              voos={voos.map((v) => ({ id: v.id, data: v.data, origem: v.origem, destino: v.destino, natureza: v.natureza }))}
              hoje={hoje()}
            />
            <div className="border-t border-marinho-100 pt-4 dark:border-marinho-300">
              <BotaoApagarManutencao id={m.id} />
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
