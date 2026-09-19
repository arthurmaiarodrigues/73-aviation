import type { Metadata } from "next";
import { NotebookPen } from "lucide-react";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { ROTULO_GRAVIDADE, listarAnotacoes, urlDaAnotacao } from "@/lib/dados/anotacoes";
import { ultimoHorimetro } from "@/lib/dados/voos";
import { data as fmtData, hoje, horimetro as fmtHorimetro } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BotoesAnotacao, FormularioAnotacao } from "./componentes";

export const metadata: Metadata = { title: "Anotações" };

const BADGE = { URGENTE: "erro", ATENCAO: "atencao", OBSERVACAO: "info" } as const;

/**
 * Anotações de problemas na aeronave: o piloto e o admin registram o que
 * viram (com foto); vira a lista para a próxima revisão. Sócios leem.
 */
export default async function PaginaAnotacoes() {
  const usuario = await exigirSessao();
  const aeronave = await aeronaveAtiva();
  const anota = usuario.perfil === "admin" || usuario.perfil === "piloto";
  const [lista, horimetro] = await Promise.all([listarAnotacoes(aeronave.id), ultimoHorimetro(aeronave.id)]);
  const urls = await Promise.all(lista.map((a) => urlDaAnotacao(a.foto_path)));
  const abertas = lista.filter((a) => !a.resolvida_em);
  const resolvidas = lista.filter((a) => a.resolvida_em);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Anotações da aeronave</h1>
        <p className="mt-1 text-sm text-marinho-300">Problemas e observações para a próxima revisão. Urgente avisa os sócios na hora.</p>
      </div>

      {anota && (
        <Card className="border-laranja">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <NotebookPen className="size-4" /> Nova anotação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioAnotacao hoje={hoje()} horimetro={horimetro} />
          </CardContent>
        </Card>
      )}

      <Card className={cn(abertas.some((a) => a.gravidade === "URGENTE") && "border-erro")}>
        <CardHeader>
          <CardTitle className="text-lg">Para a próxima revisão {abertas.length > 0 && <span className="text-marinho-300">({abertas.length})</span>}</CardTitle>
          <CardDescription>Leve esta lista para a oficina. Ao resolver, marque aqui.</CardDescription>
        </CardHeader>
        <CardContent>
          {abertas.length === 0 && <p className="text-sm text-marinho-300">Nenhuma anotação aberta.</p>}
          <ul className="divide-y divide-marinho-100 dark:divide-marinho-300">
            {abertas.map((a) => {
              const url = urls[lista.indexOf(a)];
              return (
                <li key={a.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={BADGE[a.gravidade]}>{ROTULO_GRAVIDADE[a.gravidade]}</Badge>
                    <span className="text-marinho-300">
                      {fmtData(a.data)}
                      {a.horimetro !== null ? ` · ${fmtHorimetro(a.horimetro)} h` : ""}
                      {a.autor ? ` · ${a.autor.split(" ")[0]}` : ""}
                    </span>
                  </div>
                  <p className="font-semibold">{a.descricao}</p>
                  {url && (
                    <a href={url} target="_blank" rel="noreferrer" className="inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="max-h-40 rounded border border-marinho-100 dark:border-marinho-300" />
                    </a>
                  )}
                  {anota && <BotoesAnotacao id={a.id} resolvida={false} />}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {resolvidas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resolvidas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-marinho-100 text-sm dark:divide-marinho-300">
              {resolvidas.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="text-marinho-300">{fmtData(a.data)}</span>
                  <span className="line-through decoration-marinho-300">{a.descricao}</span>
                  <Badge variant="ok">resolvida {fmtData(a.resolvida_em)}</Badge>
                  {a.resolucao && <span className="text-xs text-marinho-300">{a.resolucao}</span>}
                  {anota && <BotoesAnotacao id={a.id} resolvida />}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
