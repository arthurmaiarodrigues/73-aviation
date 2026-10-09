"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Paperclip, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { enviarArquivo } from "@/lib/upload-cliente";
import { editarMovimentoTanque, type Resultado } from "../acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Save />}
      {pending ? "Salvando…" : "Salvar correção"}
    </Button>
  );
}

export type MovimentoParaEditar = {
  id: string;
  data: string;
  tipo: "COMPRA" | "RETIRADA" | "AJUSTE";
  litros: number;
  valor: number | null;
  socio_id: string | null;
  fornecedor_id: string | null;
  observacao: string | null;
};

/** Corrige um movimento do tanque já lançado. */
export function EditarMovimento({
  movimento,
  socios,
  fornecedores,
}: {
  movimento: MovimentoParaEditar;
  socios: { id: string; apelido: string }[];
  fornecedores: { id: string; nome: string }[];
}) {
  const [estado, acao] = useActionState(editarMovimentoTanque, INICIAL);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const compra = movimento.tipo === "COMPRA";
  const dec = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ","));

  async function anexar(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    const r = await enviarArquivo(arquivo, "comprovantes", "COMPROVANTE - TANQUE");
    setEnviando(false);
    if (!r.ok) return setErro(r.mensagem);
    setComprovante(r.caminho);
  }

  return (
    <form action={acao} className="space-y-5">
      <input type="hidden" name="id" value={movimento.id} />
      <input type="hidden" name="comprovante_path" value={comprovante ?? ""} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="data">Data</Label>
          <Input id="data" name="data" type="date" defaultValue={movimento.data} className="h-12" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="litros">Litros</Label>
          <Input
            id="litros"
            name="litros"
            inputMode="decimal"
            defaultValue={String(Math.abs(movimento.litros)).replace(".", ",")}
            className="tabular h-12 text-lg font-semibold"
            required
          />
        </div>
        {compra && (
          <div className="space-y-1.5">
            <Label htmlFor="valor">Valor pago (R$)</Label>
            <Input id="valor" name="valor" inputMode="decimal" defaultValue={dec(movimento.valor)} className="tabular h-12 text-lg font-semibold" required />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="socio_id">{compra ? "Quem pagou" : "Por conta de"}</Label>
          <Select id="socio_id" name="socio_id" defaultValue={movimento.socio_id ?? (compra ? "CAIXA" : "SOCIEDADE")} className="h-12">
            <option value={compra ? "CAIXA" : "SOCIEDADE"}>{compra ? "Caixa da sociedade" : "Sociedade (uso comum)"}</option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.apelido}
              </option>
            ))}
          </Select>
        </div>
        {compra && (
          <div className="space-y-1.5">
            <Label htmlFor="fornecedor_id">Fornecedor</Label>
            <Select id="fornecedor_id" name="fornecedor_id" defaultValue={movimento.fornecedor_id ?? ""} className="h-12">
              <option value="">—</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="observacao">Observação</Label>
          <Textarea id="observacao" name="observacao" defaultValue={movimento.observacao ?? ""} rows={2} className="uppercase" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded border border-marinho-300 px-4 text-sm font-semibold hover:border-laranja">
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
          {comprovante ? "Trocar o comprovante" : "Trocar o comprovante (foto, galeria ou PDF)"}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => anexar(e.target.files?.[0])} disabled={enviando} />
        </label>
        {erro && <span className="text-xs text-erro">{erro}</span>}
        <span className="ml-auto">
          <Botao />
        </span>
      </div>
      <p className="text-xs text-marinho-300">
        {compra
          ? "Mudar o valor ou os litros reajusta a despesa da compra, o preço médio do tanque e a divisão da próxima compra."
          : "Mudar os litros reajusta o abastecimento do avião e o quanto este sócio retirou do tanque."}
      </p>
    </form>
  );
}
