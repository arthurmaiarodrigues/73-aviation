import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lock, Printer } from "lucide-react";

import { exigirValores } from "@/lib/perfil";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { acertoSugerido, listarFechamentos, mesesComMovimento, mesesEntre, resumoDoPeriodo } from "@/lib/dados/fechamento";
import { data as fmtData, hoje, horas as fmtHoras, horimetro as fmtHorimetro, inicioDoMes, litros as fmtLitros, mesPorExtenso, reais } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha, TabelaRodape } from "@/components/ui/tabela";
import { FormularioFechar, FormularioReabrir } from "./formularios";

export const metadata: Metadata = { title: "Fechamento" };

export default async function PaginaFechamento({ searchParams }: { searchParams: Promise<{ mes?: string; ate?: string }> }) {
  const busca = await searchParams;
  const usuario = await exigirValores();
  const aeronave = await aeronaveAtiva();
  const admin = usuario.perfil === "admin";

  const [meses, fechamentos] = await Promise.all([mesesComMovimento(aeronave.id), listarFechamentos(aeronave.id)]);
  const mesAtual = inicioDoMes(hoje());
  const opcoes = [...new Set([mesAtual, ...meses, ...fechamentos.map((f) => f.mes)])].sort().reverse();
  const mes = /^\d{4}-\d{2}$/.test(busca.mes ?? "") ? `${busca.mes}-01` : (opcoes.find((m) => m < mesAtual) ?? mesAtual);
  const ate = /^\d{4}-\d{2}$/.test(busca.ate ?? "") && `${busca.ate}-01` > mes ? `${busca.ate}-01` : mes;
  const mesesDoPeriodo = mesesEntre(mes, ate);
  const periodo = mesesDoPeriodo.length > 1;

  // Um mês ou um período (o primeiro fechamento da sociedade pega vários meses).
  const { resumo, fechamentos: fechamentosPeriodo, pendencias } = await resumoDoPeriodo(aeronave.id, mesesDoPeriodo);
  const fechamento = fechamentosPeriodo[fechamentosPeriodo.length - 1];
  const fechado = fechamentosPeriodo.every((f) => f?.status === "FECHADO");
  const parcialmenteFechado = !fechado && fechamentosPeriodo.some((f) => f?.status === "FECHADO");
  const titulo = periodo ? `${mesPorExtenso(mes)} a ${mesPorExtenso(ate)}` : mesPorExtenso(mes);
  const acerto = acertoSugerido(resumo);
  const totais = resumo.reduce(
    (t, s) => ({ horas: t.horas + s.horas, creditos: t.creditos + s.creditos, debitos: t.debitos + s.debitos, saldo: t.saldo + s.saldo_mes, fundo: t.fundo + s.fundo, rateado: t.rateado + s.rateado }),
    { horas: 0, creditos: 0, debitos: 0, saldo: 0, fundo: 0, rateado: 0 },
  );
  const bloqueado = pendencias.some((p) => p.bloqueia);
  const mesTerminado = ate < mesAtual;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fechamento</h1>
          <p className="text-sm text-marinho-300">Um mês ou um período (de … até). Resumo por sócio, acerto sugerido e PDF. Fechar congela rateios e fundo.</p>
        </div>
        <div className="flex items-center gap-2">
          <form method="get" className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-marinho-300">de</span>
            <Select name="mes" defaultValue={mes.slice(0, 7)} className="w-44">
              {opcoes.map((m) => (
                <option key={m} value={m.slice(0, 7)}>
                  {mesPorExtenso(m)}
                  {fechamentos.find((f) => f.mes === m && f.status === "FECHADO") ? " · fechado" : ""}
                </option>
              ))}
            </Select>
            <span className="text-xs text-marinho-300">até</span>
            <Select name="ate" defaultValue={ate.slice(0, 7)} className="w-44">
              {opcoes.map((m) => (
                <option key={m} value={m.slice(0, 7)}>
                  {mesPorExtenso(m)}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secundario" size="pequeno">
              Ver
            </Button>
          </form>
          <Button asChild variant="secundario">
            <Link href={`/fechamento/${mes.slice(0, 7)}/imprimir${periodo ? `?ate=${ate.slice(0, 7)}` : ""}`}>
              <Printer /> PDF
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{titulo}</h2>
        {parcialmenteFechado && <Badge variant="atencao">parte do período já fechada</Badge>}
        {fechado ? (
          <Badge variant="ok">
            <Lock /> fechado em {fechamento?.fechado_em ? new Date(fechamento.fechado_em).toLocaleDateString("pt-BR") : ""}
            {fechamento?.fechado_por_nome ? ` por ${fechamento.fechado_por_nome}` : ""}
          </Badge>
        ) : (
          <Badge variant="info">aberto</Badge>
        )}
        {fechamento?.reaberto_em && !fechado && <Badge variant="atencao">reaberto em {new Date(fechamento.reaberto_em).toLocaleDateString("pt-BR")}</Badge>}
        {fechado && fechamento?.horimetro_final !== null && <span className="text-sm text-marinho-300">horímetro no fim do período: {fmtHorimetro(fechamento?.horimetro_final)}</span>}
      </div>

      {pendencias.length > 0 && !fechado && (
        <Alerta tom={bloqueado ? "erro" : "atencao"}>
          <p className="font-semibold">Antes de fechar:</p>
          <ul className="mt-1 text-sm">
            {pendencias.map((p) => (
              <li key={p.tipo}>
                {p.quantidade} × {p.tipo.toLowerCase()}
                {p.bloqueia ? " — impede o fechamento" : " — aviso"}
              </li>
            ))}
          </ul>
        </Alerta>
      )}

      {/* Resumo por sócio */}
      <Tabela>
        <TabelaCabecalho>
          <tr>
            <Cabecalho>Sócio</Cabecalho>
            <Cabecalho numerico>Horas</Cabecalho>
            <Cabecalho numerico>Rateios</Cabecalho>
            <Cabecalho numerico>Fundo</Cabecalho>
            <Cabecalho numerico>Combustível (L)</Cabecalho>
            <Cabecalho numerico>Créditos</Cabecalho>
            <Cabecalho numerico>Débitos</Cabecalho>
            <Cabecalho numerico>{periodo ? "Saldo do período" : "Saldo do mês"}</Cabecalho>
            <Cabecalho numerico>Acumulado</Cabecalho>
          </tr>
        </TabelaCabecalho>
        <TabelaCorpo>
          {resumo.map((s) => (
            <TabelaLinha key={s.socio_id}>
              <Celula>
                <span className="inline-flex items-center gap-2 font-semibold">
                  <span className="size-3 rounded-full" style={{ background: s.cor }} /> {s.apelido}
                </span>
              </Celula>
              <Celula numerico>
                {fmtHoras(s.horas)} <span className="text-xs text-marinho-300">({s.qtd_voos})</span>
              </Celula>
              <Celula numerico>{reais(s.rateado)}</Celula>
              <Celula numerico>{reais(s.fundo)}</Celula>
              <Celula numerico title={`${fmtLitros(s.litros_abastecidos)} abastecidos − ${fmtLitros(s.litros_consumidos)} usados`}>
                {fmtLitros(s.litros_consumidos)} <span className="text-xs text-marinho-300">({fmtLitros(s.litros_abastecidos)} abast.)</span>
              </Celula>
              <Celula numerico className="text-ok">{reais(s.creditos)}</Celula>
              <Celula numerico className="text-erro">{reais(s.debitos)}</Celula>
              <Celula numerico className={cn("font-semibold", s.saldo_mes < 0 ? "text-erro" : "text-ok")}>{reais(s.saldo_mes)}</Celula>
              <Celula numerico className={cn("font-semibold", s.saldo_acumulado < 0 ? "text-erro" : "text-ok")}>{reais(s.saldo_acumulado)}</Celula>
            </TabelaLinha>
          ))}
        </TabelaCorpo>
        <TabelaRodape>
          <tr>
            <Celula>Total</Celula>
            <Celula numerico>{fmtHoras(totais.horas)}</Celula>
            <Celula numerico>{reais(totais.rateado)}</Celula>
            <Celula numerico>{reais(totais.fundo)}</Celula>
            <Celula />
            <Celula numerico>{reais(totais.creditos)}</Celula>
            <Celula numerico>{reais(totais.debitos)}</Celula>
            <Celula numerico>{reais(totais.saldo)}</Celula>
            <Celula />
          </tr>
        </TabelaRodape>
      </Tabela>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Acerto */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Acerto sugerido</CardTitle>
            <CardDescription>Pelo saldo acumulado: quem está negativo paga, quem está positivo recebe, com o menor número de transferências. O que sobrar entra ou sai do caixa.</CardDescription>
          </CardHeader>
          <CardContent>
            {acerto.transferencias.length === 0 ? (
              <p className="text-sm text-marinho-300">Ninguém deve nada — saldos zerados.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {acerto.transferencias.map((t, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="font-semibold">{t.de}</span>
                    <ArrowRight className="size-4 text-marinho-300" />
                    <span className="font-semibold">{t.para}</span>
                    <span className="ml-auto tabular font-semibold">{reais(t.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
            {acerto.caixa !== 0 && (
              <p className="mt-3 text-xs text-marinho-300">
                Caixa da sociedade: {acerto.caixa > 0 ? `recebe ${reais(acerto.caixa)}` : `paga ${reais(-acerto.caixa)}`}.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Fechar / reabrir */}
        <Card className={fechado ? "border-ok" : "border-laranja"}>
          <CardHeader>
            <CardTitle className="text-lg">{fechado ? (periodo ? "Período fechado" : "Mês fechado") : periodo ? "Fechar o período" : "Fechar o mês"}</CardTitle>
            <CardDescription>
              {fechado
                ? "Nada mais entra com data neste período. Reabrir fica registrado com motivo (mês a mês)."
                : mesTerminado
                  ? periodo
                    ? `Fecha os ${mesesDoPeriodo.length} meses de uma vez, em ordem. Depois, voo, despesa, abastecimento e aporte com data no período são recusados.`
                    : "Depois de fechar, voo, despesa, abastecimento e aporte com data no mês são recusados."
                  : "Só dá para fechar quando o último mês do período já terminou."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!admin ? (
              <p className="text-sm text-marinho-300">Só o administrador fecha ou reabre.</p>
            ) : fechado ? (
              periodo ? (
                <div className="space-y-3">
                  {mesesDoPeriodo.map((m) => (
                    <div key={m}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-marinho-300">{mesPorExtenso(m)}</p>
                      <FormularioReabrir mes={m} />
                    </div>
                  ))}
                </div>
              ) : (
                <FormularioReabrir mes={mes} />
              )
            ) : mesTerminado ? (
              <FormularioFechar mes={mes} meses={mesesDoPeriodo} bloqueado={bloqueado} />
            ) : null}
            {fechamento?.observacao && <p className="mt-3 text-xs text-marinho-300">Observação: {fechamento.observacao}</p>}
          </CardContent>
        </Card>
      </div>

      {fechamentos.length > 0 && (
        <p className="text-xs text-marinho-300">
          Fechados: {fechamentos.filter((f) => f.status === "FECHADO").map((f) => `${mesPorExtenso(f.mes)} (${fmtData(f.fechado_em?.slice(0, 10) ?? null)})`).join(" · ") || "nenhum ainda"}
        </p>
      )}
    </div>
  );
}
