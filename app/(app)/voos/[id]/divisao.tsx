"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Plus, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { horas as fmtHoras } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { definirDivisao, type Resultado } from "../acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao({ vazio }: { vazio: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Users />}
      {pending ? "Salvando…" : vazio ? "Desfazer a divisão" : "Salvar divisão"}
    </Button>
  );
}

/**
 * Divide as horas do voo: uma parte para cada sócio, e a "SOCIEDADE" para
 * o que é de todos (dividido igual). A soma tem de fechar com as horas do
 * voo — o que muda aqui muda o % de uso, o fundo de reserva, o combustível
 * e os rateios por horas.
 */
export function DivisaoVoo({
  id,
  horasVoo,
  socios,
  socioResponsavel,
  inicial,
}: {
  id: string;
  horasVoo: number;
  socios: { id: string; apelido: string }[];
  socioResponsavel: string | null;
  inicial: { socio_id: string | null; horas: number }[];
}) {
  const [estado, acao] = useActionState(definirDivisao, INICIAL);
  const [partes, setPartes] = useState<{ chave: number; socio: string; horas: string }[]>(
    inicial.length > 0
      ? inicial.map((p, i) => ({ chave: i, socio: p.socio_id ?? "SOCIEDADE", horas: String(p.horas).replace(".", ",") }))
      : [
          { chave: 0, socio: socioResponsavel ?? "SOCIEDADE", horas: String(horasVoo).replace(".", ",") },
          { chave: 1, socio: "", horas: "" },
        ],
  );
  const [proxima, setProxima] = useState(partes.length);

  const numero = (v: string) => {
    const n = Number(v.replace(".", "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const soma = Math.round(partes.reduce((s, p) => s + (p.socio ? numero(p.horas) : 0), 0) * 10) / 10;
  const falta = Math.round((horasVoo - soma) * 10) / 10;
  const preenchidas = partes.filter((p) => p.socio && numero(p.horas) > 0);

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <p className="text-sm text-marinho-300">
        Voo de <strong className="text-marinho dark:text-areia">{fmtHoras(horasVoo)}</strong>. Reparta as horas entre quem usou; &quot;Sociedade&quot; divide igual entre os quatro.
      </p>

      <div className="space-y-3">
        {partes.map((p, i) => (
          <div key={p.chave} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              {i === 0 && <Label>Sócio</Label>}
              <Select
                value={p.socio}
                onChange={(e) => setPartes((l) => l.map((x, j) => (j === i ? { ...x, socio: e.target.value } : x)))}
                name={p.socio ? "parte_socio" : undefined}
                className="h-12"
              >
                <option value="">—</option>
                <option value="SOCIEDADE">SOCIEDADE (todos)</option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.apelido}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-28 space-y-1.5">
              {i === 0 && <Label>Horas</Label>}
              <Input
                inputMode="decimal"
                placeholder="0,0"
                value={p.horas}
                name={p.socio ? "parte_horas" : undefined}
                onChange={(e) => setPartes((l) => l.map((x, j) => (j === i ? { ...x, horas: e.target.value } : x)))}
                className="h-12 tabular"
              />
            </div>
            <button
              type="button"
              onClick={() => setPartes((l) => l.filter((_, j) => j !== i))}
              title="Tirar"
              className="mb-3 text-marinho-300 hover:text-erro"
            >
              <X className="size-5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setPartes((l) => [...l, { chave: proxima, socio: "", horas: falta > 0 ? String(falta).replace(".", ",") : "" }]);
            setProxima((n) => n + 1);
          }}
          className="inline-flex items-center gap-1 text-sm font-semibold text-laranja-700"
        >
          <Plus className="size-4" /> outro sócio
        </button>
        <span className={cn("text-sm", falta === 0 ? "text-ok" : "text-atencao")}>
          {preenchidas.length === 0
            ? "Sem divisão: o voo fica todo do sócio responsável."
            : falta === 0
              ? `Fecha certinho: ${fmtHoras(soma)}`
              : falta > 0
                ? `Faltam ${fmtHoras(falta)} para fechar as ${fmtHoras(horasVoo)}`
                : `Passou ${fmtHoras(-falta)} das ${fmtHoras(horasVoo)}`}
        </span>
      </div>

      <Botao vazio={preenchidas.length === 0} />
    </form>
  );
}
