"use client";

import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Voo dividido já no lançamento: marca quem estava no voo. Sem horas, é em
 * partes iguais entre os marcados; com as horas de cada um (quem fez qual
 * trecho), é na proporção delas. A divisão é PROPORÇÃO (schema_v49): vale
 * para as horas do voo — o tempo de voo, mesmo que ainda não se saiba (voo
 * em aberto) ou que o diário corrija depois — e para as despesas ligadas a
 * ele (taxas, retiradas do tanque, reembolsos "pelo voo").
 *
 * Grava `parte_socio` / `parte_horas` (peso) para cada marcado.
 */
type Linha = { id: string; nome: string; marcado: boolean; horas: string };

const numero = (v: string) => {
  const n = Number(v.replace(".", "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const pct = (n: number) => `${(Math.round(n * 1000) / 10).toString().replace(".", ",")}%`;

export function DivisaoLancamento({
  socios,
  socioInicial,
  inicial,
  horasDoVoo,
  onSituacao,
}: {
  socios: { id: string; apelido: string }[];
  socioInicial: string | null;
  /** Divisão já gravada (ficha do voo): pesos iguais aparecem como "partes iguais". */
  inicial?: { socio_id: string | null; horas: number }[];
  /** Tempo de voo já conhecido (0 = ainda não): só para mostrar a prévia em horas. */
  horasDoVoo: number;
  /** Mensagem que impede salvar (ou null quando está tudo certo). */
  onSituacao: (impedimento: string | null) => void;
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() => {
    const ja = inicial ?? [];
    const iguais = ja.every((p) => p.horas === ja[0]?.horas);
    const linha = (id: string, nome: string, chave: string | null): Linha => {
      const p = ja.find((x) => x.socio_id === chave);
      return {
        id,
        nome,
        marcado: ja.length > 0 ? !!p : id === socioInicial,
        horas: p && !iguais ? String(p.horas).replace(".", ",") : "",
      };
    };
    return [...socios.map((s) => linha(s.id, s.apelido, s.id)), linha("SOCIEDADE", "SOCIEDADE (parte de todos)", null)];
  });

  const marcadas = linhas.filter((l) => l.marcado);
  const comHoras = marcadas.filter((l) => numero(l.horas) > 0);
  const pelasHoras = comHoras.length > 0;
  const incompleto = pelasHoras && comHoras.length < marcadas.length;
  const pesos = marcadas.map((l) => (pelasHoras ? numero(l.horas) : 1));
  const total = pesos.reduce((a, b) => a + b, 0);

  const impedimento = useMemo(() => {
    if (marcadas.length === 0) return "Marque quem estava no voo.";
    if (incompleto) return "Informe as horas de todos os marcados — ou apague todas para dividir em partes iguais.";
    return null;
  }, [marcadas.length, incompleto]);
  useEffect(() => onSituacao(impedimento), [impedimento, onSituacao]);

  const mudar = (id: string, campo: Partial<Linha>) => setLinhas((l) => l.map((x) => (x.id === id ? { ...x, ...campo } : x)));

  return (
    <div className="space-y-2 rounded-lg border border-marinho-100 p-3 dark:border-marinho-300">
      <p className="text-xs text-marinho-300">Marque quem estava no voo. Sem horas, divide em partes iguais; com horas, pela proporção delas.</p>
      {linhas.map((l) => (
        <div key={l.id} className="flex items-center gap-3">
          <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={l.marcado} onChange={(e) => mudar(l.id, { marcado: e.target.checked })} className="size-5 accent-laranja" />
            <span className={cn(l.marcado ? "font-semibold" : "text-marinho-300")}>{l.nome}</span>
          </label>
          {l.marcado && (
            <>
              <input type="hidden" name="parte_socio" value={l.id} />
              <input type="hidden" name="parte_horas" value={pelasHoras ? String(numero(l.horas)) : "1"} />
              <Input
                inputMode="decimal"
                placeholder="horas (opcional)"
                value={l.horas}
                onChange={(e) => mudar(l.id, { horas: e.target.value })}
                className="h-10 w-36 tabular"
                aria-label={`Horas de ${l.nome}`}
              />
            </>
          )}
        </div>
      ))}
      {marcadas.length > 0 && !incompleto && (
        <p className="text-xs text-ok">
          {pelasHoras ? "Pelas horas: " : "Partes iguais: "}
          {marcadas
            .map((l, i) => {
              const f = total > 0 ? pesos[i] / total : 0;
              const h = horasDoVoo > 0 ? ` (${(Math.round(horasDoVoo * f * 10) / 10).toFixed(1).replace(".", ",")} h)` : "";
              return `${l.nome.replace(" (parte de todos)", "")} ${pct(f)}${h}`;
            })
            .join(" · ")}
        </p>
      )}
      {impedimento && marcadas.length > 0 && <p className="text-xs text-atencao">{impedimento}</p>}
    </div>
  );
}
