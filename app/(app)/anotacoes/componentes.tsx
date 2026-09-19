"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Camera, Check, Loader2, NotebookPen, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { enviarArquivo } from "@/lib/upload-cliente";
import { apagarAnotacao, resolverAnotacao, salvarAnotacao, type Resultado } from "./acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <NotebookPen />}
      {pending ? "Salvando…" : "Anotar"}
    </Button>
  );
}

export function FormularioAnotacao({ hoje, horimetro }: { hoje: string; horimetro: number | null }) {
  const [estado, acao] = useActionState(salvarAnotacao, INICIAL);
  const [foto, setFoto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [chave, setChave] = useState(0);

  useEffect(() => {
    if (estado.ok && estado.mensagem) {
      setFoto(null);
      setChave((k) => k + 1);
    }
  }, [estado]);

  async function tratarFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    const r = await enviarArquivo(arquivo, "anotacoes", "ANOTACAO");
    setEnviando(false);
    if (!r.ok) return setErro(r.mensagem);
    setFoto(r.caminho);
  }

  return (
    <form key={chave} action={acao} className="space-y-4">
      <input type="hidden" name="foto_path" value={foto ?? ""} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <div className="space-y-1.5">
        <Label htmlFor="descricao">O que você notou</Label>
        <Textarea id="descricao" name="descricao" placeholder="ex.: LUZ DE NAVEGAÇÃO ESQUERDA PISCANDO · VAZAMENTO LEVE DE ÓLEO NO DRENO · PNEU DIREITO CARECA" required className="uppercase" rows={3} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="gravidade">Gravidade</Label>
          <Select id="gravidade" name="gravidade" defaultValue="OBSERVACAO" className="h-12">
            <option value="OBSERVACAO">Observação — vê na próxima revisão</option>
            <option value="ATENCAO">Atenção — resolver logo</option>
            <option value="URGENTE">Urgente — avisa os sócios agora</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="data">Data</Label>
          <Input id="data" name="data" type="date" defaultValue={hoje} required className="h-12" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="horimetro">Horímetro</Label>
          <Input id="horimetro" name="horimetro" inputMode="decimal" defaultValue={horimetro !== null ? String(horimetro).replace(".", ",") : ""} className="h-12 tabular" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded bg-laranja px-4 text-sm font-semibold text-marinho hover:bg-laranja-700 hover:text-areia">
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          {enviando ? "Enviando…" : foto ? "Trocar foto" : "Foto do problema"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => tratarFoto(e.target.files?.[0])} disabled={enviando} />
        </label>
        {foto && <span className="text-xs text-ok">foto anexada</span>}
        {erro && <span className="text-xs text-erro">{erro}</span>}
      </div>
      <Botao />
    </form>
  );
}

export function BotoesAnotacao({ id, resolvida }: { id: string; resolvida: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [modo, setModo] = useState<"nada" | "resolver" | "apagar">("nada");
  const [resolucao, setResolucao] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (modo === "resolver")
    return (
      <span className="flex w-full flex-wrap items-center gap-2">
        <Input value={resolucao} onChange={(e) => setResolucao(e.target.value)} placeholder="o que foi feito (opcional)" className="h-9 max-w-xs uppercase" />
        <Button type="button" size="pequeno" disabled={pendente} onClick={() => iniciar(async () => { setMsg((await resolverAnotacao(id, resolucao)).mensagem); setModo("nada"); })}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />} Confirmar
        </Button>
        <Button type="button" size="pequeno" variant="fantasma" onClick={() => setModo("nada")}>
          Não
        </Button>
      </span>
    );
  if (modo === "apagar")
    return (
      <span className="inline-flex items-center gap-2">
        <Button type="button" size="pequeno" variant="destrutivo" disabled={pendente} onClick={() => iniciar(async () => { await apagarAnotacao(id); setModo("nada"); })}>
          Apagar
        </Button>
        <Button type="button" size="pequeno" variant="fantasma" onClick={() => setModo("nada")}>
          Não
        </Button>
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {resolvida ? (
        <Button type="button" size="pequeno" variant="fantasma" disabled={pendente} onClick={() => iniciar(async () => setMsg((await resolverAnotacao(id, null, true)).mensagem))}>
          <Undo2 /> reabrir
        </Button>
      ) : (
        <Button type="button" size="pequeno" variant="secundario" onClick={() => setModo("resolver")}>
          <Check /> Resolvida
        </Button>
      )}
      <button type="button" onClick={() => setModo("apagar")} title="Apagar" className="text-marinho-300 hover:text-erro">
        <Trash2 className="size-4" />
      </button>
      {msg && <span className="text-xs text-marinho-300">{msg}</span>}
    </span>
  );
}
