import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { exigirValores } from "@/lib/perfil";
import { aeronaveAtiva, listarCategorias, listarSocios } from "@/lib/dados/cadastros";
import { listarDespesas, type FiltroDespesas } from "@/lib/dados/financeiro";
import { data as fmtData, reais } from "@/lib/formato";
import { CRITERIOS, ROTULO_CRITERIO } from "@/lib/tipos";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Filtros } from "@/components/filtros";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha, TabelaRodape } from "@/components/ui/tabela";

export const metadata: Metadata = { title: "Despesas" };

export default async function PaginaDespesas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const busca = await searchParams;
  await exigirValores();
  const aeronave = await aeronaveAtiva();

  const filtro: FiltroDespesas = {
    de: busca.de || undefined,
    ate: busca.ate || undefined,
    categoria: busca.categoria || undefined,
    socio: busca.socio || undefined,
    criterio: busca.criterio || undefined,
    status: busca.status || undefined,
  };

  const [despesas, socios, categorias] = await Promise.all([listarDespesas(aeronave.id, filtro), listarSocios(), listarCategorias()]);
  const total = despesas.reduce((s, d) => s + d.valor, 0);
  const query = new URLSearchParams(Object.entries(busca).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Despesas</h1>
          <p className="text-sm text-marinho-300">
            {despesas.length} lançamento{despesas.length === 1 ? "" : "s"} · {reais(total)}
          </p>
        </div>
        <Button asChild>
          <Link href="/despesas/nova">
            <Plus /> Nova despesa
          </Link>
        </Button>
      </div>

      {busca.apagada && <Alerta tom="ok">Despesa apagada.</Alerta>}

      <Filtros
        hrefExportar={`/despesas/exportar?${query}`}
        hrefLimpar="/despesas"
        campos={[
          { nome: "de", rotulo: "De", tipo: "date", valor: busca.de },
          { nome: "ate", rotulo: "Até", tipo: "date", valor: busca.ate },
          { nome: "categoria", rotulo: "Categoria", tipo: "select", valor: busca.categoria, opcoes: categorias.map((c) => ({ valor: String(c.id), rotulo: c.nome })) },
          {
            nome: "socio",
            rotulo: "Pagou / direto a",
            tipo: "select",
            valor: busca.socio,
            opcoes: [{ valor: "CAIXA", rotulo: "Caixa" }, ...socios.map((s) => ({ valor: s.id, rotulo: s.apelido }))],
          },
          { nome: "criterio", rotulo: "Rateio", tipo: "select", valor: busca.criterio, opcoes: CRITERIOS.map((c) => ({ valor: c, rotulo: ROTULO_CRITERIO[c] })) },
          { nome: "status", rotulo: "Situação", tipo: "select", valor: busca.status, opcoes: [{ valor: "PENDENTE", rotulo: "Pendente" }, { valor: "APROVADA", rotulo: "Aprovada" }, { valor: "RATEADA", rotulo: "Rateada" }] },
        ]}
      />

      <Tabela>
        <TabelaCabecalho>
          <tr>
            <Cabecalho>Data</Cabecalho>
            <Cabecalho>Descrição</Cabecalho>
            <Cabecalho>Categoria</Cabecalho>
            <Cabecalho>Fornecedor</Cabecalho>
            <Cabecalho>Pagou</Cabecalho>
            <Cabecalho>Rateio</Cabecalho>
            <Cabecalho numerico>Valor</Cabecalho>
            <Cabecalho>Situação</Cabecalho>
          </tr>
        </TabelaCabecalho>
        <TabelaCorpo>
          {despesas.length === 0 && (
            <TabelaLinha>
              <Celula colSpan={8} className="py-10 text-center text-marinho-300">
                Nenhuma despesa com esses filtros.
              </Celula>
            </TabelaLinha>
          )}
          {despesas.map((d) => (
            <TabelaLinha key={d.id}>
              <Celula className="whitespace-nowrap">
                <Link href={`/despesas/${d.id}`} className="font-semibold text-laranja-700 hover:underline">
                  {fmtData(d.data)}
                </Link>
              </Celula>
              <Celula>{d.descricao}</Celula>
              <Celula className="whitespace-nowrap text-marinho-300">{d.categoria}</Celula>
              <Celula>{d.fornecedor ?? ""}</Celula>
              <Celula>{d.pagador}</Celula>
              <Celula className="whitespace-nowrap">
                {ROTULO_CRITERIO[d.criterio]}
                {d.socio_direto ? ` → ${d.socio_direto}` : ""}
              </Celula>
              <Celula numerico className="font-semibold">{reais(d.valor)}</Celula>
              <Celula>
                <Badge variant={d.status === "RATEADA" ? "ok" : d.status === "PENDENTE" ? "atencao" : "info"}>{d.status.toLowerCase()}</Badge>
              </Celula>
            </TabelaLinha>
          ))}
        </TabelaCorpo>
        {despesas.length > 0 && (
          <TabelaRodape>
            <tr>
              <Celula colSpan={6}>Total</Celula>
              <Celula numerico>{reais(total)}</Celula>
              <Celula />
            </tr>
          </TabelaRodape>
        )}
      </Tabela>
    </div>
  );
}
