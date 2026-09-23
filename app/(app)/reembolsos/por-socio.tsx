"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, Paperclip, Printer, Undo2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { reais } from "@/lib/formato";
import { enviarArquivo } from "@/lib/upload-cliente";
import { marcarPagoDoSocio } from "./acoes";

export type LinhaSocio = {
  socio_id: string;
  apelido: string;
  devido: number;
  itens: number;
  pago: number;
  /** comprovante do PIX que o sócio anexou (link já assinado) */
  comprovante: string | null;
};

/**
 * O que cada sócio ainda deve ao piloto e o que já pagou. Quem paga marca
 * aqui e pode anexar o comprovante do PIX; o piloto vê a lista inteira —
 * é o dinheiro dele — e sabe de quem ainda está esperando.
 */
export function DevidoPorSocio({
  linhas,
  pix,
  piloto,
  podeMarcar,
  meuSocioId,
  souPiloto,
}: {
  linhas: LinhaSocio[];
  pix: string | null;
  piloto: string;
  /** admin ou o piloto credor podem marcar por qualquer sócio */
  podeMarcar: boolean;
  meuSocioId: string | null;
  souPiloto: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const total = linhas.reduce((s, l) => s + l.devido, 0);
  const pagoTotal = linhas.reduce((s, l) => s + l.pago, 0);

  function acao(socioId: string, desfazer: boolean, comprovante?: string | null) {
    iniciar(async () => {
      const r = await marcarPagoDoSocio(socioId, desfazer, comprovante);
      setMsg(r.mensagem);
      router.refresh();
    });
  }

  async function pagarComComprovante(socioId: string, arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviando(socioId);
    const r = await enviarArquivo(arquivo, "comprovantes", "COMPROVANTE - PIX REEMBOLSO");
    setEnviando(null);
    if (!r.ok) return setMsg(r.mensagem);
    acao(socioId, false, r.caminho);
  }

  return (
    <div className="space-y-3 rounded-lg border border-marinho-100 p-4 dark:border-marinho-300">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{souPiloto ? "Quem ainda lhe deve" : "Quem deve ao piloto"}</p>
        <div className="flex items-center gap-3">
          <p className="tabular text-sm text-marinho-300">
            a receber {reais(total)}
            {pagoTotal > 0 ? ` · já pago ${reais(pagoTotal)}` : ""}
          </p>
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
              {l.comprovante && (
                <a href={l.comprovante} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-laranja-700">
                  <Paperclip className="size-3" /> comprovante
                </a>
              )}
              <span className="ml-auto flex items-center gap-2">
                {l.devido > 0 && meu && (
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded border border-marinho-100 px-2 text-xs font-semibold hover:border-laranja dark:border-marinho-300">
                    {enviando === l.socio_id ? <Loader2 className="size-3 animate-spin" /> : <Paperclip className="size-3" />}
                    {enviando === l.socio_id ? "enviando…" : "Paguei + comprovante"}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={pendente || enviando !== null}
                      onChange={(e) => pagarComComprovante(l.socio_id, e.target.files?.[0])}
                    />
                  </label>
                )}
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
