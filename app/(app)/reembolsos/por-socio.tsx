"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, Printer, Undo2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { reais } from "@/lib/formato";
import { marcarPagoDoSocio } from "./acoes";

export type LinhaSocio = { socio_id: string; apelido: string; devido: number; itens: number; pago: number };

/**
 * O que cada sócio ainda deve ao piloto e o que já pagou. Quem pagou marca
 * aqui (ou o admin/piloto marca por ele); a despesa fecha quando todos
 * pagarem. O PIX do piloto fica à mão para a transferência.
 */
export function DevidoPorSocio({
  linhas,
  pix,
  piloto,
  podeMarcar,
  meuSocioId,
}: {
  linhas: LinhaSocio[];
  pix: string | null;
  piloto: string;
  /** admin ou o piloto credor podem marcar por qualquer sócio */
  podeMarcar: boolean;
  meuSocioId: string | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const total = linhas.reduce((s, l) => s + l.devido, 0);

  function acao(socioId: string, desfazer: boolean) {
    iniciar(async () => {
      const r = await marcarPagoDoSocio(socioId, desfazer);
      setMsg(r.mensagem);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-marinho-100 p-4 dark:border-marinho-300">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">Quem deve ao piloto</p>
        <div className="flex items-center gap-3">
          <p className="tabular text-sm text-marinho-300">total {reais(total)}</p>
          <Link href="/reembolsos/imprimir" target="_blank" className="inline-flex items-center gap-1 text-sm font-semibold text-laranja-700">
            <Printer className="size-4" /> relatório
          </Link>
        </div>
      </div>
      {pix && (
        <p className="text-sm">
          PIX de {piloto.split(" ")[0]}: <strong className="select-all">{pix}</strong>
        </p>
      )}
      {msg && <p className="text-xs text-marinho-300">{msg}</p>}
      <ul className="divide-y divide-marinho-100 dark:divide-marinho-300">
        {linhas.length === 0 && <li className="py-2 text-sm text-marinho-300">Nada a acertar com o piloto.</li>}
        {linhas.map((l) => {
          const meu = l.socio_id === meuSocioId;
          return (
            <li key={l.socio_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="w-24 font-semibold">{l.apelido}</span>
              <span className="tabular font-semibold">{reais(l.devido)}</span>
              <span className="text-xs text-marinho-300">
                {l.devido > 0 ? `${l.itens} ${l.itens === 1 ? "lançamento" : "lançamentos"}` : "em dia"}
                {l.pago > 0 ? ` · já pagou ${reais(l.pago)}` : ""}
              </span>
              <span className="ml-auto flex items-center gap-2">
                {l.devido > 0 && (podeMarcar || meu) && (
                  <Button type="button" variant="secundario" size="pequeno" disabled={pendente} onClick={() => acao(l.socio_id, false)}>
                    {pendente ? <Loader2 className="animate-spin" /> : <Check />} {meu ? "Paguei" : "Pagou"}
                  </Button>
                )}
                {l.pago > 0 && podeMarcar && (
                  <Button type="button" variant="fantasma" size="pequeno" disabled={pendente} onClick={() => acao(l.socio_id, true)}>
                    <Undo2 /> desfazer
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
