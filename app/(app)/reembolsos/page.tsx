import type { Metadata } from "next";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, listarCategorias, listarSocios } from "@/lib/dados/cadastros";
import { urlDoComprovante } from "@/lib/dados/financeiro";
import { devidoPorSocio, listarReembolsos } from "@/lib/dados/reembolsos";
import { hoje, reais } from "@/lib/formato";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioReembolso } from "./formulario-reembolso";
import { TabelaReembolsos } from "./tabela-reembolsos";
import { DevidoPorSocio } from "./por-socio";

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

  // Quanto cada sócio ainda deve ao piloto (e o que já pagou).
  const confirmados = reembolsos.filter((r) => r.status !== "PENDENTE");
  const devido = devidoPorSocio(confirmados);
  const pagoDe = (id: string) =>
    confirmados.reduce((t, r) => t + (r.pagos.includes(id) ? (r.partes.find((x) => x.socio_id === id)?.valor ?? 0) : 0), 0);
  const porSocio = socios
    .map((s) => ({
      socio_id: s.id,
      apelido: s.apelido,
      devido: devido.find((d) => d.socio_id === s.id)?.valor ?? 0,
      itens: devido.find((d) => d.socio_id === s.id)?.itens ?? 0,
      pago: Math.round(pagoDe(s.id) * 100) / 100,
    }))
    .filter((l) => l.devido > 0 || l.pago > 0);
  const pix = confirmados.find((r) => r.pix)?.pix ?? null;
  const nomePiloto = confirmados[0]?.piloto ?? "";

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

      {aConferir.length > 0 && piloto && (
        <p className="rounded border border-info/40 bg-info/10 p-3 text-sm">
          {aConferir.length === 1 ? "1 lançamento seu está" : `${aConferir.length} lançamentos seus estão`} com o administrador para conferir a divisão.
        </p>
      )}
      {piloto && usuario.pilotoId && (
        <FormularioReembolso
          socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))}
          categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))}
          hoje={hoje()}
          cidadeInicial={reembolsos[0]?.cidade ?? null}
        />
      )}
      {piloto && !usuario.pilotoId && <p className="text-sm text-atencao">Seu login ainda não está ligado a um piloto do cadastro — peça ao administrador.</p>}

      {porSocio.length > 0 && (
        <DevidoPorSocio
          linhas={porSocio}
          pix={pix}
          piloto={nomePiloto}
          podeMarcar={usuario.perfil === "admin" || piloto}
          meuSocioId={usuario.socioId ?? null}
        />
      )}

      <TabelaReembolsos
        itens={reembolsos.map((r, i) => ({
          id: r.id,
          data: r.data,
          descricao: r.descricao.replace(/^REEMBOLSO PILOTO: /, ""),
          categoria: r.categoria,
          cidade: r.cidade,
          observacao: r.observacao,
          valor: r.valor,
          socio_id: r.socio_id,
          socio: r.socio,
          piloto: r.piloto,
          piloto_id: r.piloto_id,
          criterio: r.criterio,
          status: r.status,
          reembolsado_em: r.reembolsado_em,
          partes: r.partes,
          nota: urls[i] ?? null,
        }))}
        perfil={usuario.perfil}
        socioId={usuario.socioId ?? null}
        pilotoId={usuario.pilotoId ?? null}
        socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))}
      />
    </div>
  );
}
