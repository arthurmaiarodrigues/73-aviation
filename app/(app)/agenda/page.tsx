import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, listarSocios } from "@/lib/dados/cadastros";
import {
  ROTULO_BLOQUEIO,
  fila,
  garantirEscolhaAberta,
  listarBloqueios,
  listarReservas,
  listarSemanas,
  mesAnterior,
  mesSeguinte,
  vezDeEscolher,
  type Bloqueio,
  type Reserva,
  type Semana,
} from "@/lib/dados/agenda";
import { data as fmtData, hoje, horas as fmtHoras, mesPorExtenso } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BotaoAcao } from "./botoes";
import { FormularioBloqueio, FormularioReserva } from "./formularios";

export const metadata: Metadata = { title: "Agenda" };

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

function addDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function PaginaAgenda({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const busca = await searchParams;
  const usuario = await exigirSessao();
  const aeronave = await aeronaveAtiva();
  const h = hoje();
  const mes = /^\d{4}-\d{2}$/.test(busca.mes ?? "") ? `${busca.mes}-01` : `${h.slice(0, 7)}-01`;

  await garantirEscolhaAberta(aeronave.id);

  const semanas = await listarSemanas(aeronave.id, mes);
  const de = semanas[0]?.inicio ?? mes;
  const ate = semanas[semanas.length - 1]?.fim ?? mes;
  const [linhasFila, vez, reservas, bloqueios, socios] = await Promise.all([
    fila(aeronave.id, mes),
    vezDeEscolher(aeronave.id, mes),
    listarReservas(aeronave.id, de, ate),
    listarBloqueios(aeronave.id, de, ate),
    listarSocios({ somenteAtivos: true }),
  ]);

  const minhaVez = vez !== null && vez === usuario.socioId;
  const minhaLinha = linhasFila.find((l) => l.socio_id === usuario.socioId);
  const possoEscolher = Boolean(minhaLinha && !minhaLinha.semana_id && (minhaVez || minhaLinha.pulado));
  const minhaSemana = semanas.find((s) => s.socio_id === usuario.socioId);
  const semanasLivres = semanas.filter((s) => !s.socio_id && s.fim >= h);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Agenda</h1>
          <p className="text-sm text-marinho-300">Uma semana por sócio por mês; o resto é livre, por ordem de chegada.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild variant="fantasma" size="icone">
            <Link href={`/agenda?mes=${mesAnterior(mes).slice(0, 7)}`} aria-label="Mês anterior">
              <ChevronLeft />
            </Link>
          </Button>
          <span className="min-w-40 text-center text-lg font-semibold">{mesPorExtenso(mes)}</span>
          <Button asChild variant="fantasma" size="icone">
            <Link href={`/agenda?mes=${mesSeguinte(mes).slice(0, 7)}`} aria-label="Mês seguinte">
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </div>

      {possoEscolher && (
        <Alerta tom="atencao">
          <p className="font-semibold">{minhaVez ? "É a sua vez de escolher a semana." : "Você passou a vez, mas ainda pode escolher entre as semanas livres."}</p>
          {minhaVez && minhaLinha?.prazo && <p className="text-xs">Prazo: {new Date(minhaLinha.prazo).toLocaleString("pt-BR", { timeZone: "America/Bahia" })}. Depois disso a vez passa para o próximo.</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {semanasLivres.map((s) => (
              <BotaoAcao key={s.id} acao="escolher" id={s.id} rotulo={`${fmtData(s.inicio)} – ${fmtData(s.fim)}`} />
            ))}
            {semanasLivres.length === 0 && <span className="text-sm">Nenhuma semana livre sobrou neste mês.</span>}
          </div>
        </Alerta>
      )}

      {/* Calendário */}
      <Calendario semanas={semanas} reservas={reservas} bloqueios={bloqueios} hoje={h} meuSocioId={usuario.socioId} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fila de escolha */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Escolha das semanas</CardTitle>
            <CardDescription>Ordem por menos horas nos 3 meses anteriores. 48 h para escolher; quem não escolhe passa a vez.</CardDescription>
          </CardHeader>
          <CardContent>
            {linhasFila.length === 0 ? (
              <p className="text-sm text-marinho-300">A escolha deste mês abre no dia 15 do mês anterior.</p>
            ) : (
              <ol className="space-y-2">
                {linhasFila.map((l) => {
                  const semana = semanas.find((s) => s.id === l.semana_id);
                  const ehVez = vez === l.socio_id;
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-5 text-right text-marinho-300">{l.ordem}.</span>
                      <span className="size-3 rounded-full" style={{ background: l.cor }} />
                      <span className="font-semibold">{l.apelido}</span>
                      <span className="text-xs text-marinho-300">{fmtHoras(l.horas_base)} nos 3 meses</span>
                      {semana ? (
                        <Badge variant="ok">
                          {fmtData(semana.inicio)} – {fmtData(semana.fim)}
                        </Badge>
                      ) : ehVez ? (
                        <Badge variant="atencao">é a vez</Badge>
                      ) : l.pulado ? (
                        <Badge variant="neutro">passou a vez</Badge>
                      ) : (
                        <Badge variant="info">aguardando</Badge>
                      )}
                      {semana && (l.socio_id === usuario.socioId || usuario.perfil === "admin") && semana.fim >= h && (
                        <BotaoAcao acao="ceder" id={semana.id} rotulo="Ceder semana" variant="fantasma" confirmar="Devolver a semana ao pool?" />
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Reservar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reservar dias</CardTitle>
            <CardDescription>
              {minhaSemana
                ? `Sua semana: ${fmtData(minhaSemana.inicio)} a ${fmtData(minhaSemana.fim)}. Fora dela, vale ordem de chegada.`
                : "Dias sem titular: quem reservar primeiro fica com o avião."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usuario.socioId ? <FormularioReserva hoje={h} /> : <p className="text-sm text-marinho-300">Só sócio reserva.</p>}
            <ul className="divide-y divide-marinho-100 text-sm dark:divide-marinho-300">
              {reservas.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="size-3 rounded-full" style={{ background: r.cor }} />
                  <span className="font-semibold">{r.socio}</span>
                  <span>
                    {fmtData(r.inicio)}
                    {r.fim !== r.inicio ? ` – ${fmtData(r.fim)}` : ""}
                  </span>
                  {r.destino && <span className="text-marinho-300">→ {r.destino}</span>}
                  {r.origem === "SEMANA" && <Badge variant="neutro">semana</Badge>}
                  {(r.socio_id === usuario.socioId || usuario.perfil === "admin") && r.fim >= h && (
                    <BotaoAcao acao="cancelar" id={r.id} rotulo="Cancelar" variant="fantasma" confirmar="Cancelar esta reserva?" />
                  )}
                </li>
              ))}
              {reservas.length === 0 && <li className="py-2 text-marinho-300">Nenhuma reserva no mês.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Bloqueios (admin) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="size-4" /> Avião indisponível
          </CardTitle>
          <CardDescription>Manutenção, documento vencido, avião fora da base. Bloqueio vence reserva.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {usuario.perfil === "admin" && <FormularioBloqueio hoje={h} />}
          <ul className="divide-y divide-marinho-100 text-sm dark:divide-marinho-300">
            {bloqueios.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 py-2">
                <Badge variant="erro">{ROTULO_BLOQUEIO[b.tipo]}</Badge>
                <span>
                  {fmtData(b.inicio)}
                  {b.fim !== b.inicio ? ` – ${fmtData(b.fim)}` : ""}
                </span>
                <span className="text-marinho-300">{b.motivo}</span>
                {usuario.perfil === "admin" && <BotaoAcao acao="removerBloqueio" id={b.id} rotulo="Remover" variant="fantasma" confirmar="Liberar o avião neste período?" />}
              </li>
            ))}
            {bloqueios.length === 0 && <li className="py-2 text-marinho-300">Nenhum bloqueio no mês.</li>}
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 text-xs text-marinho-300">
        {socios.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1">
            <span className="size-3 rounded-full" style={{ background: s.cor }} /> {s.apelido}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded bg-erro/70" /> indisponível
        </span>
      </div>
    </div>
  );
}

function Calendario({
  semanas,
  reservas,
  bloqueios,
  hoje,
  meuSocioId,
}: {
  semanas: Semana[];
  reservas: Reserva[];
  bloqueios: Bloqueio[];
  hoje: string;
  meuSocioId: string | null;
}) {
  if (semanas.length === 0) return null;
  const mes = semanas[0].mes.slice(0, 7);

  return (
    <div className="overflow-x-auto rounded-lg border border-marinho-100 dark:border-marinho-300">
      <table className="w-full min-w-[640px] border-collapse text-xs">
        <thead className="bg-areia-200 dark:bg-marinho-700">
          <tr>
            <th className="w-36 px-2 py-2 text-left font-semibold uppercase tracking-wide text-marinho-300">Semana</th>
            {DIAS.map((d) => (
              <th key={d} className="px-1 py-2 text-center font-semibold uppercase tracking-wide text-marinho-300">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((s) => (
            <tr key={s.id} className="border-t border-marinho-100 dark:border-marinho-300">
              <td className="px-2 py-2 align-top">
                {s.socio ? (
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <span className="size-3 rounded-full" style={{ background: s.cor ?? undefined }} /> {s.socio}
                    {s.socio_id === meuSocioId && <Badge variant="info">você</Badge>}
                  </span>
                ) : (
                  <span className="text-marinho-300">{s.cedida_por ? "cedida · livre" : "livre"}</span>
                )}
                <div className="text-[10px] text-marinho-300">
                  {fmtData(s.inicio)} – {fmtData(s.fim)}
                </div>
              </td>
              {Array.from({ length: 7 }, (_, i) => addDias(s.inicio, i)).map((dia) => {
                const b = bloqueios.find((x) => dia >= x.inicio && dia <= x.fim);
                const r = reservas.find((x) => dia >= x.inicio && dia <= x.fim);
                const foraDoMes = dia.slice(0, 7) !== mes;
                const passado = dia < hoje;
                return (
                  <td
                    key={dia}
                    className={cn(
                      "h-16 w-[12%] border-l border-marinho-100 p-1 align-top dark:border-marinho-300",
                      foraDoMes && "opacity-40",
                      passado && "bg-areia-200/60 dark:bg-marinho-700/40",
                      dia === hoje && "ring-2 ring-inset ring-laranja",
                    )}
                    style={!b && s.socio_id && !r ? { boxShadow: `inset 0 3px 0 ${s.cor}` } : undefined}
                  >
                    <div className="tabular text-right text-marinho-300">{Number(dia.slice(8, 10))}</div>
                    {b ? (
                      <div className="mt-1 rounded bg-erro/80 px-1 py-0.5 text-[10px] font-semibold leading-tight text-areia" title={b.motivo}>
                        {ROTULO_BLOQUEIO[b.tipo]}
                      </div>
                    ) : r ? (
                      <div className="mt-1 rounded px-1 py-0.5 text-[10px] font-semibold leading-tight text-areia" style={{ background: r.cor }} title={r.motivo ?? undefined}>
                        {r.socio}
                        {r.destino ? ` → ${r.destino}` : ""}
                      </div>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
