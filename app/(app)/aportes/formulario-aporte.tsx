"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Paperclip, PiggyBank, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { enviarArquivo } from "@/lib/upload-cliente";
import { apagarAporte, salvarAporte, type Resultado } from "./acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <PiggyBank />}
      {pending ? "Salvando…" : "Registrar aporte"}
    </Button>
  );
}

export function FormularioAporte({ socios, hoje, socioLogadoId }: { socios: { id: string; apelido: string }[]; hoje: string; socioLogadoId: string | null }) {
  const [estado, acao] = useActionState(salvarAporte, INICIAL);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<{ confianca: number; observacao: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [socio, setSocio] = useState(socioLogadoId ?? "");
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");

  async function tratarComprovante(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    // Sobe e manda ler ao mesmo tempo; a leitura é acessória.
    const leituraPromessa = ler(arquivo);
    const r = await enviarArquivo(arquivo, "comprovantes", "COMPROVANTE - APORTE");
    setEnviando(false);
    if (r.ok) setComprovante(r.caminho);
    else setErro(r.mensagem);
    await leituraPromessa;
  }

  /** Comprovante de PIX/transferência: tira dele a data, o valor e quem mandou. */
  async function ler(arquivo: File) {
    setLendo(true);
    setAviso(null);
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      const resp = await fetch("/api/aporte", { method: "POST", body: form });
      const lido = (await resp.json()) as { erro?: string; legivel: boolean; pagador: string | null; data: string | null; valor: number | null; descricao: string | null; confianca: number; observacao: string };
      if (!resp.ok) throw new Error(lido.erro ?? "Falha na leitura.");
      if (lido.data) setData(lido.data);
      if (lido.valor !== null) setValor(lido.valor.toFixed(2).replace(".", ","));
      if (lido.descricao) setDescricao(lido.descricao);
      // Quem pagou é o sócio do aporte: se o nome bate, já marca ele.
      const nome = (lido.pagador ?? "").toUpperCase();
      const doSocio = socios.find((s) => nome.includes(s.apelido));
      if (doSocio) setSocio(doSocio.id);
      else if (nome) setAviso(`Quem pagou no comprovante: ${nome}. Confira o sócio.`);
      setLeitura({ confianca: lido.confianca, observacao: lido.observacao });
      if (!lido.legivel) setErro("Anexei o comprovante, mas não consegui ler os campos. Preencha à mão.");
    } catch (e) {
      setErro(`Comprovante anexado, mas não consegui ler: ${e instanceof Error ? e.message : "falha"}. Preencha à mão.`);
    } finally {
      setLendo(false);
    }
  }

  return (
    <form action={acao} className="space-y-5">
      <input type="hidden" name="comprovante_path" value={comprovante ?? ""} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="socio_id">Sócio</Label>
          <Select id="socio_id" name="socio_id" value={socio} onChange={(e) => setSocio(e.target.value)} required className="h-12">
            <option value="" disabled>
              Escolha…
            </option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.apelido}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="data">Data</Label>
          <Input id="data" name="data" type="date" value={data} onChange={(e) => setData(e.target.value)} required className="h-12" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="valor">Valor (R$)</Label>
          <Input id="valor" name="valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" required className="h-12 text-lg font-semibold tabular" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="descricao">Descrição</Label>
          <Input id="descricao" name="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex.: APORTE MENSAL" className="h-12 uppercase" />
        </div>
        <div className="space-y-1.5">
          <Label>Comprovante</Label>
          <label className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded border border-marinho-100 bg-areia-200 px-4 text-sm font-semibold hover:border-laranja dark:border-marinho-300 dark:bg-marinho-700">
            {enviando || lendo ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            {lendo ? "Lendo…" : comprovante ? "Anexado" : "Foto ou PDF"}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => tratarComprovante(e.target.files?.[0])} disabled={enviando || lendo} />
          </label>
          {leitura && <p className="text-xs text-marinho-300">lido do comprovante ({Math.round(leitura.confianca * 100)} %) — confira os campos</p>}
          {aviso && <p className="text-xs text-atencao">{aviso}</p>}
          {leitura?.observacao && <p className="text-xs text-atencao">{leitura.observacao}</p>}
          {erro && <p className="text-xs text-erro">{erro}</p>}
        </div>
      </div>

      <Botao />
    </form>
  );
}

export function BotaoApagarAporte({ id }: { id: string }) {
  const [confirmar, setConfirmar] = useState(false);
  if (!confirmar)
    return (
      <button type="button" onClick={() => setConfirmar(true)} title="Apagar" className="text-marinho-300 hover:text-erro">
        <Trash2 className="size-4" />
      </button>
    );
  return (
    <form action={async () => { await apagarAporte(id); }} className="flex items-center gap-2">
      <Button type="submit" variant="destrutivo" size="pequeno">
        Apagar
      </Button>
      <Button type="button" variant="fantasma" size="pequeno" onClick={() => setConfirmar(false)}>
        Não
      </Button>
    </form>
  );
}
