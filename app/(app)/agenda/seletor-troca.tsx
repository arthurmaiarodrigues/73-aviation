"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { data as fmtData } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { proporTroca, type Resultado } from "./acoes";

/** "Trocar com…": escolhe um período de outro sócio, do mesmo tipo, e propõe. */
export function SeletorTroca({
  meuBloco,
  opcoes,
}: {
  meuBloco: string;
  opcoes: { id: string; inicio: string; fim: string; socio: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [alvo, setAlvo] = useState(opcoes[0]?.id ?? "");
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);

  if (opcoes.length === 0) return null;
  if (!aberto)
    return (
      <Button type="button" size="pequeno" variant="fantasma" onClick={() => setAberto(true)}>
        <ArrowLeftRight /> trocar com…
      </Button>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Select value={alvo} onChange={(e) => setAlvo(e.target.value)} className="h-8 text-xs">
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.socio} · {fmtData(o.inicio)} – {fmtData(o.fim)}
          </option>
        ))}
      </Select>
      <Button type="button" size="pequeno" disabled={pendente} onClick={() => iniciar(async () => setResultado(await proporTroca(meuBloco, alvo)))}>
        {pendente ? <Loader2 className="animate-spin" /> : "Propor"}
      </Button>
      <Button type="button" size="pequeno" variant="fantasma" onClick={() => setAberto(false)}>
        Não
      </Button>
      {resultado && <span className={cn("text-xs", resultado.ok ? "text-ok" : "text-erro")}>{resultado.mensagem}</span>}
    </span>
  );
}
