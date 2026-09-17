"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alerta } from "@/components/ui/alerta";

type Resultado = { ok: boolean; mensagem: string };
const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="pequeno">
      {pending ? <Loader2 className="animate-spin" /> : <Save />}
      {rotulo}
    </Button>
  );
}

/** Formulário de cadastro genérico: campos como children, ação como prop. */
export function FormularioAcao({
  acao,
  rotulo = "Salvar",
  children,
  className,
}: {
  acao: (anterior: Resultado, form: FormData) => Promise<Resultado>;
  rotulo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [estado, despachar] = useActionState(acao, INICIAL);
  return (
    <form action={despachar} className={className ?? "space-y-3"}>
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      {children}
      <Botao rotulo={rotulo} />
    </form>
  );
}
