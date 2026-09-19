"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeletorAerodromo } from "@/components/seletor-aerodromo";
import { horas as fmtHoras } from "@/lib/formato";

/**
 * Escalas de um voo (os pousos entre a origem e o destino), cada uma com o
 * mesmo preenchimento automático, e as horas de cada perna. Vai no
 * formulário como campos `escala` e `horas_perna` (um a mais que as
 * escalas: a última perna vai até o destino). O servidor lê com getAll.
 */
export function ListaEscalas({
  opcoes,
  iniciais = [],
  horasIniciais = [],
  aoMudar,
}: {
  opcoes: string[];
  iniciais?: string[];
  horasIniciais?: number[];
  /** (quantidade de escalas, soma das horas das pernas ou null se incompleta) */
  aoMudar?: (quantidade: number, totalHoras: number | null) => void;
}) {
  const [itens, setItens] = useState<{ chave: number; valor: string }[]>(iniciais.map((v, i) => ({ chave: i, valor: v })));
  const [proxima, setProxima] = useState(iniciais.length);
  const [horas, setHoras] = useState<string[]>(() => {
    const n = iniciais.length + 1;
    return Array.from({ length: n }, (_, i) => (horasIniciais[i] !== undefined ? String(horasIniciais[i]).replace(".", ",") : ""));
  });

  const numeros = horas.map((h) => Number(h.replace(/\./g, "").replace(",", ".")));
  const completa = itens.length > 0 && numeros.every((n) => Number.isFinite(n) && n > 0);
  const total = completa ? Math.round(numeros.reduce((s, n) => s + n, 0) * 10) / 10 : null;

  useEffect(() => {
    aoMudar?.(itens.length, total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens.length, total]);

  function adicionar() {
    setItens((l) => [...l, { chave: proxima, valor: "" }]);
    setHoras((h) => [...h, ""]);
    setProxima((n) => n + 1);
  }

  function remover(indice: number) {
    setItens((l) => l.filter((_, i) => i !== indice));
    setHoras((h) => h.filter((_, i) => i !== indice));
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
          <p className="text-xs text-marinho-300">Voo direto. Pousou no caminho? Adicione a escala — os pousos são contados sozinhos e as horas de cada perna somam o total.</p>
          <input type="hidden" name="horas_perna" value="" />
        </>
      )}
      {itens.length > 0 && (
        <div className="space-y-2 rounded-lg border border-marinho-100 p-3 dark:border-marinho-300">
          {Array.from({ length: pernas }, (_, i) => {
            const ultima = i === pernas - 1;
            return (
              <div key={ultima ? "destino" : itens[i].chave} className="grid grid-cols-[auto_1fr_7rem_auto] items-end gap-2">
                <span className="pb-3 text-xs text-marinho-300">{i + 1}ª perna</span>
                {ultima ? (
                  <p className="flex h-12 items-center rounded border border-dashed border-marinho-300 px-3 text-sm text-marinho-300">→ destino</p>
                ) : (
                  <SeletorAerodromo nome="escala" rotulo="" opcoes={opcoes} valorInicial={itens[i].valor} obrigatorio />
                )}
                <div className="space-y-1">
                  {i === 0 && <span className="text-xs text-marinho-300">horas</span>}
                  <Input
                    name="horas_perna"
                    inputMode="decimal"
                    placeholder="1,2"
                    value={horas[i] ?? ""}
                    onChange={(e) => setHoras((h) => h.map((v, j) => (j === i ? e.target.value : v)))}
                    className="h-12 tabular"
                  />
                </div>
                {ultima ? (
                  <span className="w-10" />
                ) : (
                  <Button type="button" variant="fantasma" size="icone" onClick={() => remover(i)} aria-label="Tirar escala" className="mb-0.5">
                    <X />
                  </Button>
                )}
              </div>
            );
          })}
          <p className="text-right text-sm">
            Total das pernas: <strong className="tabular">{total !== null ? fmtHoras(total) : "—"}</strong>
            {total === null && <span className="text-xs text-marinho-300"> (preencha as horas de todas as pernas)</span>}
          </p>
        </div>
      )}
    </div>
  );
}
