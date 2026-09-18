"use client";

import { useState, useTransition } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { reativarPiloto, removerPiloto, type Resultado } from "./acoes";

export function BotoesPiloto({ id, ativo, nome }: { id: string; ativo: boolean; nome: string }) {
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pedindo, setPedindo] = useState(false);

  if (!ativo) {
    return (
      <span className="inline-flex items-center gap-2">
        <Button type="button" size="pequeno" variant="fantasma" disabled={pendente} onClick={() => iniciar(async () => setResultado(await reativarPiloto(id)))}>
          {pendente ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reativar
        </Button>
        {resultado && <span className={cn("text-xs", resultado.ok ? "text-ok" : "text-erro")}>{resultado.mensagem}</span>}
      </span>
    );
  }

  if (pedindo) {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <span className="text-marinho-300">Remover {nome}?</span>
        <Button type="button" size="pequeno" variant="destrutivo" disabled={pendente} onClick={() => iniciar(async () => { setResultado(await removerPiloto(id)); setPedindo(false); })}>
          {pendente ? <Loader2 className="animate-spin" /> : "Sim"}
        </Button>
        <Button type="button" size="pequeno" variant="fantasma" onClick={() => setPedindo(false)}>
          Não
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={() => setPedindo(true)} title="Remover piloto" className="text-marinho-300 hover:text-erro">
        <Trash2 className="size-4" />
      </button>
      {resultado && <span className={cn("text-xs", resultado.ok ? "text-ok" : "text-erro")}>{resultado.mensagem}</span>}
    </span>
  );
}
