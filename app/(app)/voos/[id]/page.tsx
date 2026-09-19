import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, aerodromosRecentes, listarPilotos, listarSocios } from "@/lib/dados/cadastros";
import { buscarVoo, trecho, urlDaFoto } from "@/lib/dados/voos";
import { temChave } from "@/lib/horimetro/ler";
import { data as fmtData, horas as fmtHoras, horasHm, horimetro as fmtHorimetro, litros as fmtLitros } from "@/lib/formato";
import { ROTULO_NATUREZA } from "@/lib/tipos";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioPouso } from "./formulario-pouso";
import { FormularioEdicao } from "./formulario-edicao";

export const metadata: Metadata = { title: "Voo" };

export default async function PaginaVoo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; decolou?: string; aberto?: string; editar?: string }>;
}) {
  const [{ id }, busca] = await Promise.all([params, searchParams]);
  const usuario = await exigirSessao();
  const voo = await buscarVoo(id);
  if (!voo) notFound();

  const aeronave = await aeronaveAtiva();
  const emAberto = voo.horimetro_final === null && voo.horimetro_inicial !== null;
  const podeEditar = usuario.perfil === "admin" || voo.autor_id === usuario.id;

  const [fotoInicial, fotoFinal, aerodromos, socios, pilotos] = await Promise.all([
    urlDaFoto(voo.foto_horimetro_inicial),
    urlDaFoto(voo.foto_horimetro_final),
    aerodromosRecentes(aeronave.id),
    listarSocios(),
    listarPilotos(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/voos" className="inline-flex items-center gap-1 text-sm text-marinho-300 hover:text-laranja-700">
          <ArrowLeft className="size-4" /> Voos
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {fmtData(voo.data)} · {trecho(voo)}
          </h1>
          {emAberto ? <Badge variant="atencao">em voo</Badge> : voo.status === "CONFIRMADO" ? <Badge variant="ok">confirmado</Badge> : <Badge variant="info">rascunho</Badge>}
          {voo.pendente_horimetro && <Badge variant="erro">horímetro pendente</Badge>}
        </div>
        <p className="mt-1 text-sm text-marinho-300">
          {voo.socio ?? "Sociedade"} · {ROTULO_NATUREZA[voo.natureza]}
          {voo.piloto ? ` · piloto ${voo.piloto}` : ""}
        </p>
      </div>

      {busca.salvo && <Alerta tom="ok">Voo registrado.</Alerta>}
      {busca.decolou && <Alerta tom="info">Decolagem registrada. Quando pousar, volte aqui e registre o horímetro final.</Alerta>}
      {busca.aberto && <Alerta tom="atencao">Você tem este voo em aberto. Registre o pouso antes de começar outro.</Alerta>}

      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-4">
          <Dado rotulo="Horímetro inicial" valor={fmtHorimetro(voo.horimetro_inicial)} />
          <Dado rotulo="Horímetro final" valor={fmtHorimetro(voo.horimetro_final)} />
          <Dado rotulo="Horas" valor={fmtHoras(voo.horas)} destaque />
          <Dado rotulo="Pousos" valor={String(voo.pousos)} />
          <Dado rotulo="Combustível decolagem" valor={fmtLitros(voo.combustivel_inicial_l)} />
          <Dado rotulo="Combustível pouso" valor={fmtLitros(voo.combustivel_final_l)} />
          <Dado
            rotulo="Consumo"
            valor={
              voo.combustivel_inicial_l !== null && voo.combustivel_final_l !== null
                ? fmtLitros(voo.combustivel_inicial_l - voo.combustivel_final_l)
                : aeronave.consumo_medio_lh
                  ? `≈ ${fmtLitros(Math.round(aeronave.consumo_medio_lh * voo.horas * 10) / 10)} (estimado)`
                  : "—"
            }
          />
          {voo.escalas.length > 0 && (
            <Dado
              rotulo="Pernas"
              valor={[voo.origem ?? "?", ...voo.escalas]
                .map((de, i) => `${de} → ${[...voo.escalas, voo.destino ?? "?"][i]}${voo.horas_pernas[i] !== undefined ? ` ${horasHm(voo.horas_pernas[i])}` : ""}${voo.combustivel_pernas[i] ? ` · ${fmtLitros(voo.combustivel_pernas[i])} na decolagem` : ""}`)
                .join(" · ")}
            />
          )}
          {voo.observacao && <Dado rotulo="Observação" valor={voo.observacao} />}
        </CardContent>
      </Card>

      {(fotoInicial || fotoFinal) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {fotoInicial && <Foto url={fotoInicial} rotulo="Horímetro inicial" />}
          {fotoFinal && <Foto url={fotoFinal} rotulo="Horímetro final" />}
        </div>
      )}

      {emAberto && podeEditar && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar pouso</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioPouso
              id={voo.id}
              horimetroInicial={voo.horimetro_inicial}
              destino={voo.destino}
              escalas={voo.escalas}
              horasPernas={voo.horas_pernas}
              combustivelPernas={voo.combustivel_pernas}
              aerodromos={aerodromos}
              observacao={voo.observacao}
              leituraAutomatica={temChave()}
            />
          </CardContent>
        </Card>
      )}

      {podeEditar && !emAberto && (
        <details open={Boolean(busca.editar) || voo.pendente_horimetro}>
          <summary className="cursor-pointer text-sm font-semibold text-laranja-700">Editar voo</summary>
          <div className="mt-4">
            <FormularioEdicao
              voo={voo}
              socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))}
              pilotos={pilotos}
              aerodromos={aerodromos}
              podeApagar={usuario.perfil === "admin"}
            />
          </div>
        </details>
      )}
    </div>
  );
}

function Dado({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-marinho-300">{rotulo}</p>
      <p className={`tabular ${destaque ? "text-xl font-semibold" : "text-base"}`}>{valor}</p>
    </div>
  );
}

function Foto({ url, rotulo }: { url: string; rotulo: string }) {
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={rotulo} className="max-h-72 w-full rounded-lg border border-marinho-100 object-contain dark:border-marinho-300" />
      <figcaption className="mt-1 text-xs text-marinho-300">{rotulo}</figcaption>
    </figure>
  );
}
