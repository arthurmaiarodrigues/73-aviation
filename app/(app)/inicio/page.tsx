import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Fuel, PlaneTakeoff, Receipt } from "lucide-react";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, listarSocios } from "@/lib/dados/cadastros";
import { horasPorSocio, horasPorSocioNoMes, listarVoos, trecho, ultimoHorimetro, vooEmAberto } from "@/lib/dados/voos";
import { saldoDoCaixa, saldoDoFundo, saldosDosSocios } from "@/lib/dados/financeiro";
import { ciclosRevisao, listarPlano, resumoManutencao } from "@/lib/dados/manutencao";
import { listarReembolsos } from "@/lib/dados/reembolsos";
import { ROTULO_BLOQUEIO, agendaDoDia, fila, garantirEscolhaAberta, mesSeguinte, proximasReservas, vezDeEscolher } from "@/lib/dados/agenda";
import { data as fmtData, horas as fmtHoras, horimetro as fmtHorimetro, hoje, inicioDoMes, mesPorExtenso, reais, trimestreDe } from "@/lib/formato";
import { veValores } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HorasPorSocio, type AbaHoras } from "@/components/horas-por-socio";
import { AtivarAvisos } from "@/components/ativar-avisos";

export const metadata: Metadata = { title: "Início" };

export default async function PaginaInicio({ searchParams }: { searchParams: Promise<{ "sem-acesso"?: string }> }) {
  const busca = await searchParams;
  const usuario = await exigirSessao();
  const aeronave = await aeronaveAtiva();
  const mes = inicioDoMes(hoje());
  const valores = veValores(usuario.perfil);

  const [ultimo, aberto, pendentes, ultimosVoos, socios, horasMes] = await Promise.all([
    ultimoHorimetro(aeronave.id),
    vooEmAberto(aeronave.id),
    listarVoos(aeronave.id, { pendentes: true }, 20),
    listarVoos(aeronave.id, {}, 5),
    listarSocios({ somenteAtivos: true }),
    horasPorSocioNoMes(aeronave.id, mes),
  ]);
  const [saldos, caixa, fundo] = valores ? await Promise.all([saldosDosSocios(), saldoDoCaixa(), saldoDoFundo(aeronave.id)]) : [[], null, null];

  // Agenda: quem está com o avião hoje e se é a minha vez de escolher.
  await garantirEscolhaAberta(aeronave.id);
  const mesProximo = mesSeguinte(mes);
  const [diaHoje, reservasProximas, vezAtual, vezProxima, filaAtual, filaProxima] = await Promise.all([
    agendaDoDia(aeronave.id, hoje()),
    proximasReservas(aeronave.id, 5),
    vezDeEscolher(aeronave.id, mes),
    vezDeEscolher(aeronave.id, mesProximo),
    fila(aeronave.id, mes),
    fila(aeronave.id, mesProximo),
  ]);
  const manutencao = await resumoManutencao(aeronave.id);
  // Reembolsos ao piloto pendentes: o sócio vê o que deve; o piloto, o que tem a receber.
  const reembolsosPendentes = await listarReembolsos(aeronave.id, { pendentes: true, socioId: usuario.perfil === "socio" ? (usuario.socioId ?? undefined) : undefined });
  const totalReembolsos = reembolsosPendentes.reduce((t, r) => t + r.valor, 0);

  // Horas por sócio: mês, trimestre e o ciclo de cada revisão (desde a última execução).
  const trimestre = trimestreDe(hoje());
  const [plano, ciclos] = await Promise.all([listarPlano(aeronave.id), ciclosRevisao(aeronave.id)]);
  const revisoes = plano.filter((p) => /^REVIS[ÃA]O \d+ ?H$/.test(p.descricao)).sort((a, b) => (a.intervalo_horas ?? 0) - (b.intervalo_horas ?? 0));
  const anteriores = revisoes.map((r) => ciclos.find((c) => c.plano_item_id === r.id)?.anterior ?? null);
  const [horasTrimestre, ...horasRevisoes] = await Promise.all([
    horasPorSocio(aeronave.id, trimestre.inicio, trimestre.fim),
    ...revisoes.map((r) => horasPorSocio(aeronave.id, r.ultima_data ?? "2000-01-01", "2099-12-31")),
    ...anteriores.map((c) => (c ? horasPorSocio(aeronave.id, c.inicio, c.fim) : Promise.resolve([]))),
  ]);
  const horasAnteriores = horasRevisoes.splice(revisoes.length);
  const linhas = (h: { socio_id: string; horas: number; custo?: number }[], comCusto: boolean) =>
    socios.map((s) => {
      const x = h.find((l) => l.socio_id === s.id);
      return { socio_id: s.id, apelido: s.apelido, cor: s.cor, horas: x?.horas ?? 0, custo: comCusto && valores ? (x?.custo ?? 0) : null };
    });
  const abasHoras: AbaHoras[] = [
    { chave: "mes", rotulo: "Mês", subtitulo: mesPorExtenso(mes), meta: null, linhas: linhas(horasMes, true) },
    { chave: "trimestre", rotulo: "Trimestre", subtitulo: trimestre.rotulo, meta: null, linhas: linhas(horasTrimestre, false) },
    ...revisoes.map((r, i) => ({
      chave: r.id,
      rotulo: r.descricao.replace("REVISÃO", "Revisão").replace(/(\d+) ?H$/, "$1 h"),
      subtitulo: r.ultima_data ? `desde a última revisão, em ${fmtData(r.ultima_data)}` : "desde o início (última execução não informada no plano)",
      meta: r.intervalo_horas,
      linhas: linhas(horasRevisoes[i], false),
      anterior: anteriores[i]
        ? {
            subtitulo: `Última revisão: voos de ${fmtData(anteriores[i].inicio)} a ${fmtData(anteriores[i].fim)} — é essa divisão que a nota da oficina usa nos itens por uso`,
            linhas: linhas(horasAnteriores[i], false),
          }
        : null,
    })),
  ];
  const minhaVezEm = [vezAtual === usuario.socioId && usuario.socioId ? mes : null, vezProxima === usuario.socioId && usuario.socioId ? mesProximo : null].filter(Boolean) as string[];
  const puladoEm = [filaAtual, filaProxima]
    .map((f, i) => (f.find((l) => l.socio_id === usuario.socioId && l.pulado && !l.semana_id) ? (i === 0 ? mes : mesProximo) : null))
    .filter(Boolean) as string[];

  const meuSaldo = saldos.find((s) => s.socio_id === usuario.socioId);
  const pendentesReais = pendentes.filter((v) => !(v.horimetro_final === null && v.horimetro_inicial !== null && v.id === aberto?.id));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Olá, {usuario.socioApelido ?? usuario.nome.split(" ")[0]}</h1>
          <p className="text-sm text-marinho-300">
            {aeronave.matricula} · {aeronave.modelo} · horímetro {fmtHorimetro(ultimo)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="campo" className="w-auto">
            <Link href={aberto && aberto.autor_id === usuario.id ? `/voos/${aberto.id}` : "/voos/novo"}>
              <Camera /> {aberto && aberto.autor_id === usuario.id ? "Registrar pouso" : "Registrar voo"}
            </Link>
          </Button>
          <Button asChild variant="secundario">
            <Link href="/combustivel">
              <Fuel /> Abastecer
            </Link>
          </Button>
          {valores && (
            <>
              <Button asChild variant="secundario">
                <Link href="/despesas/nova">
                  <Receipt /> Despesa
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {busca["sem-acesso"] && <Alerta tom="atencao">Essa tela é só para sócios e administrador.</Alerta>}
      <AtivarAvisos />

      {/* Disponibilidade: voo em aberto > bloqueio > reserva > semana > livre */}
      <Card className={cn(aberto || diaHoje?.bloqueio_id ? "border-atencao" : "border-ok")}>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <PlaneTakeoff className={cn("size-8", aberto || diaHoje?.bloqueio_id ? "text-atencao" : "text-ok")} />
          <div className="flex-1">
            {aberto ? (
              <>
                <p className="font-semibold">Avião em voo — {aberto.socio ?? "sociedade"}</p>
                <p className="text-sm text-marinho-300">
                  Decolou de {aberto.origem ?? "?"} em {fmtData(aberto.data)}
                  {aberto.destino ? ` para ${aberto.destino}` : ""}. Pouso ainda não registrado.
                </p>
              </>
            ) : diaHoje?.bloqueio_id ? (
              <>
                <p className="font-semibold">Avião indisponível — {ROTULO_BLOQUEIO[diaHoje.bloqueio_tipo ?? "OUTRO"]}</p>
                <p className="text-sm text-marinho-300">{diaHoje.bloqueio_motivo}</p>
              </>
            ) : diaHoje?.reserva_id ? (
              <>
                <p className="font-semibold">Hoje o avião é de {diaHoje.reserva_socio}</p>
                <p className="text-sm text-marinho-300">
                  Reservado{diaHoje.reserva_destino ? ` para ${diaHoje.reserva_destino}` : ""}
                  {diaHoje.reserva_origem === "SEMANA" ? " (semana dele)" : ""}.
                </p>
              </>
            ) : diaHoje?.semana_socio ? (
              <>
                <p className="font-semibold">Semana de {diaHoje.semana_socio} — sem reserva hoje</p>
                <p className="text-sm text-marinho-300">O titular tem preferência; combine com ele antes de usar.</p>
              </>
            ) : (
              <>
                <p className="font-semibold">Avião disponível na base</p>
                <p className="text-sm text-marinho-300">Ninguém reservou hoje. Quem reservar primeiro fica com ele.</p>
              </>
            )}
            {reservasProximas.length > 0 && (
              <p className="mt-2 text-xs text-marinho-300">
                Próximas: {reservasProximas.map((r) => `${fmtData(r.inicio)} ${r.socio}${r.destino ? ` → ${r.destino}` : ""}`).join(" · ")}
                {" · "}
                <Link href="/agenda" className="text-laranja-700 hover:underline">agenda</Link>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Manutenção e documentos */}
      {(manutencao.proximo || manutencao.documentosAlerta.length > 0 || (manutencao.semRegistro > 0 && usuario.perfil === "admin")) && (
        <Alerta tom={manutencao.proximo?.situacao === "VENCIDO" || manutencao.documentosAlerta.some((d) => d.situacao === "VENCIDO") ? "erro" : manutencao.proximo?.situacao === "AVISO" || manutencao.documentosAlerta.length > 0 ? "atencao" : "info"}>
          {manutencao.proximo && (
            <p>
              <span className="font-semibold">Próxima: {manutencao.proximo.descricao}</span>
              {manutencao.proximo.horas_restantes !== null && (manutencao.proximo.horas_restantes <= 0 ? ` — vencida há ${fmtHoras(-manutencao.proximo.horas_restantes)}` : ` em ${fmtHoras(manutencao.proximo.horas_restantes)}`)}
              {manutencao.proximo.dias_restantes !== null && (manutencao.proximo.dias_restantes <= 0 ? ` — vencida há ${-manutencao.proximo.dias_restantes} dias` : `${manutencao.proximo.horas_restantes !== null ? " ou" : ""} em ${manutencao.proximo.dias_restantes} dias`)}
            </p>
          )}
          {manutencao.documentosAlerta.map((d) => (
            <p key={d.id}>
              {d.tipo}: {d.situacao === "VENCIDO" ? `vencido há ${-d.dias_restantes} dias — bloqueia reserva` : `vence em ${d.dias_restantes} dias (${fmtData(d.vencimento)})`}
            </p>
          ))}
          {manutencao.semRegistro > 0 && usuario.perfil === "admin" && (
            <p className="text-xs">{manutencao.semRegistro} {manutencao.semRegistro === 1 ? "item" : "itens"} do plano sem última execução informada.</p>
          )}
          <Link href="/manutencao" className="text-sm underline">
            manutenção
          </Link>
        </Alerta>
      )}

      {reembolsosPendentes.length > 0 && (
        <Alerta tom="atencao">
          <p className="font-semibold">
            {usuario.perfil === "piloto"
              ? `Você tem ${reais(totalReembolsos)} a receber de reembolso (${reembolsosPendentes.map((r) => r.socio).filter((v, i, a) => a.indexOf(v) === i).join(", ")}).`
              : usuario.perfil === "socio"
                ? `Você deve ${reais(totalReembolsos)} ao piloto (${reembolsosPendentes.length} lançamento${reembolsosPendentes.length === 1 ? "" : "s"}).`
                : `${reais(totalReembolsos)} de reembolso ao piloto pendentes (${reembolsosPendentes.length}).`}
          </p>
          <Link href="/reembolsos" className="text-sm underline">
            reembolsos
          </Link>
        </Alerta>
      )}

      {(minhaVezEm.length > 0 || puladoEm.length > 0) && (
        <Alerta tom="atencao">
          <p className="font-semibold">
            {minhaVezEm.length > 0 ? `É a sua vez de escolher a semana de ${minhaVezEm.map(mesPorExtenso).join(" e ")}.` : `Você passou a vez em ${puladoEm.map(mesPorExtenso).join(" e ")}, mas ainda pode escolher entre as semanas livres.`}
          </p>
          <Link href={`/agenda?mes=${(minhaVezEm[0] ?? puladoEm[0]).slice(0, 7)}`} className="text-sm underline">
            escolher agora
          </Link>
        </Alerta>
      )}

      {/* Pendências */}
      {pendentesReais.length > 0 && (
        <Alerta tom="atencao">
          <p className="font-semibold">
            {pendentesReais.length} voo{pendentesReais.length === 1 ? "" : "s"} para conferir
          </p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {pendentesReais.slice(0, 5).map((v) => (
              <li key={v.id}>
                <Link href={`/voos/${v.id}`} className="underline">
                  {fmtData(v.data)} · {v.socio ?? "Sociedade"} · {trecho(v)}
                </Link>{" "}
                <span className="text-marinho-300">
                  {v.horimetro_final === null && v.horimetro_inicial !== null ? "sem pouso" : v.pendente_horimetro ? "horímetro pendente" : "rascunho"}
                </span>
              </li>
            ))}
          </ul>
          {pendentesReais.length > 5 && (
            <Link href="/voos?pendentes=1" className="mt-1 inline-block text-sm underline">
              ver todos
            </Link>
          )}
        </Alerta>
      )}

      {/* Horas por sócio: mês, trimestre e ciclo das revisões */}
      {usuario.perfil !== "piloto" && <HorasPorSocio abas={abasHoras} meuSocioId={usuario.socioId ?? null} />}

      {/* Financeiro (só quem vê valores) */}
      {valores && caixa && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="p-4">
              <p className="text-xs uppercase tracking-wide text-marinho-300">Meu saldo com a sociedade</p>
              <CardTitle className={cn("tabular text-xl", (meuSaldo?.saldo ?? 0) < 0 ? "text-erro" : "text-ok")}>{reais(meuSaldo?.saldo ?? 0)}</CardTitle>
              <Link href="/extratos" className="text-xs text-laranja-700 hover:underline">
                ver extrato
              </Link>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-4">
              <p className="text-xs uppercase tracking-wide text-marinho-300">Caixa da sociedade</p>
              <CardTitle className="tabular text-xl">{reais(caixa.saldo)}</CardTitle>
              <Link href="/aportes" className="text-xs text-laranja-700 hover:underline">
                aportes
              </Link>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-4">
              <p className="text-xs uppercase tracking-wide text-marinho-300">Fundo de reserva</p>
              <CardTitle className="tabular text-xl">{reais(fundo ?? 0)}</CardTitle>
              <p className="text-xs text-marinho-300">{reais(aeronave.fundo_reserva_por_hora)} por hora voada</p>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Últimos voos */}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Últimos voos</h2>
          <Link href="/voos" className="text-sm text-laranja-700 hover:underline">
            todos
          </Link>
        </div>
        <ul className="divide-y divide-marinho-100 rounded-lg border border-marinho-100 dark:divide-marinho-300 dark:border-marinho-300">
          {ultimosVoos.length === 0 && <li className="p-4 text-sm text-marinho-300">Nenhum voo registrado ainda.</li>}
          {ultimosVoos.map((v) => (
            <li key={v.id}>
              <Link href={`/voos/${v.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-areia-200 dark:hover:bg-marinho-700">
                <div>
                  <p className="text-sm font-semibold">{trecho(v)}</p>
                  <p className="text-xs text-marinho-300">
                    {fmtData(v.data)} · {v.socio ?? "Sociedade"}
                  </p>
                </div>
                <span className="tabular text-sm font-semibold">{fmtHoras(v.horas)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
