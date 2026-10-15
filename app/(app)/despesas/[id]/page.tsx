import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";

import { exigirValores } from "@/lib/perfil";
import { aeronaveAtiva, listarCategorias, listarFornecedores, listarSocios } from "@/lib/dados/cadastros";
import { buscarDespesa, urlDoComprovante } from "@/lib/dados/financeiro";
import { listarVoos } from "@/lib/dados/voos";
import { data as fmtData, horas as fmtHoras, hoje, percentual, reais } from "@/lib/formato";
import { ROTULO_CRITERIO } from "@/lib/tipos";
import { ratearProporcional } from "@/lib/proporcional";
import { cn } from "@/lib/utils";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha } from "@/components/ui/tabela";
import { FormularioDespesa } from "../formulario-despesa";

export const metadata: Metadata = { title: "Despesa" };

export default async function PaginaDespesa({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const [{ id }, busca] = await Promise.all([params, searchParams]);
  const usuario = await exigirValores();
  const despesa = await buscarDespesa(id);
  if (!despesa) notFound();
  // Desconto da nota espalhado pelos itens, proporcional a cada um.
  const comDesconto =
    despesa.desconto > 0 && despesa.itens.length > 0 ? ratearProporcional(despesa.itens.map((i) => i.valor), despesa.valor) : null;

  const aeronave = await aeronaveAtiva();
  const [socios, categorias, fornecedores, voos, comprovante] = await Promise.all([
    listarSocios({ somenteAtivos: true }),
    listarCategorias(),
    listarFornecedores(),
    listarVoos(aeronave.id, {}, 120),
    urlDoComprovante(despesa.comprovante_path),
  ]);

  const podeEditar = usuario.perfil === "admin" || despesa.autor_id === usuario.id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/despesas" className="inline-flex items-center gap-1 text-sm text-marinho-300 hover:text-laranja-700">
          <ArrowLeft className="size-4" /> Despesas
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{despesa.descricao}</h1>
          <Badge variant={despesa.status === "RATEADA" ? "ok" : despesa.status === "PENDENTE" ? "atencao" : "info"}>{despesa.status.toLowerCase()}</Badge>
        </div>
        <p className="mt-1 text-sm text-marinho-300">
          {fmtData(despesa.data)} · {despesa.categoria}
          {despesa.fornecedor ? ` · ${despesa.fornecedor}` : ""} ·{" "}
          {despesa.pagadores.length > 0
            ? `pago por ${despesa.pagadores.map((p) => `${p.apelido} ${reais(p.valor)}`).join(" · ")}`
            : `pago por ${despesa.pagador}`}
        </p>
      </div>

      {busca.salvo && <Alerta tom="ok">Despesa lançada.</Alerta>}

      {despesa.itens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Itens da nota</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-marinho-100 text-sm dark:divide-marinho-300">
              {despesa.itens.map((i, idx) => (
                <li key={idx} className="flex items-center justify-between gap-3 py-1.5">
                  <span>{i.descricao}</span>
                  <span className="flex items-baseline gap-3">
                    <span className={cn("tabular", comDesconto ? "text-marinho-300 line-through" : "font-semibold")}>{reais(i.valor)}</span>
                    {comDesconto && <span className="tabular font-semibold">{reais(comDesconto[idx])}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {comDesconto && (
              <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-marinho pt-2 text-sm font-semibold">
                <span>Com o desconto de {reais(despesa.desconto)} dividido entre os itens</span>
                <span className="tabular">{reais(despesa.valor)}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle>
            {reais(despesa.valor)}
            {despesa.desconto > 0 && (
              <span className="ml-2 text-sm font-normal text-marinho-300">
                nota de {reais(despesa.valor + despesa.desconto)} − {reais(despesa.desconto)} de desconto
              </span>
            )}
          </CardTitle>
          <span className="text-sm text-marinho-300">
            {despesa.tanque === "COMPRA" ? (despesa.rateios.some((r) => r.litros_base) ? "Por litros retirados do tanque desde a compra anterior" : "Igual — estoque inicial do tanque") : ROTULO_CRITERIO[despesa.criterio]}
            {despesa.socio_direto ? ` — ${despesa.socio_direto}` : ""}
          </span>
        </CardHeader>
        <CardContent>
          <Tabela>
            <TabelaCabecalho>
              <tr>
                <Cabecalho>Sócio</Cabecalho>
                {despesa.criterio === "POR_HORAS" && <Cabecalho numerico>Horas base</Cabecalho>}
                {despesa.tanque === "COMPRA" && <Cabecalho numerico>Litros</Cabecalho>}
                <Cabecalho numerico>%</Cabecalho>
                <Cabecalho numerico>Parte</Cabecalho>
              </tr>
            </TabelaCabecalho>
            <TabelaCorpo>
              {despesa.rateios.map((r) => (
                <TabelaLinha key={r.socio_id}>
                  <Celula>{r.apelido}</Celula>
                  {despesa.criterio === "POR_HORAS" && <Celula numerico>{fmtHoras(r.horas_base)}</Celula>}
                  {despesa.tanque === "COMPRA" && <Celula numerico>{r.litros_base !== null ? `${String(r.litros_base).replace(".", ",")} L` : "—"}</Celula>}
                  <Celula numerico>{percentual(r.percentual, 2)}</Celula>
                  <Celula numerico className="font-semibold">{reais(r.valor)}</Celula>
                </TabelaLinha>
              ))}
              {despesa.rateios.length === 0 && (
                <TabelaLinha>
                  <Celula colSpan={4} className="text-center text-marinho-300">
                    Sem rateio ainda.
                  </Celula>
                </TabelaLinha>
              )}
            </TabelaCorpo>
          </Tabela>
          {comprovante && (
            <a href={comprovante} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-laranja-700 hover:underline">
              <Paperclip className="size-4" /> Abrir comprovante
            </a>
          )}
        </CardContent>
      </Card>

      {podeEditar && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-laranja-700">Editar despesa</summary>
          <div className="mt-4">
            <FormularioDespesa
              despesa={despesa}
              socios={socios.map((s) => ({ id: s.id, apelido: s.apelido, cota: s.cota }))}
              categorias={categorias}
              fornecedores={fornecedores}
              voosRecentes={voos.map((v) => ({ id: v.id, data: v.data, socio_id: v.socio_id, socio: v.socio, origem: v.origem, destino: v.destino }))}
              hoje={hoje()}
              socioLogadoId={usuario.socioId}
              podeApagar={usuario.perfil === "admin"}
            />
          </div>
        </details>
      )}
    </div>
  );
}
