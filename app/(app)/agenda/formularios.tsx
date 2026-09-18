"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlus, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { bloquear, reservar, type Resultado } from "./acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao({ rotulo, icone }: { rotulo: string; icone: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : icone}
      {rotulo}
    </Button>
  );
}

export function FormularioReserva({ hoje }: { hoje: string }) {
  const [estado, acao] = useActionState(reservar, INICIAL);
  return (
    <form action={acao} className="space-y-3">
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="r-inicio" className="text-xs">
            De
          </Label>
          <Input id="r-inicio" name="inicio" type="date" min={hoje} defaultValue={hoje} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="r-fim" className="text-xs">
            Até (em branco = um dia)
          </Label>
          <Input id="r-fim" name="fim" type="date" min={hoje} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="r-destino" className="text-xs">
            Destino
          </Label>
          <Input id="r-destino" name="destino" placeholder="SBSV" className="uppercase" maxLength={40} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="r-motivo" className="text-xs">
            Motivo
          </Label>
          <Input id="r-motivo" name="motivo" placeholder="opcional" className="uppercase" maxLength={80} />
        </div>
      </div>
      <Botao rotulo="Reservar" icone={<CalendarPlus />} />
    </form>
  );
}

export function FormularioBloqueio({ hoje }: { hoje: string }) {
  const [estado, acao] = useActionState(bloquear, INICIAL);
  return (
    <form action={acao} className="space-y-3">
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="b-inicio" className="text-xs">
            De
          </Label>
          <Input id="b-inicio" name="inicio" type="date" defaultValue={hoje} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="b-fim" className="text-xs">
            Até
          </Label>
          <Input id="b-fim" name="fim" type="date" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="b-tipo" className="text-xs">
            Tipo
          </Label>
          <Select id="b-tipo" name="tipo" defaultValue="MANUTENCAO">
            <option value="MANUTENCAO">Manutenção</option>
            <option value="DOCUMENTO">Documento vencido</option>
            <option value="FORA_DA_BASE">Fora da base</option>
            <option value="OUTRO">Outro</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="b-motivo" className="text-xs">
            Motivo
          </Label>
          <Input id="b-motivo" name="motivo" placeholder="REVISÃO 100 H NA OFICINA" className="uppercase" required />
        </div>
      </div>
      <Botao rotulo="Bloquear avião" icone={<Lock />} />
    </form>
  );
}
