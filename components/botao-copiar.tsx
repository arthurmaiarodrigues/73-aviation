"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Copia um código (linha digitável, PIX) para colar no banco. */
export function BotaoCopiar({ valor, rotulo = "copiar" }: { valor: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      // Sem permissão para a área de transferência: seleciona para copiar à mão.
      const campo = document.createElement("textarea");
      campo.value = valor;
      document.body.appendChild(campo);
      campo.select();
      try {
        document.execCommand("copy");
      } catch {
        /* o usuário copia manualmente */
      }
      campo.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <Button type="button" variant={copiado ? "secundario" : "fantasma"} size="pequeno" onClick={copiar}>
      {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copiado ? "copiado" : rotulo}
    </Button>
  );
}

/** A linha digitável em grupos, do jeito que vem impressa no boleto. */
export function linhaFormatada(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  if (d.length !== 47) return d;
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
}
