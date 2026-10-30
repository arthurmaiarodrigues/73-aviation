"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { mandarAvisoDeTeste, type Resultado } from "./acoes";

/** Confere os avisos: manda um para quem está logado agora. */
export function AvisoDeTeste() {
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="fantasma" disabled={pendente} onClick={() => iniciar(async () => setResultado(await mandarAvisoDeTeste()))}>
        {pendente ? <Loader2 className="animate-spin" /> : <Send className="size-4" />}
        Mandar um aviso de teste para mim
      </Button>
      {resultado && <span className={cn("text-xs", resultado.ok ? "text-ok" : "text-erro")}>{resultado.mensagem}</span>}
    </div>
  );
}
