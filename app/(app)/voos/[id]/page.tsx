import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, aerodromosRecentes, listarPilotos, listarSocios } from "@/lib/dados/cadastros";
import { buscarVoo, trecho, urlDaFoto } from "@/lib/dados/voos";
import { temChave } from "@/lib/horimetro/ler";
import { data as fmtData, horas as fmtHoras, horasHm, horimetro as fmtHorimetro, litros as fmtLitros, periodoVoo } from "@/lib/formato";
import { ROTULO_NATUREZA } from "@/lib/tipos";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioPouso } from "./formulario-pouso";
import { FormularioPerna } from "./formulario-perna";
import { FormularioEdicao } from "./formulario-edicao";

export const metadata: Metadata = { title: "Voo" };

export default async function PaginaVoo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; decolou?: string; aberto?: string; editar?: string; perna?: string }>;
}) {
  const [{ id }, busca] = await Promise.all([params, searchParams]);
  const usuario = await exigirSessao();
  const voo = await buscarVoo(id);
  if (!voo) notFound();

  const aeronave = await aeronaveAtiva();
  const emAberto = voo.horimetro_final === null && voo.horimetro_inicial !== null;
  const podeEditar = usuario.perfil === "admin" || voo.autor_id === usuario.id;
  // pernas: escalas ainda não pousadas vêm antes do pouso final
  const pontos = [voo.origem ?? "?", ...voo.escalas, voo.destino ?? "?"];
  const pernaAtual = voo.pernas_concluidas; // índice da perna em curso
  const faltaEscala = emAberto && pernaAtual < voo.escalas.length;
  const horimetroAnterior = voo.horimetro_pernas.length > 0 ? voo.horimetro_pernas[voo.horimetro_pernas.length - 1] : voo.horimetro_inicial;

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
            {periodoVoo(voo)} · {trecho(voo)}
          </h1>
          {emAberto ? <Badge variant="atencao">em voo</Badge> : voo.status === "CONFIRMADO" ? <Badge variant="ok">confirmado</Badge> : <Badge variant="info">rascunho</Badge>}
          {voo.pendente_horimetro && <Badge variant="erro">horímetro pendente</Badge>}
        </div>
        <p className="mt-1 text-sm text-marinho-300">
          {voo.socio ?? "Sociedade"} · {ROTULO_NATUREZA[voo.natureza]}
          {voo.piloto ? ` · piloto ${voo.piloto}` : ""}
        </p>
      </div>

      {busca.salvo && <Alerta tom="ok">{busca.salvo === "2" ? "Ida e volta registradas — esta é a volta." : busca.salvo === "3" ? "Ida e volta registradas num voo só." : "Voo registrado."}</Alerta>}
      {busca.decolou && <Alerta tom="info">Decolagem registrada. A cada pouso, volte aqui (o Início também leva) e registre o horímetro.</Alerta>}
      {busca.perna && <Alerta tom="ok">Pouso registrado. Boa próxima perna!</Alerta>}
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

      {emAberto && voo.escalas.length > 0 && (
        <ol className="flex flex-wrap gap-2 text-sm">
          {voo.escalas.map((_, i) => {
            const feita = i < pernaAtual;
            const atual = i === pernaAtual;
            return (
              <li key={i} className={`rounded-full border px-3 py-1 ${feita ? "border-ok bg-ok/10 text-ok" : atual ? "border-laranja bg-laranja/10 font-semibold" : "border-marinho-100 text-marinho-300 dark:border-marinho-300"}`}>
                {pontos[i]} → {pontos[i + 1]}
                {feita && voo.horas_pernas[i] !== undefined ? ` · ${horasHm(voo.horas_pernas[i])}` : ""}
              </li>
            );
          })}
          <li className={`rounded-full border px-3 py-1 ${pernaAtual >= voo.escalas.length ? "border-laranja bg-laranja/10 font-semibold" : "border-marinho-100 text-marinho-300 dark:border-marinho-300"}`}>
            {pontos[pontos.length - 2]} → {pontos[pontos.length - 1]}
          </li>
        </ol>
      )}

      {faltaEscala && podeEditar && (
        <Card className="border-laranja">
          <CardHeader>
            <CardTitle>Pouso em {voo.escalas[pernaAtual]}</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioPerna
              id={voo.id}
              numero={pernaAtual + 1}
              total={voo.escalas.length + 1}
              de={pontos[pernaAtual]}
              para={voo.escalas[pernaAtual]}
              proxima={pontos[pernaAtual + 2]}
              horimetroAnterior={horimetroAnterior}
              aerodromos={aerodromos}
              leituraAutomatica={temChave()}
            />
          </CardContent>
        </Card>
      )}

      {emAberto && !faltaEscala && podeEditar && (
        <Card className="border-laranja">
          <CardHeader>
            <CardTitle>{voo.escalas.length > 0 ? `Pouso final em ${voo.destino ?? "?"}` : "Registrar pouso"}</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioPouso
              id={voo.id}
              horimetroInicial={horimetroAnterior}
              pernasConcluidas={voo.pernas_concluidas}
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
