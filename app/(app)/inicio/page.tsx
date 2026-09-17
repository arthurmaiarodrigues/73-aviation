import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Fuel, PlaneTakeoff, Receipt } from "lucide-react";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, listarSocios } from "@/lib/dados/cadastros";
import { horasPorSocioNoMes, listarVoos, ultimoHorimetro, vooEmAberto } from "@/lib/dados/voos";
import { saldoDoCaixa, saldoDoFundo, saldosDosSocios } from "@/lib/dados/financeiro";
import { data as fmtData, horas as fmtHoras, horimetro as fmtHorimetro, hoje, inicioDoMes, mesPorExtenso, reais } from "@/lib/formato";
import { veValores } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  const meuSaldo = saldos.find((s) => s.socio_id === usuario.socioId);
  const totalHorasMes = horasMes.reduce((s, h) => s + h.horas, 0);
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
          {valores && (
            <>
              <Button asChild variant="secundario">
                <Link href="/abastecimentos/novo">
                  <Fuel /> Abastecer
                </Link>
              </Button>
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

      {/* Disponibilidade */}
      <Card className={cn(aberto ? "border-atencao" : "border-ok")}>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <PlaneTakeoff className={cn("size-8", aberto ? "text-atencao" : "text-ok")} />
          <div className="flex-1">
            {aberto ? (
              <>
                <p className="font-semibold">Avião em voo — {aberto.socio ?? "sociedade"}</p>
                <p className="text-sm text-marinho-300">
                  Decolou de {aberto.origem ?? "?"} em {fmtData(aberto.data)}
                  {aberto.destino ? ` para ${aberto.destino}` : ""}. Pouso ainda não registrado.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Avião disponível na base</p>
                <p className="text-sm text-marinho-300">Nenhum voo em aberto. A agenda de semanas chega na Fase 2.</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

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
                  {fmtData(v.data)} · {v.socio ?? "Sociedade"} · {v.origem ?? "?"} → {v.destino ?? "?"}
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

      {/* Horas do mês */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          {mesPorExtenso(mes)} · {fmtHoras(totalHorasMes)}
        </h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {socios.map((s) => {
            const h = horasMes.find((x) => x.socio_id === s.id);
            const horasSocio = h?.horas ?? 0;
            const pct = totalHorasMes > 0 ? (horasSocio / totalHorasMes) * 100 : 0;
            return (
              <Card key={s.id}>
                <CardHeader className="p-4">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full" style={{ background: s.cor }} />
                    <span className="text-sm font-semibold">{s.apelido}</span>
                    {s.id === usuario.socioId && <Badge variant="info">você</Badge>}
                  </div>
                  <CardTitle className="tabular text-xl">{fmtHoras(horasSocio)}</CardTitle>
                  <div className="h-1.5 w-full rounded bg-marinho-100 dark:bg-marinho-300">
                    <div className="h-1.5 rounded" style={{ width: `${pct}%`, background: s.cor }} />
                  </div>
                  <p className="text-xs text-marinho-300 tabular">
                    {pct.toFixed(0)} % do uso{valores && h ? ` · ${reais(h.custo)} em rateios` : ""}
                  </p>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>

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
                  <p className="text-sm font-semibold">
                    {v.origem ?? "?"} → {v.destino ?? "?"}
                  </p>
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
