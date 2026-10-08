"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Paperclip, Plus, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { enviarArquivo } from "@/lib/upload-cliente";
import { reais } from "@/lib/formato";
import { ROTULO_TIPO_CUSTO, sugerirItemDoPlano, sugerirTipoCusto, type TipoCusto } from "@/lib/manutencao-constantes";
import type { ItemPlano } from "@/lib/dados/manutencao";
import { lancarItensDaNota, type Resultado } from "./acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

type Linha = { descricao: string; valor: string; tipo: TipoCusto; plano: string };

const numero = (t: string) => {
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function Botao({ rotulo, impedido }: { rotulo: string; impedido?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || impedido}>
      {pending ? <Loader2 className="animate-spin" /> : <Save />}
      {rotulo}
    </Button>
  );
}

/**
 * Lê a nota da oficina (foto ou PDF) e deixa os itens prontos para lançar: o
 * app sugere como cada linha divide (por uso, por tempo ou igual) e a que item
 * do plano ela pertence; quem lança confere e grava tudo de uma vez.
 */
export function LeitorNotaOficina({ manutencaoId, plano }: { manutencaoId: string; plano: ItemPlano[] }) {
  const [estado, acao] = useActionState(lancarItensDaNota, INICIAL);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<{ fornecedor: string | null; total: number | null; confianca: number; cortada?: boolean } | null>(null);

  const soma = linhas.reduce((s, l) => s + numero(l.valor), 0);
  const total = leitura?.total ?? null;
  const diferenca = total === null ? 0 : Math.round((total - soma) * 100) / 100;

  function mudar(i: number, campo: keyof Linha, valor: string) {
    setLinhas((l) => l.map((x, k) => (k === i ? { ...x, [campo]: valor } : x)));
  }

  async function tratarArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    // Sobe e manda ler ao mesmo tempo; a leitura é acessória.
    const leituraPromessa = ler(arquivo);
    const r = await enviarArquivo(arquivo, "comprovantes", "NOTA DA OFICINA");
    setEnviando(false);
    if (r.ok) setComprovante(r.caminho);
    else setErro(r.mensagem);
    await leituraPromessa;
  }

  async function ler(arquivo: File) {
    setLendo(true);
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      const resp = await fetch("/api/comprovante", { method: "POST", body: form });
      const lido = (await resp.json()) as {
        erro?: string;
        fornecedor: string | null;
        valor: number | null;
        confianca: number;
        cortada?: boolean;
        itens?: { descricao: string; valor: number }[];
      };
      if (!resp.ok) throw new Error(lido.erro ?? "Falha na leitura.");
      const itens = lido.itens ?? [];
      if (itens.length === 0) setErro("A nota foi anexada, mas não consegui separar os itens. Lance item a item abaixo.");
      setLinhas(
        itens.map((i) => ({
          descricao: i.descricao.toLocaleUpperCase("pt-BR"),
          valor: i.valor.toFixed(2).replace(".", ","),
          tipo: sugerirTipoCusto(i.descricao),
          plano: sugerirItemDoPlano(i.descricao, plano),
        })),
      );
      setLeitura({ fornecedor: lido.fornecedor, total: lido.valor, confianca: lido.confianca, cortada: lido.cortada });
    } catch (e) {
      setErro(`Não consegui ler a nota: ${e instanceof Error ? e.message : "falha"}. Lance item a item abaixo.`);
    } finally {
      setLendo(false);
    }
  }

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="manutencao_id" value={manutencaoId} />
      <input type="hidden" name="comprovante_path" value={comprovante ?? ""} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded bg-laranja px-4 text-sm font-semibold text-marinho hover:bg-laranja-700 hover:text-areia">
          {enviando || lendo ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
          {lendo ? "Lendo a nota…" : enviando ? "Enviando…" : linhas.length > 0 ? "Trocar a nota" : "Ler a nota da oficina (foto, galeria ou PDF)"}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => tratarArquivo(e.target.files?.[0])} disabled={enviando || lendo} />
        </label>
        {leitura && (
          <span className="text-xs text-marinho-300">
            {leitura.fornecedor ?? "nota"} · {linhas.length} {linhas.length === 1 ? "item" : "itens"}
            {total !== null && ` · total ${reais(total)}`} · lido com {Math.round(leitura.confianca * 100)} % de confiança
          </span>
        )}
      </div>
      {erro && <Alerta tom="atencao">{erro}</Alerta>}
      {leitura?.cortada && <Alerta tom="atencao">A nota é longa e a leitura pode ter ficado incompleta: confira se todos os itens estão aqui.</Alerta>}

      {linhas.length > 0 && (
        <>
          <p className="text-xs text-marinho-300">
            Confira cada linha: <strong>por uso</strong> divide pelas horas voadas desde a última troca; <strong>por tempo</strong> e <strong>igual</strong> dividem em
            partes iguais. Cada item vira uma despesa com o rateio dele.
          </p>
          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={i} className="grid gap-2 rounded border border-marinho-100 p-2 sm:grid-cols-12 dark:border-marinho-300">
                <div className="space-y-1 sm:col-span-5">
                  <Label className="text-xs sm:hidden">Item</Label>
                  <Input name="item_descricao" value={l.descricao} onChange={(e) => mudar(i, "descricao", e.target.value)} className="uppercase" required />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs sm:hidden">Valor</Label>
                  <Input name="item_valor" inputMode="decimal" value={l.valor} onChange={(e) => mudar(i, "valor", e.target.value)} className="tabular font-semibold" required />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs sm:hidden">Divide</Label>
                  <Select name="item_tipo" value={l.tipo} onChange={(e) => mudar(i, "tipo", e.target.value)}>
                    {(Object.keys(ROTULO_TIPO_CUSTO) as TipoCusto[]).map((t) => (
                      <option key={t} value={t}>
                        {ROTULO_TIPO_CUSTO[t]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs sm:hidden">Item do plano</Label>
                  <Select name="item_plano" value={l.plano} onChange={(e) => mudar(i, "plano", e.target.value)}>
                    <option value="">— (avulso)</option>
                    {plano.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.descricao}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-center justify-end sm:col-span-1">
                  <Button type="button" variant="fantasma" size="pequeno" onClick={() => setLinhas((x) => x.filter((_, k) => k !== i))}>
                    tirar
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secundario" size="pequeno" onClick={() => setLinhas((l) => [...l, { descricao: "", valor: "", tipo: "IGUAL", plano: "" }])}>
              <Plus className="size-4" /> linha
            </Button>
            <span className="tabular text-sm">
              Soma dos itens: <strong>{reais(soma)}</strong>
            </span>
            {total !== null && diferenca !== 0 && (
              <Badge variant="atencao">{diferenca > 0 ? `faltam ${reais(diferenca)} para o total da nota` : `${reais(-diferenca)} acima do total da nota`}</Badge>
            )}
            {total !== null && diferenca === 0 && <Badge variant="ok">fecha com o total da nota</Badge>}
            <span className="ml-auto">
              <Botao rotulo={`Lançar ${linhas.length} ${linhas.length === 1 ? "item" : "itens"}`} impedido={soma <= 0} />
            </span>
          </div>
        </>
      )}
    </form>
  );
}
