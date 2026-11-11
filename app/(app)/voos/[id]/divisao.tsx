"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alerta } from "@/components/ui/alerta";
import { horas as fmtHoras } from "@/lib/formato";
import { definirDivisao, type Resultado } from "../acoes";
import { DivisaoLancamento } from "../novo/divisao-lancamento";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao({ impedido }: { impedido: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending || impedido}>
      {pending ? <Loader2 className="animate-spin" /> : <Users />}
      {pending ? "Salvando…" : "Salvar divisão"}
    </Button>
  );
}

/**
 * Divide o voo entre quem estava nele: marcados em partes iguais, ou pela
 * proporção das horas de cada um; "SOCIEDADE" é a parte de todos (pela cota).
 * É proporção (schema_v49) — vale para o tempo de voo, mesmo que o diário o
 * corrija depois. Muda o % de uso, o fundo, o combustível, os rateios por
 * horas e as despesas ligadas ao voo (taxas, retiradas do tanque, reembolsos).
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
  const [impedimento, setImpedimento] = useState<string | null>(null);

  return (
    <>
      <form action={acao} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
        <p className="text-sm text-marinho-300">
          Voo de <strong className="text-marinho dark:text-areia">{fmtHoras(horasVoo)}</strong>. A divisão vale também para as
          taxas, as retiradas do tanque e os reembolsos ligados a este voo.
        </p>

        <DivisaoLancamento
          socios={socios}
          socioInicial={socioResponsavel}
          inicial={inicial}
          horasDoVoo={horasVoo}
          onSituacao={setImpedimento}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Botao impedido={!!impedimento} />
          {inicial.length > 0 && (
            // Envia o formulário de baixo, que só tem o id — divisão vazia,
            // o voo volta a ser todo do sócio responsável.
            <Button type="submit" variant="secundario" form={`desfazer-${id}`}>
              Desfazer a divisão (voo todo de {socios.find((s) => s.id === socioResponsavel)?.apelido ?? "SOCIEDADE"})
            </Button>
          )}
        </div>
      </form>
      {/* só o id: divisão vazia */}
      <form id={`desfazer-${id}`} action={acao} className="hidden">
        <input type="hidden" name="id" value={id} />
      </form>
    </>
  );
}
