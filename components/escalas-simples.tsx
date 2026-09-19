"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Label } from "@/components/ui/label";
import { SeletorAerodromo } from "@/components/seletor-aerodromo";

/**
 * Escalas de um trecho (pousos entre a origem e o destino), só o aeródromo.
 * Vai no formulário como vários campos `nome`; o servidor lê com getAll.
 */
export function EscalasSimples({ nome, opcoes, aoMudar }: { nome: string; opcoes: string[]; aoMudar?: (quantidade: number) => void }) {
  const [itens, setItens] = useState<number[]>([]);
  const [proxima, setProxima] = useState(0);

  function mudar(lista: number[]) {
    setItens(lista);
    aoMudar?.(lista.length);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Label>Escala{itens.length > 1 ? "s" : ""}</Label>
        {itens.length === 0 && <span className="text-xs text-marinho-300">voo direto</span>}
        <button
          type="button"
          onClick={() => {
            mudar([...itens, proxima]);
            setProxima((n) => n + 1);
          }}
          className="inline-flex items-center gap-1 text-sm font-semibold text-laranja-700"
        >
          <Plus className="size-4" /> {itens.length === 0 ? "pousei no caminho" : "outra escala"}
        </button>
      </div>
      {itens.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {itens.map((chave, i) => (
            <div key={chave} className="flex items-end gap-2">
              <div className="flex-1">
                <SeletorAerodromo nome={nome} rotulo={`${i + 1}ª escala`} opcoes={opcoes} obrigatorio />
              </div>
              <button type="button" onClick={() => mudar(itens.filter((c) => c !== chave))} title="Tirar escala" className="mb-3 text-marinho-300 hover:text-erro">
                <X className="size-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
