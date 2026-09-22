import type { Metadata } from "next";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, listarCategorias, listarSocios } from "@/lib/dados/cadastros";
import { urlDoComprovante } from "@/lib/dados/financeiro";
import { listarReembolsos } from "@/lib/dados/reembolsos";
import { data as fmtData, hoje, reais } from "@/lib/formato";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha } from "@/components/ui/tabela";
import { BotaoReembolsado, ConferirReembolso, FormularioReembolso } from "./formulario-reembolso";

export const metadata: Metadata = { title: "Reembolsos" };

/**
 * Piloto: lança o que pagou do bolso e acompanha. Sócio: vê o que deve ao
 * piloto e marca quando pagar. Admin: vê tudo.
 */
export default async function PaginaReembolsos() {
  const usuario = await exigirSessao();
  const aeronave = await aeronaveAtiva();
  const piloto = usuario.perfil === "piloto";
  const [reembolsos, socios, categorias] = await Promise.all([
    listarReembolsos(aeronave.id, usuario.perfil === "socio" && usuario.socioId ? { socioId: usuario.socioId, confirmados: true } : {}),
    listarSocios({ somenteAtivos: true }),
    piloto ? listarCategorias() : Promise.resolve([]),
  ]);
  const urls = piloto ? [] : await Promise.all(reembolsos.map((r) => urlDoComprovante(r.comprovante_path)));
  const aConferir = reembolsos.filter((r) => r.status === "PENDENTE");
  const pendentes = reembolsos.filter((r) => !r.reembolsado_em && r.status !== "PENDENTE");
  // o sócio vê a parte dele nos reembolsos de todos; piloto e admin veem o total
  const parte = (r: { socio_id: string | null; valor: number; partes: { socio_id: string; valor: number }[] }) =>
    usuario.perfil === "socio" && r.socio_id === null
      ? (r.partes.find((p) => p.socio_id === usuario.socioId)?.valor ?? 0)
      : r.valor;
  const totalPendente = pendentes.reduce((s, r) => s + parte(r), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Reembolsos ao piloto</h1>
        <p className="mt-1 text-sm text-marinho-300">
          {piloto
            ? "Pagou taxa de pouso, hangar, algo do avião? Lance aqui: por conta do sócio de quem era o voo, ou de todos os sócios quando for gasto da sociedade."
            : "O que o piloto pagou do bolso por conta de cada sócio. Quem deve paga direto ao piloto e marca aqui."}
        </p>
      </div>

      <Card className={pendentes.length > 0 ? "border-atencao" : undefined}>
        <CardHeader className="p-5">
          <p className="text-xs uppercase tracking-wide text-marinho-300">{piloto ? "A receber" : usuario.perfil === "socio" ? "Você deve ao piloto" : "Pendente de reembolso"}</p>
          <CardTitle className="tabular text-2xl">{reais(totalPendente)}</CardTitle>
          <p className="text-xs text-marinho-300">{pendentes.length === 0 ? "nada pendente" : `${pendentes.length} lançamento${pendentes.length === 1 ? "" : "s"}`}</p>
        </CardHeader>
      </Card>

      {aConferir.length > 0 && usuario.perfil === "admin" && (
        <p className="rounded border border-info/40 bg-info/10 p-3 text-sm">
          {aConferir.length === 1 ? "1 reembolso aguardando" : `${aConferir.length} reembolsos aguardando`} a sua conferência: veja a divisão na linha e confirme.
        </p>
      )}
      {aConferir.length > 0 && piloto && (
        <p className="rounded border border-info/40 bg-info/10 p-3 text-sm">
          {aConferir.length === 1 ? "1 lançamento seu está" : `${aConferir.length} lançamentos seus estão`} com o administrador para conferir a divisão.
        </p>
      )}
      {piloto && usuario.pilotoId && <FormularioReembolso socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))} categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))} hoje={hoje()} />}
      {piloto && !usuario.pilotoId && <p className="text-sm text-atencao">Seu login ainda não está ligado a um piloto do cadastro — peça ao administrador.</p>}

      <Tabela>
        <TabelaCabecalho>
          <tr>
            <Cabecalho>Data</Cabecalho>
            <Cabecalho>O que</Cabecalho>
            <Cabecalho>Sócio</Cabecalho>
            {!piloto && <Cabecalho>Piloto</Cabecalho>}
            <Cabecalho numerico>Valor</Cabecalho>
            <Cabecalho>Situação</Cabecalho>
          </tr>
        </TabelaCabecalho>
        <TabelaCorpo>
          {reembolsos.length === 0 && (
            <TabelaLinha>
              <Celula colSpan={6} className="text-marinho-300">Nenhum reembolso lançado.</Celula>
            </TabelaLinha>
          )}
          {reembolsos.map((r, i) => (
            <TabelaLinha key={r.id}>
              <Celula className="whitespace-nowrap">{fmtData(r.data)}</Celula>
              <Celula>
                {r.descricao.replace(/^REEMBOLSO PILOTO: /, "")}
                <span className="block text-xs text-marinho-300">
                  {r.categoria}
                  {r.observacao ? ` · ${r.observacao}` : ""}
                  {!piloto && urls[i] ? (
                    <>
                      {" · "}
                      <a href={urls[i]!} target="_blank" rel="noreferrer" className="text-laranja-700 hover:underline">
                        nota
                      </a>
                    </>
                  ) : null}
                </span>
              </Celula>
              <Celula>
                {r.socio}
                {r.socio_id === null && r.partes.length > 0 && (
                  <span className="block text-xs text-marinho-300">
                    {r.criterio === "POR_HORAS"
                      ? r.partes
                          .map((p) => `${socios.find((s) => s.id === p.socio_id)?.apelido ?? "?"} ${reais(p.valor)}`)
                          .join(" · ")
                      : `${reais(r.partes[0].valor)} cada`}
                  </span>
                )}
              </Celula>
              {!piloto && <Celula>{r.piloto}</Celula>}
              <Celula numerico className="font-semibold">{reais(r.valor)}</Celula>
              <Celula>
                <div className="flex flex-wrap items-center gap-2">
                  {r.status === "PENDENTE" ? (
                    <Badge variant="info">a conferir</Badge>
                  ) : r.reembolsado_em ? (
                    <Badge variant="ok">reembolsado {fmtData(r.reembolsado_em)}</Badge>
                  ) : (
                    <Badge variant="atencao">pendente</Badge>
                  )}
                  {r.status === "PENDENTE" && usuario.perfil === "admin" && (
                    <ConferirReembolso id={r.id} criterio={r.criterio} socioId={r.socio_id} socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))} />
                  )}
                  {r.status !== "PENDENTE" &&
                    (usuario.perfil === "admin" || r.socio_id === usuario.socioId || (r.socio_id === null && usuario.socioId) || r.piloto_id === usuario.pilotoId) && (
                      <BotaoReembolsado id={r.id} reembolsado={Boolean(r.reembolsado_em)} />
                    )}
                </div>
              </Celula>
            </TabelaLinha>
          ))}
        </TabelaCorpo>
      </Tabela>
    </div>
  );
}
