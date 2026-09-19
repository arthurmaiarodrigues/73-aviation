"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Paperclip, Receipt, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { enviarArquivo } from "@/lib/upload-cliente";
import { marcarReembolsado, salvarReembolso, type Resultado } from "./acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Receipt />}
      {pending ? "Salvando…" : "Lançar para reembolso"}
    </Button>
  );
}

/** Piloto: o que pagou, quanto, por conta de quem, foto da nota. */
export function FormularioReembolso({
  socios,
  categorias,
  hoje,
}: {
  socios: { id: string; apelido: string }[];
  categorias: { id: number; nome: string }[];
  hoje: string;
}) {
  const [estado, acao] = useActionState(salvarReembolso, INICIAL);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [chave, setChave] = useState(0);

  useEffect(() => {
    if (estado.ok && estado.mensagem) {
      setComprovante(null);
      setChave((k) => k + 1);
    }
  }, [estado]);

  async function tratarComprovante(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    const r = await enviarArquivo(arquivo, "comprovantes", "COMPROVANTE - REEMBOLSO PILOTO");
    setEnviando(false);
    if (!r.ok) return setErro(r.mensagem);
    setComprovante(r.caminho);
  }

  const taxas = categorias.find((c) => /POUSO/.test(c.nome))?.id ?? categorias[0]?.id;

  return (
    <form key={chave} action={acao} className="space-y-5">
      <input type="hidden" name="comprovante_path" value={comprovante ?? ""} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}

      <div className="rounded-lg border border-dashed border-marinho-300 p-4">
        <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded bg-laranja px-4 text-sm font-semibold text-marinho hover:bg-laranja-700 hover:text-areia">
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
          {enviando ? "Enviando…" : comprovante ? "Trocar nota" : "Foto da nota"}
          <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => tratarComprovante(e.target.files?.[0])} disabled={enviando} />
        </label>
        {comprovante && <span className="ml-3 text-xs text-ok">anexada</span>}
        {erro && <p className="mt-2 text-xs text-erro">{erro}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="data">Data</Label>
          <Input id="data" name="data" type="date" defaultValue={hoje} required className="h-12" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="valor">Valor pago (R$)</Label>
          <Input id="valor" name="valor" inputMode="decimal" placeholder="0,00" required className="h-12 text-lg font-semibold tabular" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="descricao">O que pagou</Label>
          <Input id="descricao" name="descricao" placeholder="ex.: TAXA DE POUSO SBSV" required className="h-12 uppercase" maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="socio_id">Quem deve reembolsar</Label>
          <Select id="socio_id" name="socio_id" defaultValue="" required className="h-12">
            <option value="" disabled>
              Escolha o sócio…
            </option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.apelido}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="categoria_id">Categoria</Label>
          <Select id="categoria_id" name="categoria_id" defaultValue={taxas ?? ""} className="h-12">
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="observacao">Observação</Label>
          <Textarea id="observacao" name="observacao" placeholder="Opcional" />
        </div>
      </div>
      <Botao />
    </form>
  );
}

export function BotaoReembolsado({ id, reembolsado }: { id: string; reembolsado: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant={reembolsado ? "fantasma" : "secundario"}
        size="pequeno"
        disabled={pendente}
        onClick={() => iniciar(async () => setMsg((await marcarReembolsado(id, reembolsado)).mensagem))}
      >
        {pendente ? <Loader2 className="animate-spin" /> : reembolsado ? <Undo2 /> : <Check />}
        {reembolsado ? "desfazer" : "Marcar como reembolsado"}
      </Button>
      {msg && <span className="text-xs text-marinho-300">{msg}</span>}
    </span>
  );
}
