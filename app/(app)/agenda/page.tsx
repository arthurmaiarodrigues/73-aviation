import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Lock, ScrollText } from "lucide-react";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, aerodromosRecentes, listarSocios } from "@/lib/dados/cadastros";
import {
  ROTULO_BLOCO,
  ROTULO_BLOQUEIO,
  fila,
  garantirEscolhaAberta,
  listarBloqueios,
  listarReservas,
  listarSemanas,
  listarTrocas,
  mesAnterior,
  mesSeguinte,
  pedidosPendentes,
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
import { FormularioBloqueio, FormularioEditarReserva, FormularioReserva } from "./formularios";
import { SeletorTroca } from "./seletor-troca";

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

  await garantirEscolhaAberta(aeronave.id);

  const semanas = await listarSemanas(aeronave.id, mes);
  const de = semanas[0]?.inicio ?? mes;
  const ate = semanas[semanas.length - 1]?.fim ?? mes;
  const [linhasFila, vez, reservas, bloqueios, socios, aerodromos, pedidos, trocas] = await Promise.all([
    fila(aeronave.id, mes),
    vezDeEscolher(aeronave.id, mes),
    listarReservas(aeronave.id, de, ate),
    listarBloqueios(aeronave.id, de, ate),
    listarSocios({ somenteAtivos: true }),
    aerodromosRecentes(aeronave.id),
    pedidosPendentes(aeronave.id),
    listarTrocas(aeronave.id),
  ]);

  const minhaVez = vez !== null && vez === socioLogado;
  const minhaLinha = linhasFila.find((l) => l.socio_id === socioLogado);
  const faltaSemana = Boolean(minhaLinha && !minhaLinha.semana_id);
  const faltaFds = Boolean(minhaLinha && !minhaLinha.fds_id);
  const possoEscolher = Boolean(minhaLinha && (faltaSemana || faltaFds) && (minhaVez || minhaLinha.pulado));
  const livres = (tipo: Semana["tipo"]) => semanas.filter((s) => s.tipo === tipo && !s.socio_id && s.fim >= h);
  const meusBlocos = semanas.filter((s) => s.socio_id === socioLogado && s.inicio >= h);
  const blocosDosOutros = (tipo: Semana["tipo"]) => semanas.filter((s) => s.tipo === tipo && s.socio_id && s.socio_id !== socioLogado && s.inicio >= h);
  const opcoesSocios = admin ? socios.map((so) => ({ id: so.id, apelido: so.apelido })) : undefined;
  const podeReservar = Boolean(socioLogado) || admin;
  const trocasParaMim = trocas.filter((t) => t.para_socio_id === socioLogado);
  const trocasMinhas = trocas.filter((t) => t.de_socio_id === socioLogado);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Agenda</h1>
          <p className="text-sm text-marinho-300">Cada sócio tem por mês uma semana (seg–qui) e um fim de semana (sex–dom). Reservou num bloco livre com o direito ainda não usado? O bloco vira seu. Além disso, é pedido com o OK dos outros.</p>
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
          <p className="font-semibold">
            {minhaVez ? "É a sua vez de escolher." : "Você passou a vez, mas ainda pode escolher entre o que sobrou."}
            {faltaSemana && faltaFds ? " Escolha uma semana e um fim de semana." : faltaSemana ? " Falta a sua semana (seg–qui)." : " Falta o seu fim de semana (sex–dom)."}
          </p>
          {minhaVez && minhaLinha?.prazo && <p className="text-xs">Prazo: {new Date(minhaLinha.prazo).toLocaleString("pt-BR", { timeZone: "America/Bahia" })}. Depois disso a vez passa para o próximo.</p>}
          {faltaSemana && (
            <div className="mt-2">
              <p className="text-xs font-semibold uppercase tracking-wide">Semanas livres (seg–qui)</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {livres("SEMANA").map((s) => (
                  <BotaoAcao key={s.id} acao="escolher" id={s.id} rotulo={`${fmtData(s.inicio)} – ${fmtData(s.fim)}`} />
                ))}
                {livres("SEMANA").length === 0 && <span className="text-sm">Nenhuma semana livre sobrou.</span>}
              </div>
            </div>
          )}
          {faltaFds && (
            <div className="mt-2">
              <p className="text-xs font-semibold uppercase tracking-wide">Fins de semana livres (sex–dom)</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {livres("FDS").map((s) => (
                  <BotaoAcao key={s.id} acao="escolher" id={s.id} rotulo={`${fmtData(s.inicio)} – ${fmtData(s.fim)}`} />
                ))}
                {livres("FDS").length === 0 && <span className="text-sm">Nenhum fim de semana livre sobrou.</span>}
              </div>
            </div>
          )}
        </Alerta>
      )}

      {/* Pedidos aguardando os sócios */}
      {pedidos.length > 0 && (
        <Card className="border-atencao">
          <CardHeader>
            <CardTitle className="text-lg">Pedidos aguardando resposta</CardTitle>
            <CardDescription>Reserva além do direito do mês do sócio. Dia comum: sem objeção em 48 h, confirma. Feriado: só com o OK de todos.</CardDescription>
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

      {/* Trocas */}
      {(trocasParaMim.length > 0 || trocasMinhas.length > 0 || (admin && trocas.length > 0)) && (
        <Card className="border-info">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ArrowLeftRight className="size-4" /> Trocas propostas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-marinho-100 text-sm dark:divide-marinho-300">
              {trocas.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-semibold">{t.de}</span>
                  <span>
                    dá {fmtData(t.bloco_de.inicio)} – {fmtData(t.bloco_de.fim)} e recebe {fmtData(t.bloco_para.inicio)} – {fmtData(t.bloco_para.fim)} de
                  </span>
                  <span className="font-semibold">{t.para}</span>
                  <span className="text-xs text-marinho-300">({ROTULO_BLOCO[t.bloco_de.tipo]})</span>
                  {t.para_socio_id === socioLogado && (
                    <>
                      <BotaoAcao acao="aceitarTroca" id={t.id} rotulo="Aceitar" variant="secundario" />
                      <BotaoAcao acao="recusarTroca" id={t.id} rotulo="Recusar" variant="fantasma" />
                    </>
                  )}
                  {t.de_socio_id === socioLogado && <BotaoAcao acao="recusarTroca" id={t.id} rotulo="Cancelar proposta" variant="fantasma" />}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Calendário */}
      <Calendario semanas={semanas} reservas={reservas} bloqueios={bloqueios} hoje={h} meuSocioId={socioLogado} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fila de escolha */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Escolha do mês</CardTitle>
            <CardDescription>Ordem por menos uso nos 3 meses anteriores (dias reservados + horas voadas). 48 h para escolher; quem não escolhe passa a vez.</CardDescription>
          </CardHeader>
          <CardContent>
            {linhasFila.length === 0 ? (
              <p className="text-sm text-marinho-300">A escolha deste mês abre no dia 15 do mês anterior.</p>
            ) : (
              <ol className="space-y-2">
                {linhasFila.map((l) => {
                  const semana = semanas.find((s) => s.id === l.semana_id);
                  const fds = semanas.find((s) => s.id === l.fds_id);
                  const ehVez = vez === l.socio_id;
                  const completo = Boolean(l.semana_id && l.fds_id);
                  const meu = l.socio_id === socioLogado || admin;
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-5 text-right text-marinho-300">{l.ordem}.</span>
                      <span className="size-3 rounded-full" style={{ background: l.cor }} />
                      <span className="font-semibold">{l.apelido}</span>
                      <span className="text-xs text-marinho-300">
                        {l.dias_base} {l.dias_base === 1 ? "dia" : "dias"} + {fmtHoras(l.horas_base)}
                      </span>
                      {semana && (
                        <Badge variant="ok">
                          seg–qui {fmtData(semana.inicio)} – {fmtData(semana.fim)}
                        </Badge>
                      )}
                      {fds && (
                        <Badge variant="ok">
                          sex–dom {fmtData(fds.inicio)} – {fmtData(fds.fim)}
                        </Badge>
                      )}
                      {!completo && (ehVez ? <Badge variant="atencao">é a vez</Badge> : l.pulado ? <Badge variant="neutro">passou a vez</Badge> : <Badge variant="info">aguardando</Badge>)}
                      {semana && meu && semana.fim >= h && <BotaoAcao acao="ceder" id={semana.id} rotulo="Ceder semana" variant="fantasma" confirmar="Devolver a semana ao pool?" />}
                      {fds && meu && fds.fim >= h && <BotaoAcao acao="ceder" id={fds.id} rotulo="Ceder fim de semana" variant="fantasma" confirmar="Devolver o fim de semana ao pool?" />}
                    </li>
                  );
                })}
              </ol>
            )}
            {meusBlocos.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-marinho-100 pt-3 text-sm dark:border-marinho-300">
                <p className="text-xs font-semibold uppercase tracking-wide text-marinho-300">Trocar um período meu com outro sócio</p>
                {meusBlocos.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center gap-2">
                    <span>
                      {ROTULO_BLOCO[b.tipo]} {fmtData(b.inicio)} – {fmtData(b.fim)}
                    </span>
                    <SeletorTroca meuBloco={b.id} opcoes={blocosDosOutros(b.tipo).map((o) => ({ id: o.id, inicio: o.inicio, fim: o.fim, socio: o.socio ?? "" }))} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reservas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reservas do mês</CardTitle>
            <CardDescription>Bloco livre com o seu direito do mês ainda não usado: confirma na hora e o bloco vira seu. Direito já usado: vira pedido aos outros sócios. Até 60 dias à frente.</CardDescription>
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
          <CardDescription>Manutenção, documento vencido, avião fora da base. Bloqueio vence reserva.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {admin && <FormularioBloqueio hoje={h} />}
          <ul className="divide-y divide-marinho-100 text-sm dark:divide-marinho-300">
            {bloqueios.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 py-2">
                <Badge variant="erro">{ROTULO_BLOQUEIO[b.tipo]}</Badge>
                <span>
                  {fmtData(b.inicio)}
                  {b.fim !== b.inicio ? ` – ${fmtData(b.fim)}` : ""}
                </span>
                <span className="text-marinho-300">{b.motivo}</span>
                {admin && <BotaoAcao acao="removerBloqueio" id={b.id} rotulo="Remover" variant="fantasma" confirmar="Liberar o avião neste período?" />}
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
            <li>Cada sócio tem por mês <strong>uma semana (seg–qui)</strong> e <strong>um fim de semana (sex–dom)</strong>, escolhidos na fila.</li>
            <li>A ordem da fila é por <strong>menos uso</strong> nos 3 meses anteriores: dias reservados + horas voadas. Empate: quem escolheu por último fica atrás.</li>
            <li>A escolha abre no dia 15 do mês anterior; cada um tem <strong>48 h</strong> na sua vez. Quem não escolhe passa a vez e pega o que sobrar.</li>
            <li>Reservar dias de um bloco <strong>livre</strong> quando você ainda não usou o direito daquele tipo no mês confirma na hora — o bloco passa a ser seu (vale como a sua escolha).</li>
            <li>Já usou o direito do mês? Reserva a mais é um <strong>pedido</strong>: os outros sócios recebem aviso. Sem ninguém dizer "preciso" em 48 h, confirma.</li>
            <li><strong>Feriado prolongado, Natal e Ano Novo</strong> só confirmam com o "concordo" de todos os outros sócios.</li>
            <li>Reservas só até <strong>60 dias</strong> à frente e no máximo 30 dias seguidos.</li>
            <li>Sócios podem <strong>trocar</strong> períodos entre si (semana por semana, fim de semana por fim de semana): um propõe, o outro aceita.</li>
            <li>Bloco cedido volta ao pool; bloco não usado não acumula. Manutenção e documento vencido bloqueiam a agenda e vencem qualquer reserva.</li>
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

  const Dono = ({ b, rotulo }: { b: Semana | undefined; rotulo: string }) => (
    <div className="text-[11px] leading-tight">
      <span className="text-marinho-300">{rotulo} </span>
      {b?.socio ? (
        <span className="inline-flex items-center gap-1 font-semibold">
          <span className="size-2.5 rounded-full" style={{ background: b.cor ?? undefined }} /> {b.socio}
          {b.socio_id === meuSocioId && <Badge variant="info">você</Badge>}
        </span>
      ) : (
        <span className="text-marinho-300">{b?.cedida_por ? "cedido · livre" : "livre"}</span>
      )}
    </div>
  );

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
                <td className="space-y-1 px-2 py-2 align-top">
                  <Dono b={semana} rotulo="seg–qui" />
                  <Dono b={fds} rotulo="sex–dom" />
                  <div className="text-[10px] text-marinho-300">
                    {fmtData(seg)} – {fmtData(addDias(seg, 6))}
                  </div>
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
