"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Campo ICAO com sugestões dos aeródromos já usados (os recentes primeiro).
 * Aceita qualquer código de 4 letras: o cadastro cresce sozinho a partir do voo.
 */
export function SeletorAerodromo({
  nome,
  rotulo,
  opcoes,
  valorInicial = "",
  obrigatorio = false,
}: {
  nome: string;
  rotulo: string;
  opcoes: string[];
  valorInicial?: string;
  obrigatorio?: boolean;
}) {
  const listaId = useId();
  const [valor, setValor] = useState(valorInicial);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={nome}>{rotulo}</Label>
      <Input
        id={nome}
        name={nome}
        list={listaId}
        value={valor}
        onChange={(e) => setValor(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
        placeholder="SNTF"
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={4}
        pattern="[A-Z0-9]{4}"
        required={obrigatorio}
        className="h-12 font-semibold uppercase tracking-widest"
      />
      <datalist id={listaId}>
        {opcoes.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}
