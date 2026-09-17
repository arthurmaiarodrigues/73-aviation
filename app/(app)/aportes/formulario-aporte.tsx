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
  const [erro, setErro] = useState<string | null>(null);

  async function tratarComprovante(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    const r = await enviarArquivo(arquivo, "comprovantes", "COMPROVANTE - APORTE");
    setEnviando(false);
    if (!r.ok) return setErro(r.mensagem);
    setComprovante(r.caminho);
  }

  return (
    <form action={acao} className="space-y-5">
      <input type="hidden" name="comprovante_path" value={comprovante ?? ""} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="socio_id">Sócio</Label>
          <Select id="socio_id" name="socio_id" defaultValue={socioLogadoId ?? ""} required className="h-12">
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
          <Input id="data" name="data" type="date" defaultValue={hoje} required className="h-12" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="valor">Valor (R$)</Label>
          <Input id="valor" name="valor" inputMode="decimal" placeholder="0,00" required className="h-12 text-lg font-semibold tabular" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="descricao">Descrição</Label>
          <Input id="descricao" name="descricao" placeholder="ex.: APORTE MENSAL" className="h-12 uppercase" />
        </div>
        <div className="space-y-1.5">
          <Label>Comprovante</Label>
          <label className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded border border-marinho-100 bg-areia-200 px-4 text-sm font-semibold hover:border-laranja dark:border-marinho-300 dark:bg-marinho-700">
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            {comprovante ? "Anexado" : "Foto ou PDF"}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => tratarComprovante(e.target.files?.[0])} disabled={enviando} />
          </label>
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
