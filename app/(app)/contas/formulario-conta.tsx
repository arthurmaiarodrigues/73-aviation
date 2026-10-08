"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { FileText, Loader2, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { enviarArquivo } from "@/lib/upload-cliente";
import { salvarConta, type Resultado } from "./acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao({ edicao }: { edicao: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <FileText />}
      {pending ? "Salvando…" : edicao ? "Salvar conta" : "Lançar conta"}
    </Button>
  );
}

export type ContaParaEditar = {
  id: string;
  descricao: string;
  valor: number;
  vencimento: string;
  documento: string | null;
  observacao: string | null;
  fornecedor_id: string | null;
  categoria_id: number | null;
};

/** Boleto a pagar: vencimento, valor e o anexo. Não gera custo. */
export function FormularioConta({
  fornecedores,
  categorias,
  hoje,
  conta,
}: {
  fornecedores: { id: string; nome: string }[];
  categorias: { id: number; nome: string }[];
  hoje: string;
  conta?: ContaParaEditar;
}) {
  const [estado, acao] = useActionState(salvarConta, INICIAL);
  const [boleto, setBoleto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function tratarArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    const r = await enviarArquivo(arquivo, "comprovantes", "BOLETO");
    setEnviando(false);
    if (!r.ok) return setErro(r.mensagem);
    setBoleto(r.caminho);
  }

  return (
    <form action={acao} className="space-y-5">
      {conta && <input type="hidden" name="id" value={conta.id} />}
      <input type="hidden" name="boleto_path" value={boleto ?? ""} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="descricao">O que é</Label>
          <Input id="descricao" name="descricao" defaultValue={conta?.descricao ?? ""} placeholder="HANGAR OUTUBRO" className="h-12 uppercase" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="valor">Valor (R$)</Label>
          <Input id="valor" name="valor" inputMode="decimal" defaultValue={conta ? conta.valor.toFixed(2).replace(".", ",") : ""} className="tabular h-12 text-lg font-semibold" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vencimento">Vence em</Label>
          <Input id="vencimento" name="vencimento" type="date" defaultValue={conta?.vencimento ?? hoje} className="h-12" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fornecedor_id">Para quem</Label>
          <Select id="fornecedor_id" name="fornecedor_id" defaultValue={conta?.fornecedor_id ?? ""} className="h-12">
            <option value="">—</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="categoria_id">Categoria</Label>
          <Select id="categoria_id" name="categoria_id" defaultValue={conta?.categoria_id ? String(conta.categoria_id) : ""} className="h-12">
            <option value="">—</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="documento">Documento (boleto, NF)</Label>
          <Input id="documento" name="documento" defaultValue={conta?.documento ?? ""} className="h-12 uppercase" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="observacao">Observação</Label>
          <Textarea id="observacao" name="observacao" defaultValue={conta?.observacao ?? ""} rows={2} className="uppercase" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded border border-marinho-300 px-4 text-sm font-semibold hover:border-laranja">
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
          {boleto ? "Trocar o boleto" : "Anexar o boleto (foto, galeria ou PDF)"}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => tratarArquivo(e.target.files?.[0])} disabled={enviando} />
        </label>
        {boleto && <span className="text-xs text-ok">anexado</span>}
        {erro && <span className="text-xs text-erro">{erro}</span>}
        <span className="ml-auto">
          <Botao edicao={Boolean(conta)} />
        </span>
      </div>
      <p className="text-xs text-marinho-300">
        A conta a pagar é só controle de vencimento: não entra em rateio nem no extrato. O custo entra quando a nota for lançada em Despesas — aí é só ligar as duas.
      </p>
    </form>
  );
}
