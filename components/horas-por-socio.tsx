"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { horas as fmtHoras, reais } from "@/lib/formato";
import { cn } from "@/lib/utils";

export type AbaHoras = {
  chave: string;
  rotulo: string;
  /** Ex.: "01/07 a 30/09/2026" ou "desde 15/09/2026". */
  subtitulo: string;
  /** Meta do ciclo (intervalo da revisão) para mostrar "12,3 de 50 h". */
  meta: number | null;
  linhas: { socio_id: string; apelido: string; cor: string; horas: number; custo: number | null }[];
};

/**
 * Horas por sócio no Início, em abas: mês, trimestre e o ciclo de cada
 * revisão (desde a última execução do item do plano). Os dados vêm prontos
 * do servidor; aqui só se troca a aba.
 */
export function HorasPorSocio({ abas, meuSocioId }: { abas: AbaHoras[]; meuSocioId: string | null }) {
  const [ativa, setAtiva] = useState(abas[0]?.chave);
  const aba = abas.find((a) => a.chave === ativa) ?? abas[0];
  if (!aba) return null;
  const total = aba.linhas.reduce((s, l) => s + l.horas, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex flex-wrap gap-1" role="tablist">
            {abas.map((a) => (
              <button
                key={a.chave}
                type="button"
                role="tab"
                aria-selected={a.chave === aba.chave}
                onClick={() => setAtiva(a.chave)}
                className={cn(
                  "rounded px-3 py-1.5 text-sm font-semibold transition-colors",
                  a.chave === aba.chave ? "bg-marinho text-areia dark:bg-laranja" : "text-marinho-300 hover:bg-areia-200 dark:hover:bg-marinho-700",
                )}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-marinho-300">{aba.subtitulo}</p>
        </div>
        <p className="tabular text-lg font-semibold">
          {fmtHoras(total)}
          {aba.meta !== null && <span className="text-sm font-normal text-marinho-300"> de {fmtHoras(aba.meta)}</span>}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {aba.linhas.map((l) => {
          const pct = total > 0 ? (l.horas / total) * 100 : 0;
          return (
            <Card key={l.socio_id}>
              <CardHeader className="p-4">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: l.cor }} />
                  <span className="text-sm font-semibold">{l.apelido}</span>
                  {l.socio_id === meuSocioId && <Badge variant="info">você</Badge>}
                </div>
                <CardTitle className="tabular text-xl">{fmtHoras(l.horas)}</CardTitle>
                <div className="h-1.5 w-full rounded bg-marinho-100 dark:bg-marinho-300">
                  <div className="h-1.5 rounded" style={{ width: `${pct}%`, background: l.cor }} />
                </div>
                <p className="text-xs text-marinho-300 tabular">
                  {pct.toFixed(0)} % do uso{l.custo !== null ? ` · ${reais(l.custo)} em rateios` : ""}
                </p>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
