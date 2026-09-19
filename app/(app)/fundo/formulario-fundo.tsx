"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, PiggyBank, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alerta } from "@/components/ui/alerta";
import { apagarValorDoFundo, definirValorDoFundo, type Resultado } from "./acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <PiggyBank />}
      Salvar valor
    </Button>
  );
}

export function FormularioFundo({ valorAtual, mesAtual }: { valorAtual: number; mesAtual: string }) {
  const [estado, acao] = useActionState(definirValorDoFundo, INICIAL);
  return (
    <form action={acao} className="space-y-3">
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="valor_por_hora" className="text-xs">
            Valor por hora voada (R$)
          </Label>
          <Input id="valor_por_hora" name="valor_por_hora" inputMode="decimal" defaultValue={valorAtual.toFixed(2).replace(".", ",")} required className="tabular" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="vigente_desde" className="text-xs">
            Vale a partir do mês
          </Label>
          <Input id="vigente_desde" name="vigente_desde" type="month" defaultValue={mesAtual.slice(0, 7)} required />
        </div>
      </div>
      <p className="text-xs text-marinho-300">Meses já fechados não mudam. Os abertos a partir do mês escolhido são recalculados com o valor novo.</p>
      <Botao />
    </form>
  );
}

export function BotaoApagarValor({ id }: { id: string }) {
  const [pendente, iniciar] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  if (!confirmar)
    return (
      <button type="button" onClick={() => setConfirmar(true)} title="Remover" className="text-marinho-300 hover:text-erro">
        <Trash2 className="size-4" />
      </button>
    );
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="destrutivo" size="pequeno" disabled={pendente} onClick={() => iniciar(async () => { await apagarValorDoFundo(id); setConfirmar(false); })}>
        {pendente ? <Loader2 className="animate-spin" /> : "Remover"}
      </Button>
      <Button type="button" variant="fantasma" size="pequeno" onClick={() => setConfirmar(false)}>
        Não
      </Button>
    </span>
  );
}
