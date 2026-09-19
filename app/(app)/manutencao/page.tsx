import type { Metadata } from "next";
import Link from "next/link";
import { Paperclip, Wrench } from "lucide-react";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, listarFornecedores, listarSocios } from "@/lib/dados/cadastros";
import { listarVoos } from "@/lib/dados/voos";
import { ROTULO_GATILHO, ROTULO_STATUS, listarDocumentos, listarManutencoes, listarPlano, urlDoDocumento, type Situacao } from "@/lib/dados/manutencao";
import { data as fmtData, hoje, horas as fmtHoras, horimetro as fmtHorimetro, reais } from "@/lib/formato";
import { veValores } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha } from "@/components/ui/tabela";
import { BotaoAcao, FormularioDocumento, FormularioItemPlano, FormularioManutencao } from "./componentes";

export const metadata: Metadata = { title: "Manutenção" };

const BADGE: Record<Situacao, "ok" | "atencao" | "erro" | "neutro"> = { OK: "ok", AVISO: "atencao", VENCIDO: "erro", SEM_REGISTRO: "neutro" };
const ROTULO_SITUACAO: Record<Situacao, string> = { OK: "em dia", AVISO: "perto", VENCIDO: "vencido", SEM_REGISTRO: "sem registro" };

export default async function PaginaManutencao({ searchParams }: { searchParams: Promise<{ apagada?: string }> }) {
  const busca = await searchParams;
  const usuario = await exigirSessao();
  const aeronave = await aeronaveAtiva();
  const admin = usuario.perfil === "admin";
  const opera = admin || usuario.perfil === "piloto";
  const valores = veValores(usuario.perfil);

  const [plano, manutencoes, documentos, fornecedores, socios, voos] = await Promise.all([
    listarPlano(aeronave.id),
    listarManutencoes(aeronave.id),
    listarDocumentos(aeronave.id),
    listarFornecedores(),
    listarSocios({ somenteAtivos: true }),
    listarVoos(aeronave.id, {}, 40),
  ]);
  const urlsDocs = await Promise.all(documentos.map((d) => urlDoDocumento(d.arquivo_path)));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Manutenção</h1>
        <p className="mt-1 text-sm text-marinho-300">
          {aeronave.matricula} · horímetro {fmtHorimetro(plano[0]?.horimetro_atual ?? null)} · plano por horas e por tempo; nota da oficina item a item.
        </p>
      </div>

      {busca.apagada && <Alerta tom="ok">Manutenção apagada.</Alerta>}

      {/* Plano */}
      <Card>
        <CardHeader>
          <CardTitle>Plano de manutenção</CardTitle>
          <CardDescription>Cada item conta desde a última execução. Preencha a última execução dos itens "sem registro" para o aviso funcionar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plano.map((p) => (
              <div key={p.id} className={cn("rounded-lg border p-4", p.situacao === "VENCIDO" ? "border-erro" : p.situacao === "AVISO" ? "border-atencao" : "border-marinho-100 dark:border-marinho-300")}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{p.descricao}</p>
                  <Badge variant={BADGE[p.situacao]}>{ROTULO_SITUACAO[p.situacao]}</Badge>
                </div>
                <p className="mt-1 text-xs text-marinho-300">
                  {ROTULO_GATILHO[p.gatilho]}
                  {p.intervalo_horas ? ` · a cada ${fmtHoras(p.intervalo_horas)}` : ""}
                  {p.intervalo_meses ? ` · a cada ${p.intervalo_meses} meses` : ""}
                </p>
                <div className="mt-2 space-y-0.5 text-sm tabular">
                  {p.horas_restantes !== null && (
                    <p className={cn(p.horas_restantes <= 0 && "text-erro")}>
                      {p.horas_restantes <= 0 ? `${fmtHoras(-p.horas_restantes)} vencidas` : `faltam ${fmtHoras(p.horas_restantes)}`} <span className="text-marinho-300">(próxima em {fmtHorimetro(p.proximo_horimetro)})</span>
                    </p>
                  )}
                  {p.dias_restantes !== null && (
                    <p className={cn(p.dias_restantes <= 0 && "text-erro")}>
                      {p.dias_restantes <= 0 ? `${-p.dias_restantes} dias vencido` : `faltam ${p.dias_restantes} dias`} <span className="text-marinho-300">({fmtData(p.proxima_data)})</span>
                    </p>
                  )}
                  {p.situacao === "SEM_REGISTRO" && (
                    <p className="text-marinho-300">
                      {p.ultima_data ? `última em ${fmtData(p.ultima_data)} — falta o horímetro dessa execução` : "última execução não informada"}
                    </p>
                  )}
                </div>
                {admin && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-laranja-700">editar</summary>
                    <div className="mt-2">
                      <FormularioItemPlano item={p} />
                      <div className="mt-2">
                        <BotaoAcao acao="tirarDoPlano" id={p.id} rotulo="Tirar do plano" confirmar="Tirar este item do plano?" />
                      </div>
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
          {admin && (
            <details className="rounded border border-dashed border-marinho-300 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-laranja-700">+ Item do plano</summary>
              <div className="mt-3">
                <FormularioItemPlano />
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* Manutenções */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="size-5" /> Manutenções
          </CardTitle>
          <CardDescription>Programar bloqueia o avião na agenda. A nota da oficina entra item a item na ficha.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {opera && (
            <details className="rounded border border-dashed border-marinho-300 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-laranja-700">+ Programar manutenção</summary>
              <div className="mt-3">
                <FormularioManutencao
                  fornecedores={fornecedores}
                  socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))}
                  voos={voos.map((v) => ({ id: v.id, data: v.data, origem: v.origem, destino: v.destino, natureza: v.natureza }))}
                  hoje={hoje()}
                />
              </div>
            </details>
          )}
          <Tabela>
            <TabelaCabecalho>
              <tr>
                <Cabecalho>Entrada</Cabecalho>
                <Cabecalho>Descrição</Cabecalho>
                <Cabecalho>Oficina</Cabecalho>
                <Cabecalho>Saída</Cabecalho>
                <Cabecalho numerico>Horímetro</Cabecalho>
                {valores && <Cabecalho numerico>Total</Cabecalho>}
                <Cabecalho>Situação</Cabecalho>
              </tr>
            </TabelaCabecalho>
            <TabelaCorpo>
              {manutencoes.length === 0 && (
                <TabelaLinha>
                  <Celula colSpan={7} className="py-8 text-center text-marinho-300">
                    Nenhuma manutenção registrada.
                  </Celula>
                </TabelaLinha>
              )}
              {manutencoes.map((m) => (
                <TabelaLinha key={m.id}>
                  <Celula className="whitespace-nowrap">
                    <Link href={`/manutencao/${m.id}`} className="font-semibold text-laranja-700 hover:underline">
                      {fmtData(m.data_inicio)}
                    </Link>
                  </Celula>
                  <Celula>{m.descricao}</Celula>
                  <Celula>{m.fornecedor ?? ""}</Celula>
                  <Celula className="whitespace-nowrap">{fmtData(m.data_fim)}</Celula>
                  <Celula numerico>{fmtHorimetro(m.horimetro)}</Celula>
                  {valores && <Celula numerico className="font-semibold">{reais(m.total)}</Celula>}
                  <Celula>
                    <Badge variant={m.status === "CONCLUIDA" ? "ok" : m.status === "EM_OFICINA" ? "atencao" : "info"}>{ROTULO_STATUS[m.status]}</Badge>
                  </Celula>
                </TabelaLinha>
              ))}
            </TabelaCorpo>
          </Tabela>
        </CardContent>
      </Card>

      {/* Documentos */}
      <Card>
        <CardHeader>
          <CardTitle>Documentos da aeronave</CardTitle>
          <CardDescription>Vencido barra reserva na agenda e aparece no Início. Vale o documento mais recente de cada tipo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {admin && <FormularioDocumento />}
          <ul className="divide-y divide-marinho-100 text-sm dark:divide-marinho-300">
            {documentos.map((d, i) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2">
                <Badge variant={d.situacao === "OK" ? "ok" : d.situacao === "AVISO" ? "atencao" : "erro"}>
                  {d.situacao === "VENCIDO" ? `vencido há ${-d.dias_restantes} dias` : d.situacao === "AVISO" ? `vence em ${d.dias_restantes} dias` : "em dia"}
                </Badge>
                <span className="font-semibold">{d.tipo}</span>
                {d.numero && <span className="text-marinho-300">{d.numero}</span>}
                <span>vence {fmtData(d.vencimento)}</span>
                {urlsDocs[i] && (
                  <a href={urlsDocs[i]!} target="_blank" rel="noreferrer" className="text-laranja-700 hover:underline">
                    <Paperclip className="inline size-4" /> abrir
                  </a>
                )}
                {admin && <BotaoAcao acao="removerDocumento" id={d.id} rotulo="Remover" confirmar="Remover este documento?" />}
              </li>
            ))}
            {documentos.length === 0 && <li className="py-2 text-marinho-300">Nenhum documento registrado. Comece pelo CA/CVA, seguro RETA e IAM.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
