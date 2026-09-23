"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { data as fmtData, reais } from "@/lib/formato";
import { confirmarVarios } from "./acoes";

type Item = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  categoria: string;
  criterio: "IGUAL" | "POR_HORAS" | "DIRETO" | "MANUAL";
  socio_id: string | null;
  socio: string;
};

const ROTULO: Record<string, string> = { IGUAL: "todos, partes iguais", POR_HORAS: "todos, pelas horas voadas", DIRETO: "um sócio só" };

/**
 * Admin: confere de uma vez o que o piloto lançou. Marca o que quer,
 * mantém a divisão que ele sugeriu ou troca para todos, e confirma.
 */
export function ConferirLote({ itens, socios }: { itens: Item[]; socios: { id: string; apelido: string }[] }) {
  const [marcados, setMarcados] = useState<string[]>(itens.map((i) => i.id));
  const [divisao, setDivisao] = useState("MANTER");
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const total = itens.filter((i) => marcados.includes(i.id)).reduce((s, i) => s + i.valor, 0);
  const alternar = (id: string) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  return (
    <div className="space-y-4 rounded-lg border border-info/50 bg-info/5 p-4">
      <div>
        <p className="font-semibold">
          {itens.length === 1 ? "1 reembolso aguardando" : `${itens.length} reembolsos aguardando`} a sua conferência
        </p>
        <p className="text-sm text-marinho-300">Confira a divisão que o piloto marcou. Só depois de confirmar é que entra no rateio, no extrato e no caixa.</p>
      </div>
      {msg && <Alerta tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Alerta>}

      <ul className="divide-y divide-marinho-100 dark:divide-marinho-300">
        {itens.map((i) => (
          <li key={i.id}>
            <label className="flex cursor-pointer items-start gap-3 py-2">
              <input type="checkbox" checked={marcados.includes(i.id)} onChange={() => alternar(i.id)} className="mt-1 size-5 shrink-0" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{i.descricao}</span>
                <span className="block text-xs text-marinho-300">
                  {fmtData(i.data)} · {i.categoria} · {i.criterio === "DIRETO" ? `só ${i.socio}` : ROTULO[i.criterio]}
                </span>
              </span>
              <span className="tabular shrink-0 font-semibold">{reais(i.valor)}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setMarcados(marcados.length === itens.length ? [] : itens.map((i) => i.id))} className="text-sm font-semibold text-laranja-700">
          {marcados.length === itens.length ? "desmarcar todos" : "marcar todos"}
        </button>
        <Select value={divisao} onChange={(e) => setDivisao(e.target.value)} className="h-11 w-auto text-sm">
          <option value="MANTER">Manter a divisão do piloto</option>
          <option value="TODOS_IGUAL">Todos — partes iguais</option>
          <option value="TODOS_HORAS">Todos — pelas horas voadas</option>
          {socios.map((s) => (
            <option key={s.id} value={s.id}>
              Só {s.apelido}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          size="campo"
          className="w-auto"
          disabled={pendente || marcados.length === 0}
          onClick={() =>
            iniciar(async () => {
              const r = await confirmarVarios(
                marcados,
                divisao === "MANTER" ? null : divisao === "TODOS_IGUAL" ? "IGUAL" : divisao === "TODOS_HORAS" ? "POR_HORAS" : "DIRETO",
                divisao.length > 20 ? divisao : null,
              );
              setMsg({ ok: r.ok, texto: r.mensagem });
              if (r.ok) {
                setMarcados([]);
                router.refresh();
              }
            })
          }
        >
          {pendente ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          Confirmar {marcados.length > 0 ? `${marcados.length} · ${reais(total)}` : ""}
        </Button>
      </div>
    </div>
  );
}
