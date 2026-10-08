"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { FileText, Loader2, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { Badge } from "@/components/ui/badge";
import { enviarArquivo } from "@/lib/upload-cliente";
import { lerLinhaDigitavel } from "@/lib/boleto/linha";
import { cn } from "@/lib/utils";
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
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
};

type Leitura = { confianca: number; conferido: boolean; observacao: string; beneficiario: string | null; semCadastro: string | null };

/** Boleto a pagar: vencimento, valor e o anexo — lidos da foto quando dá. */
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
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<Leitura | null>(null);

  const [descricao, setDescricao] = useState(conta?.descricao ?? "");
  const [valor, setValor] = useState(conta ? conta.valor.toFixed(2).replace(".", ",") : "");
  const [vencimento, setVencimento] = useState(conta?.vencimento ?? hoje);
  const [fornecedorId, setFornecedorId] = useState(conta?.fornecedor_id ?? "");
  const [categoriaId, setCategoriaId] = useState(conta?.categoria_id ? String(conta.categoria_id) : "");
  const [documento, setDocumento] = useState(conta?.documento ?? "");
  const [linha, setLinha] = useState(conta?.linha_digitavel ?? "");
  const [pix, setPix] = useState(conta?.pix_copia_cola ?? "");
  const digitos = linha.replace(/\D/g, "");
  const linhaConfere = digitos.length === 0 ? null : lerLinhaDigitavel(digitos);

  async function tratarArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    // Sobe e manda ler ao mesmo tempo; a leitura é acessória.
    const leituraPromessa = ler(arquivo);
    const r = await enviarArquivo(arquivo, "comprovantes", "BOLETO");
    setEnviando(false);
    if (r.ok) setBoleto(r.caminho);
    else setErro(r.mensagem);
    await leituraPromessa;
  }

  async function ler(arquivo: File) {
    setLendo(true);
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      const resp = await fetch("/api/boleto", { method: "POST", body: form });
      const lido = (await resp.json()) as {
        erro?: string;
        legivel: boolean;
        beneficiario: string | null;
        vencimento: string | null;
        valor: number | null;
        documento: string | null;
        linha_digitavel: string | null;
        pix_copia_cola: string | null;
        descricao: string | null;
        categoria: string | null;
        conferido: boolean;
        confianca: number;
        observacao: string;
      };
      if (!resp.ok) throw new Error(lido.erro ?? "Falha na leitura.");

      if (lido.vencimento) setVencimento(lido.vencimento);
      if (lido.valor !== null) setValor(lido.valor.toFixed(2).replace(".", ","));
      if (lido.documento) setDocumento(lido.documento);
      if (lido.linha_digitavel) setLinha(lido.linha_digitavel);
      if (lido.pix_copia_cola) setPix(lido.pix_copia_cola);
      if (lido.descricao) setDescricao(lido.descricao);
      const cat = categorias.find((c) => c.nome === lido.categoria);
      if (cat) setCategoriaId(String(cat.id));
      // Beneficiário: casa com o cadastro pelo começo do nome.
      let semCadastro: string | null = null;
      if (lido.beneficiario) {
        const primeiro = lido.beneficiario.split(/\s+/)[0];
        const achado = fornecedores.find((f) => f.nome === lido.beneficiario) ?? fornecedores.find((f) => f.nome.startsWith(primeiro) && primeiro.length >= 4);
        if (achado) setFornecedorId(achado.id);
        else semCadastro = lido.beneficiario;
      }
      setLeitura({ confianca: lido.confianca, conferido: lido.conferido, observacao: lido.observacao, beneficiario: lido.beneficiario, semCadastro });
      if (!lido.legivel) setErro("Anexei o boleto, mas não consegui ler os campos. Preencha à mão.");
    } catch (e) {
      setErro(`Boleto anexado, mas não consegui ler: ${e instanceof Error ? e.message : "falha"}. Preencha à mão.`);
    } finally {
      setLendo(false);
    }
  }

  return (
    <form action={acao} className="space-y-5">
      {conta && <input type="hidden" name="id" value={conta.id} />}
      <input type="hidden" name="boleto_path" value={boleto ?? ""} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}

      <div className="rounded-lg border border-dashed border-marinho-300 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded bg-laranja px-4 text-sm font-semibold text-marinho hover:bg-laranja-700 hover:text-areia">
            {enviando || lendo ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            {lendo ? "Lendo o boleto…" : enviando ? "Enviando…" : boleto ? "Trocar o boleto" : "Anexar o boleto (foto, galeria ou PDF)"}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => tratarArquivo(e.target.files?.[0])} disabled={enviando || lendo} />
          </label>
          {boleto && !lendo && <span className="text-xs text-ok">anexado</span>}
          {leitura && (
            <span className="flex flex-wrap items-center gap-2 text-xs text-marinho-300">
              lido da foto ({Math.round(leitura.confianca * 100)} %) — confira os campos
              {leitura.conferido && <Badge variant="ok">valor e vencimento conferidos pela linha digitável</Badge>}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-marinho-300">O app lê beneficiário, vencimento, valor e o número do documento; você confere e lança.</p>
        {leitura?.semCadastro && (
          <p className="mt-1 text-xs text-atencao">
            Beneficiário do boleto: {leitura.semCadastro} — não está no cadastro de fornecedores. Escolha um da lista ou cadastre depois.
          </p>
        )}
        {leitura?.observacao && <p className="mt-1 text-xs text-atencao">{leitura.observacao}</p>}
        {erro && <p className="mt-1 text-xs text-erro">{erro}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="descricao">O que é</Label>
          <Input id="descricao" name="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="HANGAR OUTUBRO" className="h-12 uppercase" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="valor">Valor (R$)</Label>
          <Input id="valor" name="valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="tabular h-12 text-lg font-semibold" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vencimento">Vence em</Label>
          <Input id="vencimento" name="vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className="h-12" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fornecedor_id">Para quem</Label>
          <Select id="fornecedor_id" name="fornecedor_id" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="h-12">
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
          <Select id="categoria_id" name="categoria_id" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="h-12">
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
          <Input id="documento" name="documento" value={documento} onChange={(e) => setDocumento(e.target.value)} className="h-12 uppercase" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="observacao">Observação</Label>
          <Textarea id="observacao" name="observacao" defaultValue={conta?.observacao ?? ""} rows={2} className="uppercase" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="linha_digitavel">Linha digitável (código de barras)</Label>
          <Input
            id="linha_digitavel"
            name="linha_digitavel"
            value={linha}
            onChange={(e) => setLinha(e.target.value)}
            inputMode="numeric"
            placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
            className="tabular h-12"
          />
          {linhaConfere && (
            <p className={cn("text-xs", linhaConfere.valida ? "text-ok" : "text-atencao")}>
              {linhaConfere.valida
                ? `código confere${linhaConfere.vencimento ? ` · vence ${linhaConfere.vencimento.split("-").reverse().join("/")}` : ""}${
                    linhaConfere.valor ? ` · R$ ${linhaConfere.valor.toFixed(2).replace(".", ",")}` : ""
                  }`
                : `${digitos.length} dígitos — confira o código (o esperado são 47, ou 48 em conta de consumo)`}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pix_copia_cola">PIX copia e cola</Label>
          <Textarea
            id="pix_copia_cola"
            name="pix_copia_cola"
            value={pix}
            onChange={(e) => setPix(e.target.value)}
            rows={2}
            placeholder="cole aqui o código PIX do boleto, se houver"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
