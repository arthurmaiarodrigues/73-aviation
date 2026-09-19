"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, Loader2, PlaneLanding } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alerta } from "@/components/ui/alerta";
import { FotoHorimetro, type EstadoFoto } from "@/components/foto-horimetro";
import { SeletorAerodromo } from "@/components/seletor-aerodromo";
import { registrarPerna, type Resultado } from "../acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao({ onde }: { onde: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <PlaneLanding />}
      {pending ? "Salvando…" : `Pousei em ${onde}`}
    </Button>
  );
}

/**
 * Pouso de uma perna intermediária: foto do horímetro (opcional, mas dá as
 * horas de cada trecho) e pronto. Corrigir onde pousou ou acrescentar parada
 * fica recolhido.
 */
export function FormularioPerna({
  id,
  numero,
  total,
  de,
  para,
  proxima,
  horimetroAnterior,
  aerodromos,
  leituraAutomatica,
}: {
  id: string;
  numero: number;
  total: number;
  de: string;
  para: string;
  proxima: string;
  horimetroAnterior: number | null;
  aerodromos: string[];
  leituraAutomatica: boolean;
}) {
  const [estado, acao] = useActionState(registrarPerna, INICIAL);
  const [foto, setFoto] = useState<EstadoFoto>({ caminho: null, leitura: null, valor: "" });
  const [onde, setOnde] = useState(para);
  const [detalhes, setDetalhes] = useState(false);

  return (
    <form action={acao} className="space-y-5">
      <input type="hidden" name="id" value={id} />
      {!estado.ok && estado.mensagem && <Alerta tom="erro">{estado.mensagem}</Alerta>}

      <p className="text-sm text-marinho-300">
        Perna {numero} de {total}: <strong className="text-marinho dark:text-areia">{de} → {para}</strong>. Depois: {onde || para} → {proxima}.
      </p>

      <FotoHorimetro
        nome="perna"
        rotulo={`Horímetro no pouso em ${onde || para}`}
        esperado={horimetroAnterior}
        rotuloArquivo={`HORIMETRO - PERNA ${numero}`}
        estado={foto}
        aoMudar={setFoto}
        leituraAutomatica={leituraAutomatica}
      />
      <p className="-mt-3 text-xs text-marinho-300">Sem a foto, as horas deste trecho ficam somadas no voo; o total fecha no pouso final.</p>

      <button type="button" onClick={() => setDetalhes((d) => !d)} className="flex items-center gap-1 text-sm font-semibold text-laranja-700">
        <ChevronDown className={`size-4 transition-transform ${detalhes ? "rotate-180" : ""}`} /> {detalhes ? "menos detalhes" : "pousei em outro lugar / parada extra / combustível"}
      </button>
      <div className={detalhes ? "grid gap-4 sm:grid-cols-3" : "hidden"}>
        <SeletorAerodromo nome="escala_real" rotulo="Onde pousou" opcoes={aerodromos} valorInicial={para} aoMudar={setOnde} />
        <SeletorAerodromo nome="nova_escala" rotulo="Parada extra antes de seguir" opcoes={aerodromos} valorInicial="" />
        <div className="space-y-1.5">
          <Label htmlFor="combustivel_proxima">Combustível na próxima decolagem (L)</Label>
          <Input id="combustivel_proxima" name="combustivel_proxima" inputMode="decimal" placeholder="ex.: 180" className="h-12 tabular" />
        </div>
      </div>

      <Botao onde={onde || para} />
    </form>
  );
}
