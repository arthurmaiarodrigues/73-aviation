import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, listarFornecedores, listarSocios } from "@/lib/dados/cadastros";
import { listarAbastecimentos } from "@/lib/dados/financeiro";
import { ROTULO_MOVIMENTO, movimentosDoTanque, retiradasRecentes, saldoDoTanque, saldoLitrosTanque, tanquePorSocio, usoDesdeUltimaCompra } from "@/lib/dados/tanque";
import { listarVoos } from "@/lib/dados/voos";
import { data as fmtData, hoje, inicioDoMes, litros as fmtLitros, mesPorExtenso, reais } from "@/lib/formato";
import { veValores } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha } from "@/components/ui/tabela";
import { BotaoApagarMovimento, FormularioTanque } from "./formulario-tanque";

export const metadata: Metadata = { title: "Combustível" };

export default async function PaginaCombustivel() {
  const usuario = await exigirSessao();
  const aeronave = await aeronaveAtiva();
  if (!veValores(usuario.perfil)) return <CombustivelPiloto aeronaveId={aeronave.id} capacidade={aeronave.capacidade_combustivel_l} />;
  const mes = inicioDoMes(hoje());
  const [saldo, movimentos, porSocio, socios, fornecedores, voos, fora] = await Promise.all([
    saldoDoTanque(aeronave.id),
    movimentosDoTanque(aeronave.id),
    tanquePorSocio(aeronave.id),
    listarSocios({ somenteAtivos: true }),
    listarFornecedores(),
    listarVoos(aeronave.id, {}, 20),
    listarAbastecimentos(aeronave.id, 50),
  ]);
  const pct = saldo.capacidade_l > 0 ? Math.min(100, (saldo.litros / saldo.capacidade_l) * 100) : 0;
  const desdeCompra = await usoDesdeUltimaCompra(aeronave.id, saldo.ultima_compra);
  const totalDesde = desdeCompra.reduce((t, l) => t + l.litros, 0);

  // Uso por sócio: no mês e no total (a parte da sociedade já dividida).
  const uso = socios.map((s) => {
    const linhas = porSocio.filter((l) => l.socio_id === s.id);
    const noMes = linhas.filter((l) => l.mes === mes);
    return {
      socio: s,
      mesLitros: noMes.reduce((t, l) => t + l.litros, 0),
      mesValor: noMes.reduce((t, l) => t + l.valor, 0),
      totalLitros: linhas.reduce((t, l) => t + l.litros, 0),
      totalValor: linhas.reduce((t, l) => t + l.valor, 0),
    };
  });
  const totalRetirado = uso.reduce((t, u) => t + u.totalLitros, 0);
  const foraDaBase = fora.filter((a) => a.origem === "POSTO").slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Combustível</h1>
          <p className="mt-1 text-sm text-marinho-300">Tanque do hangar: as retiradas registram o uso de cada sócio; a próxima compra de combustível é dividida na proporção desse uso.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secundario">
            <a href="/combustivel/exportar">
              <Download /> Excel
            </a>
          </Button>
          <Button asChild variant="fantasma">
            <Link href="/abastecimentos/novo">Abasteceu fora da base?</Link>
          </Button>
        </div>
      </div>

      {/* Tanque */}
      <Card className={cn(pct < 15 && "border-atencao")}>
        <CardHeader className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs uppercase tracking-wide text-marinho-300">Tanque do hangar</p>
            <p className="text-xs text-marinho-300">
              {saldo.ultima_compra ? `última compra ${fmtData(saldo.ultima_compra)}` : "nenhuma compra registrada"}
              {saldo.ultima_medicao ? ` · última medição ${fmtData(saldo.ultima_medicao)}` : ""}
            </p>
          </div>
          <CardTitle className="tabular text-3xl">
            {fmtLitros(saldo.litros)} <span className="text-base font-normal text-marinho-300">de {fmtLitros(saldo.capacidade_l)}</span>
          </CardTitle>
          <div className="h-2.5 w-full rounded bg-marinho-100 dark:bg-marinho-300">
            <div className={cn("h-2.5 rounded", pct < 15 ? "bg-atencao" : "bg-laranja")} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-marinho-300 tabular">
            {saldo.preco_litro !== null ? `${reais(saldo.preco_litro)} por litro · ${reais(saldo.valor_estoque)} em estoque` : "Registre a primeira compra para o tanque."}
            {pct < 15 && saldo.preco_litro !== null ? " · hora de comprar" : ""}
          </p>
        </CardHeader>
      </Card>

      <FormularioTanque
        socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))}
        fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nome }))}
        voos={voos.map((v) => ({ id: v.id, data: v.data, socio: v.socio, origem: v.origem, destino: v.destino }))}
        hoje={hoje()}
        socioLogadoId={usuario.socioId}
        saldoLitros={saldo.litros}
        precoLitro={saldo.preco_litro}
      />

      {/* Próxima compra */}
      <Card className="border-info">
        <CardHeader className="p-5">
          <p className="text-xs uppercase tracking-wide text-marinho-300">Como a próxima compra será dividida</p>
          <p className="text-sm text-marinho-300">
            Litros retirados {saldo.ultima_compra ? `desde a compra de ${fmtData(saldo.ultima_compra)}` : "até agora"}: <strong className="tabular">{fmtLitros(totalDesde)}</strong>
            {totalDesde === 0 ? " — sem retirada ainda; se comprar agora, divide igual." : ""}
          </p>
          {totalDesde > 0 && (
            <ul className="mt-2 grid gap-1 sm:grid-cols-4">
              {socios.map((s) => {
                const l = desdeCompra.find((x) => x.socio_id === s.id)?.litros ?? 0;
                return (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.cor }} />
                    <span className="flex-1 font-semibold">{s.apelido}</span>
                    <span className="tabular">{fmtLitros(l)}</span>
                    <span className="tabular w-12 text-right text-marinho-300">{((l / totalDesde) * 100).toFixed(0)} %</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardHeader>
      </Card>

      {/* Uso por sócio */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Uso do tanque por sócio</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {uso.map((u) => (
            <Card key={u.socio.id}>
              <CardHeader className="p-4">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: u.socio.cor }} />
                  <span className="text-sm font-semibold">{u.socio.apelido}</span>
                </div>
                <CardTitle className="tabular text-xl">{fmtLitros(u.mesLitros)}</CardTitle>
                <p className="text-xs text-marinho-300 tabular">{mesPorExtenso(mes)}</p>
                <div className="h-1.5 w-full rounded bg-marinho-100 dark:bg-marinho-300">
                  <div className="h-1.5 rounded" style={{ width: `${totalRetirado > 0 ? (u.totalLitros / totalRetirado) * 100 : 0}%`, background: u.socio.cor }} />
                </div>
                <p className="text-xs text-marinho-300 tabular">
                  total {fmtLitros(u.totalLitros)} · {totalRetirado > 0 ? ((u.totalLitros / totalRetirado) * 100).toFixed(0) : 0} % do uso
                </p>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>

      {/* Movimentos */}
      <div>
        <h2 className="mb-2 text-lg font-semibold">Movimentos do tanque</h2>
        <Tabela>
          <TabelaCabecalho>
            <tr>
              <Cabecalho>Data</Cabecalho>
              <Cabecalho>Movimento</Cabecalho>
              <Cabecalho>Quem</Cabecalho>
              <Cabecalho numerico>Litros</Cabecalho>
              <Cabecalho numerico>R$/L (compra)</Cabecalho>
              <Cabecalho numerico>Valor (compra)</Cabecalho>
              <Cabecalho numerico>Saldo</Cabecalho>
              <Cabecalho> </Cabecalho>
            </tr>
          </TabelaCabecalho>
          <TabelaCorpo>
            {movimentos.length === 0 && (
              <TabelaLinha>
                <Celula colSpan={8} className="text-marinho-300">Nenhum movimento ainda. Comece registrando a compra que encheu o tanque.</Celula>
              </TabelaLinha>
            )}
            {movimentos.map((m) => (
              <TabelaLinha key={m.id}>
                <Celula>{fmtData(m.data)}</Celula>
                <Celula>
                  {ROTULO_MOVIMENTO[m.tipo]}
                  {m.fornecedor ? ` · ${m.fornecedor}` : ""}
                  {m.observacao && m.observacao !== "DO TANQUE DO HANGAR" ? <span className="block text-xs text-marinho-300">{m.observacao}</span> : null}
                </Celula>
                <Celula>{m.tipo === "COMPRA" ? (m.socio ? `${m.socio} pagou` : "Caixa") : m.tipo === "RETIRADA" ? (m.socio ?? "Sociedade") : ""}</Celula>
                <Celula numerico className={cn(m.tipo === "RETIRADA" && "text-erro", m.tipo === "AJUSTE" && m.litros < 0 && "text-erro")}>
                  {m.tipo === "RETIRADA" ? "−" : m.tipo === "AJUSTE" && m.litros > 0 ? "+" : ""}
                  {fmtLitros(Math.abs(m.litros))}
                </Celula>
                <Celula numerico>{m.tipo === "COMPRA" && m.preco_litro !== null ? reais(m.preco_litro) : "—"}</Celula>
                <Celula numerico>{m.tipo === "COMPRA" && m.valor !== null ? reais(m.valor) : "—"}</Celula>
                <Celula numerico>{fmtLitros(m.saldo_litros)}</Celula>
                <Celula>
                  <BotaoApagarMovimento id={m.id} />
                </Celula>
              </TabelaLinha>
            ))}
          </TabelaCorpo>
        </Tabela>
      </div>

      {foraDaBase.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Abastecimentos fora da base</h2>
          <Tabela>
            <TabelaCabecalho>
              <tr>
                <Cabecalho>Data</Cabecalho>
                <Cabecalho>Onde</Cabecalho>
                <Cabecalho numerico>Litros</Cabecalho>
                <Cabecalho numerico>Valor</Cabecalho>
                <Cabecalho>Pagou</Cabecalho>
              </tr>
            </TabelaCabecalho>
            <TabelaCorpo>
              {foraDaBase.map((a) => (
                <TabelaLinha key={a.id}>
                  <Celula>{fmtData(a.data)}</Celula>
                  <Celula>{a.aerodromo ?? ""}</Celula>
                  <Celula numerico>{fmtLitros(a.litros)}</Celula>
                  <Celula numerico>{reais(a.valor)}</Celula>
                  <Celula>{a.pagador}</Celula>
                </TabelaLinha>
              ))}
            </TabelaCorpo>
          </Tabela>
        </div>
      )}
    </div>
  );
}

/** Piloto: quanto tem no tanque (litros), abastecer o avião e as últimas retiradas — sem nenhum valor. */
async function CombustivelPiloto({ aeronaveId, capacidade }: { aeronaveId: string; capacidade: number | null }) {
  const [litros, ultimas, socios, voos] = await Promise.all([saldoLitrosTanque(aeronaveId), retiradasRecentes(aeronaveId, 10), listarSocios({ somenteAtivos: true }), listarVoos(aeronaveId, {}, 20)]);
  const cap = 2000;
  const pct = Math.min(100, (litros / cap) * 100);
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Combustível</h1>
        <p className="mt-1 text-sm text-marinho-300">Abasteceu o avião pelo tanque do hangar? Lance os litros da bomba e para quem foi o voo.{capacidade ? ` O avião leva ${fmtLitros(capacidade)}.` : ""}</p>
      </div>
      <Card className={cn(pct < 15 && "border-atencao")}>
        <CardHeader className="p-5">
          <p className="text-xs uppercase tracking-wide text-marinho-300">Tanque do hangar</p>
          <CardTitle className="tabular text-3xl">
            {fmtLitros(litros)} <span className="text-base font-normal text-marinho-300">de {fmtLitros(cap)}</span>
          </CardTitle>
          <div className="h-2.5 w-full rounded bg-marinho-100 dark:bg-marinho-300">
            <div className={cn("h-2.5 rounded", pct < 15 ? "bg-atencao" : "bg-laranja")} style={{ width: `${pct}%` }} />
          </div>
          {pct < 15 && <p className="text-sm text-atencao">Tanque baixo — avise os sócios.</p>}
        </CardHeader>
      </Card>
      <FormularioTanque
        socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))}
        fornecedores={[]}
        voos={voos.map((v) => ({ id: v.id, data: v.data, socio: v.socio, origem: v.origem, destino: v.destino }))}
        hoje={hoje()}
        socioLogadoId={null}
        saldoLitros={litros}
        precoLitro={null}
        somenteRetirada
      />
      {ultimas.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Últimos abastecimentos pelo tanque</h2>
          <Tabela>
            <TabelaCabecalho>
              <tr>
                <Cabecalho>Data</Cabecalho>
                <Cabecalho>Por conta de</Cabecalho>
                <Cabecalho numerico>Litros</Cabecalho>
              </tr>
            </TabelaCabecalho>
            <TabelaCorpo>
              {ultimas.map((r) => (
                <TabelaLinha key={r.id}>
                  <Celula>{fmtData(r.data)}</Celula>
                  <Celula>{r.socio ?? "Sociedade"}</Celula>
                  <Celula numerico>{fmtLitros(r.litros)}</Celula>
                </TabelaLinha>
              ))}
            </TabelaCorpo>
          </Tabela>
        </div>
      )}
    </div>
  );
}
