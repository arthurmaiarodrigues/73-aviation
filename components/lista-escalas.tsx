"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeletorAerodromo } from "@/components/seletor-aerodromo";
import { horas as fmtHoras, horasHm, lerHorasHm } from "@/lib/formato";

/**
 * Escalas de um voo (os pousos entre a origem e o destino), cada uma com o
 * mesmo preenchimento automático, mais as horas (h:mm) e o combustível na
 * decolagem de cada perna. Vai no formulário como campos `escala`,
 * `horas_perna` e `combustivel_perna` (um a mais que as escalas: a última
 * perna vai até o destino). O servidor lê com getAll.
 */
export function ListaEscalas({
  opcoes,
  iniciais = [],
  horasIniciais = [],
  combustivelIniciais = [],
  aoMudar,
}: {
  opcoes: string[];
  iniciais?: string[];
  horasIniciais?: number[];
  combustivelIniciais?: number[];
  /** (quantidade de escalas, soma das horas das pernas ou null se incompleta, combustível da 1ª decolagem ou null) */
  aoMudar?: (quantidade: number, totalHoras: number | null, combustivelInicial: number | null) => void;
}) {
  const [itens, setItens] = useState<{ chave: number; valor: string }[]>(iniciais.map((v, i) => ({ chave: i, valor: v })));
  const [proxima, setProxima] = useState(iniciais.length);
  const n0 = iniciais.length + 1;
  const [horas, setHoras] = useState<string[]>(() => Array.from({ length: n0 }, (_, i) => (horasIniciais[i] !== undefined ? horasHm(horasIniciais[i]).replace("h", ":") : "")));
  const [comb, setComb] = useState<string[]>(() => Array.from({ length: n0 }, (_, i) => (combustivelIniciais[i] !== undefined ? String(combustivelIniciais[i]).replace(".", ",") : "")));

  const numeros = horas.map((h) => lerHorasHm(h));
  const completa = itens.length > 0 && numeros.every((n) => n !== null && n > 0);
  const total = completa ? Math.round((numeros as number[]).reduce((s, n) => s + n, 0) * 10) / 10 : null;
  const combInicial = itens.length > 0 ? lerHorasHm(comb[0]) : null;

  useEffect(() => {
    aoMudar?.(itens.length, total, combInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens.length, total, combInicial]);

  function adicionar() {
    setItens((l) => [...l, { chave: proxima, valor: "" }]);
    setHoras((h) => [...h, ""]);
    setComb((c) => [...c, ""]);
    setProxima((n) => n + 1);
  }

  function remover(indice: number) {
    setItens((l) => l.filter((_, i) => i !== indice));
    setHoras((h) => h.filter((_, i) => i !== indice));
    setComb((c) => c.filter((_, i) => i !== indice));
  }

  const pernas = itens.length + 1;

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center justify-between">
        <Label>Escalas {itens.length > 0 && <span className="text-marinho-300">({itens.length})</span>}</Label>
        <Button type="button" variant="fantasma" size="pequeno" onClick={adicionar}>
          <Plus /> Adicionar escala
        </Button>
      </div>
      {itens.length === 0 && (
        <>
          <p className="text-xs text-marinho-300">Voo direto. Pousou no caminho? Adicione a escala — cada perna tem suas horas (h:mm) e o combustível na decolagem; os pousos e o total somam sozinhos.</p>
          <input type="hidden" name="horas_perna" value="" />
          <input type="hidden" name="combustivel_perna" value="" />
        </>
      )}
      {itens.length > 0 && (
        <div className="space-y-3 rounded-lg border border-marinho-100 p-3 dark:border-marinho-300">
          {Array.from({ length: pernas }, (_, i) => {
            const ultima = i === pernas - 1;
            return (
              <div key={ultima ? "destino" : itens[i].chave} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-marinho-300">
                    {i + 1}ª perna {ultima ? "· até o destino" : "· até a escala"}
                  </span>
                  {!ultima && (
                    <Button type="button" variant="fantasma" size="pequeno" onClick={() => remover(i)} aria-label="Tirar escala">
                      <X /> tirar
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_8rem_9rem]">
                  <div className="col-span-2 sm:col-span-1">
                    {ultima ? (
                      <p className="flex h-12 items-center rounded border border-dashed border-marinho-300 px-3 text-sm text-marinho-300">→ destino do voo</p>
                    ) : (
                      <SeletorAerodromo nome="escala" rotulo="" opcoes={opcoes} valorInicial={itens[i].valor} obrigatorio />
                    )}
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-marinho-300">horas (h:mm)</span>
                    <Input
                      name="horas_perna"
                      inputMode="numeric"
                      placeholder="1:30"
                      value={horas[i] ?? ""}
                      onChange={(e) => setHoras((h) => h.map((v, j) => (j === i ? e.target.value : v)))}
                      className="h-12 tabular"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-marinho-300">comb. decolagem (L)</span>
                    <Input
                      name="combustivel_perna"
                      inputMode="decimal"
                      placeholder="ex.: 195"
                      value={comb[i] ?? ""}
                      onChange={(e) => setComb((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
                      className="h-12 tabular"
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-right text-sm">
            Total das pernas: <strong className="tabular">{total !== null ? `${horasHm(total)} · ${fmtHoras(total)}` : "—"}</strong>
            {total === null && <span className="text-xs text-marinho-300"> (preencha as horas de todas as pernas)</span>}
          </p>
        </div>
      )}
    </div>
  );
}
