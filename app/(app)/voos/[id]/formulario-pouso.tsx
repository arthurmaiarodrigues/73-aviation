"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, PlaneLanding } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { FotoHorimetro, type EstadoFoto } from "@/components/foto-horimetro";
import { SeletorAerodromo } from "@/components/seletor-aerodromo";
import { ListaEscalas } from "@/components/lista-escalas";
import { registrarPouso, type Resultado } from "../acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <PlaneLanding />}
      {pending ? "Salvando…" : "Registrar pouso"}
    </Button>
  );
}

export function FormularioPouso({
  id,
  horimetroInicial,
  destino,
  escalas,
  horasPernas,
  aerodromos,
  observacao,
  leituraAutomatica,
}: {
  id: string;
  horimetroInicial: number | null;
  destino: string | null;
  escalas: string[];
  horasPernas: number[];
  aerodromos: string[];
  observacao: string | null;
  leituraAutomatica: boolean;
}) {
  const [estado, acao] = useActionState(registrarPouso, INICIAL);
  const [foto, setFoto] = useState<EstadoFoto>({ caminho: null, leitura: null, valor: "" });
  const [pousos, setPousos] = useState(String(escalas.length + 1));

  return (
    <form action={acao} className="space-y-5">
      <input type="hidden" name="id" value={id} />
      {!estado.ok && estado.mensagem && <Alerta tom="erro">{estado.mensagem}</Alerta>}

      <FotoHorimetro
        nome="final"
        rotulo="Horímetro depois do pouso"
        esperado={horimetroInicial}
        rotuloArquivo="HORIMETRO - FINAL"
        estado={foto}
        aoMudar={setFoto}
        leituraAutomatica={leituraAutomatica}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SeletorAerodromo nome="destino" rotulo="Destino" opcoes={aerodromos} valorInicial={destino ?? ""} />
        <ListaEscalas opcoes={aerodromos} iniciais={escalas} horasIniciais={horasPernas} aoMudar={(n) => setPousos(String(n + 1))} />
        <div className="space-y-1.5">
          <Label htmlFor="combustivel_final_l">Combustível no pouso (L)</Label>
          <Input id="combustivel_final_l" name="combustivel_final_l" inputMode="decimal" placeholder="ex.: 125" className="h-12 tabular" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pousos">Pousos</Label>
          <Input id="pousos" name="pousos" type="number" min={0} value={pousos} onChange={(e) => setPousos(e.target.value)} className="h-12 tabular" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="observacao">Observação</Label>
        <Textarea id="observacao" name="observacao" defaultValue={observacao ?? ""} />
      </div>

      <Botao />
    </form>
  );
}
