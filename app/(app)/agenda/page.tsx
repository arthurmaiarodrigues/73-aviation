import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, ScrollText } from "lucide-react";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, aerodromosRecentes, listarSocios } from "@/lib/dados/cadastros";
import {
  ROTULO_BLOQUEIO,
  garantirEscolhaAberta,
  listarBloqueios,
  listarReservas,
  listarSemanas,
  mesAnterior,
  mesSeguinte,
  pedidosPendentes,
  tiposDoPeriodo,
  type Bloqueio,
  type Reserva,
  type Semana,
} from "@/lib/dados/agenda";
import { data as fmtData, hoje, mesPorExtenso } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BotaoAcao } from "./botoes";
import { FormularioBloqueio, FormularioEditarReserva, FormularioIndisponivel, FormularioReserva } from "./formularios";

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
  const socioLogado = usuario.socioId;
  const admin = usuario.perfil === "admin";
  const piloto = usuario.perfil === "piloto";

  await garantirEscolhaAberta(aeronave.id);

  const semanas = await listarSemanas(aeronave.id, mes);
  const de = semanas[0]?.inicio ?? mes;
  const ate = semanas[semanas.length - 1]?.fim ?? mes;
  const [reservas, bloqueios, socios, aerodromos, pedidos] = await Promise.all([
    listarReservas(aeronave.id, de, ate),
    listarBloqueios(aeronave.id, de, ate),
    listarSocios({ somenteAtivos: true }),
    aerodromosRecentes(aeronave.id),
    pedidosPendentes(aeronave.id),
  ]);

  const opcoesSocios = admin ? socios.map((so) => ({ id: so.id, apelido: so.apelido })) : undefined;
  const podeReservar = Boolean(socioLogado) || admin;
  // Direito do mês: uma semana (seg–qui) e um fim de semana (sex–dom) por sócio.
  const doMes = reservas.filter((r) => !r.pendente && r.inicio.slice(0, 7) === mes.slice(0, 7));
  const usou = (socioId: string, tipo: "SEMANA" | "FDS") => doMes.find((r) => r.socio_id === socioId && tiposDoPeriodo(r.inicio, r.fim).includes(tipo));
  const direitos = socios.map((so) => ({ socio: so, semana: usou(so.id, "SEMANA"), fds: usou(so.id, "FDS"), cor: so.cor }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Agenda</h1>
          <p className="text-sm text-marinho-300">Cada sócio tem por mês uma semana (seg–qui) e um fim de semana (sex–dom), nas datas que quiser e por ordem de chegada. Usado o direito, a próxima reserva é pedido com o OK dos outros.</p>
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

      {/* Pedidos aguardando os sócios */}
      {pedidos.length > 0 && (
        <Card className="border-atencao">
          <CardHeader>
            <CardTitle className="text-lg">Pedidos aguardando resposta</CardTitle>
            <CardDescription>
              Reserva feita depois de o sócio já ter usado o direito do mês. Qualquer &quot;preciso do avião&quot; cancela; todos concordando,
              confirma. Sem ninguém responder em 48 h, confirma sozinha — menos em feriado, que exige o OK de todos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-marinho-100 text-sm dark:divide-marinho-300">
              {pedidos.map((p) => {
                const minha = p.socio_id === socioLogado;
                const respondi = p.respostas.find((r) => r.socio_id === socioLogado);
                const outros = socios.filter((so) => so.id !== p.socio_id);
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="size-3 rounded-full" style={{ background: p.cor }} />
                    <span className="font-semibold">{p.socio}</span>
                    <span>
                      {fmtData(p.inicio)}
                      {p.fim !== p.inicio ? ` – ${fmtData(p.fim)}` : ""}
                    </span>
                    {p.destino && <span className="text-marinho-300">→ {p.destino}</span>}
                    {p.feriado && <Badge variant="atencao">feriado · precisa de todos</Badge>}
                    <span className="text-xs text-marinho-300">
                      {outros.map((so) => {
                        const r = p.respostas.find((x) => x.socio_id === so.id);
                        return `${so.apelido}: ${r ? (r.concorda ? "concorda" : "precisa") : "—"}`;
                      }).join(" · ")}
                    </span>
                    {!minha && socioLogado && !respondi && (
                      <>
                        <BotaoAcao acao="concordar" id={p.id} rotulo="Concordo" variant="secundario" />
                        <BotaoAcao acao="precisar" id={p.id} rotulo="Preciso do avião" variant="fantasma" confirmar="Isso cancela o pedido do sócio. Confirma?" />
                      </>
                    )}
                    {minha && <Badge variant="info">seu pedido</Badge>}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Calendário */}
      <Calendario semanas={semanas} reservas={reservas} bloqueios={bloqueios} hoje={h} meuSocioId={socioLogado} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Direito do mês */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Direito do mês</CardTitle>
            <CardDescription>
              Cada sócio marca, no mês, uma semana (seg–qui) e um fim de semana (sex–dom) — nas datas que quiser, por ordem de chegada. Usado o
              direito, a próxima reserva vira pedido aos outros.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {direitos.map((d) => (
                <li key={d.socio.id} className="flex flex-wrap items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: d.cor }} />
                  <span className="font-semibold">{d.socio.apelido}</span>
                  {d.semana ? (
                    <Badge variant="ok">
                      seg–qui {fmtData(d.semana.inicio)}
                      {d.semana.fim !== d.semana.inicio ? ` – ${fmtData(d.semana.fim)}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="neutro">semana livre</Badge>
                  )}
                  {d.fds ? (
                    <Badge variant="ok">
                      sex–dom {fmtData(d.fds.inicio)}
                      {d.fds.fim !== d.fds.inicio ? ` – ${fmtData(d.fds.fim)}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="neutro">fim de semana livre</Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Reservas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reservas do mês</CardTitle>
            <CardDescription>Com o direito do mês ainda não usado, a reserva confirma na hora. Direito já usado: vira pedido aos outros sócios. Até 60 dias à frente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {podeReservar ? <FormularioReserva hoje={h} aerodromos={aerodromos} socios={opcoesSocios} meuSocioId={socioLogado} /> : <p className="text-sm text-marinho-300">Só sócio reserva.</p>}
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
                  {r.origem === "SEMANA" && <Badge variant="neutro">bloco</Badge>}
                  {r.pendente && <Badge variant="atencao">pedido aguardando</Badge>}
                  {(r.socio_id === socioLogado || admin) && r.fim >= h && (
                    <BotaoAcao acao="cancelar" id={r.id} rotulo="Cancelar" variant="fantasma" confirmar="Cancelar esta reserva?" />
                  )}
                  {(r.socio_id === socioLogado || admin) && r.fim >= h && (
                    <details className="basis-full">
                      <summary className="cursor-pointer text-xs font-semibold text-laranja-700">editar</summary>
                      <FormularioEditarReserva
                        reserva={{ id: r.id, inicio: r.inicio, fim: r.fim, destino: r.destino, motivo: r.motivo, socio_id: r.socio_id }}
                        aerodromos={aerodromos}
                        socios={opcoesSocios}
                      />
                    </details>
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
          <CardDescription>Manutenção, documento vencido, avião fora da base, piloto indisponível. Bloqueio vence reserva.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {admin && <FormularioBloqueio hoje={h} />}
          {(piloto || admin) && (
            <details className="rounded border border-dashed border-marinho-300 p-3" open={piloto}>
              <summary className="cursor-pointer text-sm font-semibold text-laranja-700">Não vou estar disponível (recesso, férias, compromisso)</summary>
              <div className="mt-3">
                <FormularioIndisponivel hoje={h} />
              </div>
            </details>
          )}
          <ul className="divide-y divide-marinho-100 text-sm dark:divide-marinho-300">
            {bloqueios.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 py-2">
                <Badge variant="erro">{ROTULO_BLOQUEIO[b.tipo]}</Badge>
                <span>
                  {fmtData(b.inicio)}
                  {b.fim !== b.inicio ? ` – ${fmtData(b.fim)}` : ""}
                </span>
                <span className="text-marinho-300">{b.motivo}</span>
                {admin && b.tipo !== "PILOTO" && <BotaoAcao acao="removerBloqueio" id={b.id} rotulo="Remover" variant="fantasma" confirmar="Liberar o avião neste período?" />}
                {b.tipo === "PILOTO" && (admin || (piloto && b.piloto_id === usuario.pilotoId)) && (
                  <BotaoAcao acao="liberarIndisponivel" id={b.id} rotulo="Estou disponível" variant="fantasma" confirmar="Liberar estes dias?" />
                )}
              </li>
            ))}
            {bloqueios.length === 0 && <li className="py-2 text-marinho-300">Nenhum bloqueio no mês.</li>}
          </ul>
        </CardContent>
      </Card>

      {/* Regras */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScrollText className="size-4" /> Regras de uso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Cada sócio tem por mês <strong>uma semana (seg–qui)</strong> e <strong>um fim de semana (sex–dom)</strong>. Não existe semana de ninguém: você marca as datas que quiser.</li>
            <li><strong>Quem marca primeiro leva.</strong> Enquanto o direito daquele tipo não foi usado no mês, a reserva confirma na hora.</li>
            <li>Um período que pega dias de seg a qui usa a <strong>semana</strong>; dias de sex a dom usam o <strong>fim de semana</strong>. Um período que pega os dois usa os dois.</li>
            <li>Já usou o direito do mês? A reserva a mais é um <strong>pedido</strong>: os outros recebem aviso. Qualquer &quot;preciso do avião&quot; cancela; sem resposta em 48 h, confirma.</li>
            <li><strong>Feriado prolongado, Natal e Ano Novo</strong> só confirmam com o &quot;concordo&quot; de todos os outros sócios.</li>
            <li>Reservas só até <strong>60 dias</strong> à frente e no máximo 30 dias seguidos.</li>
            <li>Direito não usado no mês <strong>não acumula</strong>. Cancelar a reserva devolve o direito do mês.</li>
            <li>Manutenção, documento vencido e piloto indisponível <strong>bloqueiam</strong> a agenda e vencem qualquer reserva.</li>
          </ol>
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
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded border border-dashed border-marinho-300" /> pedido aguardando
        </span>
      </div>
    </div>
  );
}

/** Uma linha por semana civil (seg–dom), com os dois blocos: seg–qui e sex–dom. */
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
  const segundas = [...new Set(semanas.map((s) => (s.tipo === "SEMANA" ? s.inicio : addDias(s.inicio, -4))))].sort();

  return (
    <div className="overflow-x-auto rounded-lg border border-marinho-100 dark:border-marinho-300">
      <table className="w-full min-w-[640px] border-collapse text-xs">
        <thead className="bg-areia-200 dark:bg-marinho-700">
          <tr>
            <th className="w-40 px-2 py-2 text-left font-semibold uppercase tracking-wide text-marinho-300">Semana</th>
            {DIAS.map((d) => (
              <th key={d} className="px-1 py-2 text-center font-semibold uppercase tracking-wide text-marinho-300">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {segundas.map((seg) => {
            const semana = semanas.find((s) => s.tipo === "SEMANA" && s.inicio === seg);
            const fds = semanas.find((s) => s.tipo === "FDS" && s.inicio === addDias(seg, 4));
            return (
              <tr key={seg} className="border-t border-marinho-100 dark:border-marinho-300">
                <td className="px-2 py-2 align-top">
                  <div className="text-[11px] font-semibold leading-tight">
                    {fmtData(seg)} – {fmtData(addDias(seg, 6))}
                  </div>
                  <div className="text-[10px] text-marinho-300">seg–qui · sex–dom</div>
                </td>
                {Array.from({ length: 7 }, (_, i) => addDias(seg, i)).map((dia, i) => {
                  const bloco = i < 4 ? semana : fds;
                  const b = bloqueios.find((x) => dia >= x.inicio && dia <= x.fim);
                  const r = reservas.find((x) => !x.pendente && dia >= x.inicio && dia <= x.fim);
                  const pedido = reservas.find((x) => x.pendente && dia >= x.inicio && dia <= x.fim);
                  const foraDoMes = dia.slice(0, 7) !== mes;
                  const passado = dia < hoje;
                  return (
                    <td
                      key={dia}
                      className={cn(
                        "h-16 w-[12%] border-l border-marinho-100 p-1 align-top dark:border-marinho-300",
                        i === 4 && "border-l-2 border-l-marinho-300",
                        foraDoMes && "opacity-40",
                        passado && "bg-areia-200/60 dark:bg-marinho-700/40",
                        dia === hoje && "ring-2 ring-inset ring-laranja",
                      )}
                      style={!b && bloco?.socio_id && !r ? { boxShadow: `inset 0 3px 0 ${bloco.cor}` } : undefined}
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
                      ) : pedido ? (
                        <div className="mt-1 rounded border border-dashed px-1 py-0.5 text-[10px] font-semibold leading-tight" style={{ borderColor: pedido.cor, color: pedido.cor }} title="pedido aguardando os sócios">
                          {pedido.socio}?
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
