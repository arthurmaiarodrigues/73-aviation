"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cancelarReserva, cederSemana, escolherSemana, removerBloqueio, responderPedido, responderTroca, type Resultado } from "./acoes";

/** Botão que chama uma ação com id e mostra a resposta ao lado. */
export function BotaoAcao({
  acao,
  id,
  rotulo,
  variant = "primario",
  confirmar,
  className,
}: {
  acao: "escolher" | "ceder" | "cancelar" | "removerBloqueio" | "concordar" | "precisar" | "aceitarTroca" | "recusarTroca";
  id: string;
  rotulo: string;
  variant?: "primario" | "secundario" | "fantasma" | "destrutivo";
  confirmar?: string;
  className?: string;
}) {
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pedindo, setPedindo] = useState(false);

  function executar() {
    iniciar(async () => {
      const fn: Record<typeof acao, (id: string) => Promise<Resultado>> = {
        escolher: escolherSemana,
        ceder: cederSemana,
        cancelar: cancelarReserva,
        removerBloqueio,
        concordar: (x) => responderPedido(x, true),
        precisar: (x) => responderPedido(x, false),
        aceitarTroca: (x) => responderTroca(x, true),
        recusarTroca: (x) => responderTroca(x, false),
      };
      setResultado(await fn[acao](id));
      setPedindo(false);
    });
  }

  if (confirmar && pedindo) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="text-xs text-marinho-300">{confirmar}</span>
        <Button type="button" size="pequeno" variant="destrutivo" onClick={executar} disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : "Sim"}
        </Button>
        <Button type="button" size="pequeno" variant="fantasma" onClick={() => setPedindo(false)}>
          Não
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" size="pequeno" variant={variant} className={className} onClick={() => (confirmar ? setPedindo(true) : executar())} disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : rotulo}
      </Button>
      {resultado && <span className={cn("text-xs", resultado.ok ? "text-ok" : "text-erro")}>{resultado.mensagem}</span>}
    </span>
  );
}
