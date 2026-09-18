import type { Metadata } from "next";
import Link from "next/link";
import { Camera } from "lucide-react";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, listarAerodromos, listarSocios } from "@/lib/dados/cadastros";
import { listarVoos, trecho, type FiltroVoos } from "@/lib/dados/voos";
import { data as fmtData, horas as fmtHoras, horimetro as fmtHorimetro, litros as fmtLitros } from "@/lib/formato";
import { NATUREZAS, ROTULO_NATUREZA } from "@/lib/tipos";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Filtros } from "@/components/filtros";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha, TabelaRodape } from "@/components/ui/tabela";

export const metadata: Metadata = { title: "Voos" };

export default async function PaginaVoos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const busca = await searchParams;
  await exigirSessao();
  const aeronave = await aeronaveAtiva();

  const filtro: FiltroVoos = {
    socio: busca.socio || undefined,
    de: busca.de || undefined,
    ate: busca.ate || undefined,
    natureza: busca.natureza || undefined,
    aerodromo: busca.aerodromo?.toUpperCase() || undefined,
    pendentes: busca.pendentes === "1",
  };

  const [voos, socios, aerodromos] = await Promise.all([listarVoos(aeronave.id, filtro), listarSocios(), listarAerodromos()]);

  const totalHoras = voos.reduce((s, v) => s + v.horas, 0);
  const query = new URLSearchParams(Object.entries(busca).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Voos</h1>
          <p className="text-sm text-marinho-300">
            {aeronave.matricula} · {voos.length} voo{voos.length === 1 ? "" : "s"} · {fmtHoras(totalHoras)}
          </p>
        </div>
        <Button asChild>
          <Link href="/voos/novo">
            <Camera /> Registrar voo
          </Link>
        </Button>
      </div>

      {busca.apagado && <Alerta tom="ok">Voo apagado.</Alerta>}

      <Filtros
        hrefExportar={`/voos/exportar?${query}`}
        hrefLimpar="/voos"
        campos={[
          {
            nome: "socio",
            rotulo: "Sócio",
            tipo: "select",
            valor: busca.socio,
            opcoes: [{ valor: "SOCIEDADE", rotulo: "Sociedade" }, ...socios.map((s) => ({ valor: s.id, rotulo: s.apelido }))],
          },
          { nome: "de", rotulo: "De", tipo: "date", valor: busca.de },
          { nome: "ate", rotulo: "Até", tipo: "date", valor: busca.ate },
          { nome: "natureza", rotulo: "Natureza", tipo: "select", valor: busca.natureza, opcoes: NATUREZAS.map((n) => ({ valor: n, rotulo: ROTULO_NATUREZA[n] })) },
          { nome: "aerodromo", rotulo: "Aeródromo", tipo: "select", valor: busca.aerodromo, opcoes: aerodromos.map((a) => ({ valor: a.icao, rotulo: a.icao })) },
          { nome: "pendentes", rotulo: "Situação", tipo: "select", valor: busca.pendentes, opcoes: [{ valor: "1", rotulo: "Só pendentes" }] },
        ]}
      />

      <Tabela>
        <TabelaCabecalho>
          <tr>
            <Cabecalho>Data</Cabecalho>
            <Cabecalho>Sócio</Cabecalho>
            <Cabecalho>Trecho</Cabecalho>
            <Cabecalho numerico>Horím. inicial</Cabecalho>
            <Cabecalho numerico>Horím. final</Cabecalho>
            <Cabecalho numerico>Horas</Cabecalho>
            <Cabecalho numerico>Comb. ini.</Cabecalho>
            <Cabecalho numerico>Comb. fim</Cabecalho>
            <Cabecalho>Natureza</Cabecalho>
            <Cabecalho>Situação</Cabecalho>
          </tr>
        </TabelaCabecalho>
        <TabelaCorpo>
          {voos.length === 0 && (
            <TabelaLinha>
              <Celula colSpan={10} className="py-10 text-center text-marinho-300">
                Nenhum voo com esses filtros.
              </Celula>
            </TabelaLinha>
          )}
          {voos.map((v) => {
            const emAberto = v.horimetro_final === null && v.horimetro_inicial !== null;
            return (
              <TabelaLinha key={v.id}>
                <Celula>
                  <Link href={`/voos/${v.id}`} className="font-semibold text-laranja-700 hover:underline">
                    {fmtData(v.data)}
                  </Link>
                </Celula>
                <Celula>{v.socio ?? <span className="text-marinho-300">Sociedade</span>}</Celula>
                <Celula className="whitespace-nowrap">{trecho(v)}</Celula>
                <Celula numerico>{fmtHorimetro(v.horimetro_inicial)}</Celula>
                <Celula numerico>{fmtHorimetro(v.horimetro_final)}</Celula>
                <Celula numerico className="font-semibold">{fmtHoras(v.horas)}</Celula>
                <Celula numerico>{fmtLitros(v.combustivel_inicial_l)}</Celula>
                <Celula numerico>{fmtLitros(v.combustivel_final_l)}</Celula>
                <Celula className="whitespace-nowrap text-marinho-300">{ROTULO_NATUREZA[v.natureza]}</Celula>
                <Celula className="whitespace-nowrap">
                  {emAberto ? <Badge variant="atencao">em voo</Badge> : v.pendente_horimetro ? <Badge variant="erro">horímetro pendente</Badge> : v.status === "CONFIRMADO" ? <Badge variant="ok">ok</Badge> : <Badge variant="info">rascunho</Badge>}
                </Celula>
              </TabelaLinha>
            );
          })}
        </TabelaCorpo>
        {voos.length > 0 && (
          <TabelaRodape>
            <tr>
              <Celula colSpan={5}>Total</Celula>
              <Celula numerico>{fmtHoras(totalHoras)}</Celula>
              <Celula colSpan={4} />
            </tr>
          </TabelaRodape>
        )}
      </Tabela>
    </div>
  );
}
