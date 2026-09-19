"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CalendarPlus, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { SeletorAerodromo } from "@/components/seletor-aerodromo";
import { bloquear, editarReserva, reservar, type Resultado } from "./acoes";

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

type SocioOpcao = { id: string; apelido: string };

/** Reserva nova. O admin escolhe em nome de quem (padrão: ele mesmo). */
export function FormularioReserva({ hoje, aerodromos, socios, meuSocioId }: { hoje: string; aerodromos: string[]; socios?: SocioOpcao[]; meuSocioId?: string | null }) {
  const [estado, acao] = useActionState(reservar, INICIAL);
  return (
    <form action={acao} className="space-y-3">
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      {socios && (
        <div className="space-y-1 sm:max-w-xs">
          <Label htmlFor="r-socio" className="text-xs">
            Em nome de
          </Label>
          <Select id="r-socio" name="socio_id" defaultValue={meuSocioId ?? socios[0]?.id ?? ""}>
            {socios.map((so) => (
              <option key={so.id} value={so.id}>
                {so.apelido}
              </option>
            ))}
          </Select>
        </div>
      )}
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
        <SeletorAerodromo nome="destino" rotulo="Destino" opcoes={aerodromos} />
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

/** Editar uma reserva existente (quem reservou ou o admin). */
export function FormularioEditarReserva({
  reserva,
  aerodromos,
  socios,
}: {
  reserva: { id: string; inicio: string; fim: string; destino: string | null; motivo: string | null; socio_id: string };
  aerodromos: string[];
  socios?: SocioOpcao[];
}) {
  const [estado, acao] = useActionState(editarReserva, INICIAL);
  return (
    <form action={acao} className="mt-2 space-y-3 rounded border border-marinho-100 p-3 dark:border-marinho-300">
      <input type="hidden" name="id" value={reserva.id} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <div className="grid gap-3 sm:grid-cols-4">
        {socios && (
          <div className="space-y-1">
            <Label className="text-xs">Sócio</Label>
            <Select name="socio_id" defaultValue={reserva.socio_id}>
              {socios.map((so) => (
                <option key={so.id} value={so.id}>
                  {so.apelido}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input name="inicio" type="date" defaultValue={reserva.inicio} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Até</Label>
          <Input name="fim" type="date" defaultValue={reserva.fim} />
        </div>
        <SeletorAerodromo nome="destino" rotulo="Destino" opcoes={aerodromos} valorInicial={reserva.destino ?? ""} />
        <div className="space-y-1">
          <Label className="text-xs">Motivo</Label>
          <Input name="motivo" defaultValue={reserva.motivo ?? ""} className="uppercase" maxLength={80} />
        </div>
      </div>
      <Botao rotulo="Salvar alteração" icone={<CalendarPlus />} />
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
