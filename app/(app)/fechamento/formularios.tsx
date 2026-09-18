"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Lock, LockOpen, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alerta } from "@/components/ui/alerta";
import { fecharMes, reabrirMes, type Resultado } from "./acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao({ rotulo, icone, variant = "primario" }: { rotulo: string; icone: React.ReactNode; variant?: "primario" | "secundario" | "destrutivo" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : icone}
      {rotulo}
    </Button>
  );
}

export function FormularioFechar({ mes, bloqueado }: { mes: string; bloqueado: boolean }) {
  const [estado, acao] = useActionState(fecharMes, INICIAL);
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="mes" value={mes} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <div className="space-y-1">
        <Label htmlFor="observacao" className="text-xs">
          Observação do fechamento (opcional)
        </Label>
        <Input id="observacao" name="observacao" placeholder="ex.: ACERTO COMBINADO NO GRUPO" className="uppercase" />
      </div>
      <Botao rotulo="Fechar o mês" icone={<Lock />} />
      {bloqueado && <p className="text-xs text-erro">Há voo sem pouso registrado: o fechamento vai recusar até resolver.</p>}
    </form>
  );
}

export function FormularioReabrir({ mes }: { mes: string }) {
  const [estado, acao] = useActionState(reabrirMes, INICIAL);
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="mes" value={mes} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <div className="space-y-1">
        <Label htmlFor="motivo" className="text-xs">
          Motivo da reabertura
        </Label>
        <Input id="motivo" name="motivo" placeholder="ex.: NOTA DE COMBUSTÍVEL CHEGOU DEPOIS" className="uppercase" required />
      </div>
      <Botao rotulo="Reabrir o mês" icone={<LockOpen />} variant="destrutivo" />
    </form>
  );
}

export function BotaoImprimir() {
  return (
    <Button type="button" variant="secundario" onClick={() => window.print()}>
      <Printer /> Salvar em PDF
    </Button>
  );
}
