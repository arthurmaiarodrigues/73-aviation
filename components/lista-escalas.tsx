"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SeletorAerodromo } from "@/components/seletor-aerodromo";

/**
 * Escalas de um voo (os pousos entre a origem e o destino), cada uma com o
 * mesmo preenchimento automático. Vai no formulário como vários campos
 * `escala`; o servidor lê com form.getAll("escala").
 */
export function ListaEscalas({
  opcoes,
  iniciais = [],
  aoMudar,
}: {
  opcoes: string[];
  iniciais?: string[];
  aoMudar?: (quantidade: number) => void;
}) {
  const [itens, setItens] = useState<{ chave: number; valor: string }[]>(iniciais.map((v, i) => ({ chave: i, valor: v })));
  const [proxima, setProxima] = useState(iniciais.length);

  function adicionar() {
    setItens((l) => {
      const novo = [...l, { chave: proxima, valor: "" }];
      aoMudar?.(novo.length);
      return novo;
    });
    setProxima((n) => n + 1);
  }

  function remover(chave: number) {
    setItens((l) => {
      const novo = l.filter((i) => i.chave !== chave);
      aoMudar?.(novo.length);
      return novo;
    });
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center justify-between">
        <Label>Escalas {itens.length > 0 && <span className="text-marinho-300">({itens.length})</span>}</Label>
        <Button type="button" variant="fantasma" size="pequeno" onClick={adicionar}>
          <Plus /> Adicionar escala
        </Button>
      </div>
      {itens.length === 0 && <p className="text-xs text-marinho-300">Voo direto. Pousou no caminho? Adicione a escala — os pousos são contados sozinhos.</p>}
      {itens.map((i, n) => (
        <div key={i.chave} className="flex items-end gap-2">
          <span className="pb-3 text-xs text-marinho-300">{n + 1}ª</span>
          <div className="flex-1">
            <SeletorAerodromo nome="escala" rotulo="" opcoes={opcoes} valorInicial={i.valor} obrigatorio />
          </div>
          <Button type="button" variant="fantasma" size="icone" onClick={() => remover(i.chave)} aria-label="Tirar escala" className="mb-0.5">
            <X />
          </Button>
        </div>
      ))}
    </div>
  );
}
