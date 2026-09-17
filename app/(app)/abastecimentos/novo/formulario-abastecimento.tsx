"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Fuel, Loader2, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { SeletorAerodromo } from "@/components/seletor-aerodromo";
import { enviarArquivo } from "@/lib/upload-cliente";
import { data as fmtData } from "@/lib/formato";
import { salvarAbastecimento, type Resultado } from "../acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Fuel />}
      {pending ? "Salvando…" : "Registrar abastecimento"}
    </Button>
  );
}

export function FormularioAbastecimento({
  socios,
  aerodromos,
  voos,
  hoje,
  socioLogadoId,
  base,
}: {
  socios: { id: string; apelido: string }[];
  aerodromos: string[];
  voos: { id: string; data: string; socio: string | null; origem: string | null; destino: string | null }[];
  hoje: string;
  socioLogadoId: string | null;
  base: string;
}) {
  const [estado, acao] = useActionState(salvarAbastecimento, INICIAL);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [litros, setLitros] = useState("");
  const [valor, setValor] = useState("");

  const l = Number(litros.replace(",", "."));
  const v = Number(valor.replace(/\./g, "").replace(",", "."));
  const precoLitro = l > 0 && v > 0 ? v / l : null;

  async function tratarComprovante(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    const r = await enviarArquivo(arquivo, "comprovantes", "COMPROVANTE - COMBUSTIVEL");
    setEnviando(false);
    if (!r.ok) return setErro(r.mensagem);
    setComprovante(r.caminho);
  }

  return (
    <form action={acao} className="space-y-5">
      <input type="hidden" name="comprovante_path" value={comprovante ?? ""} />
      {!estado.ok && estado.mensagem && <Alerta tom="erro">{estado.mensagem}</Alerta>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="data">Data</Label>
          <Input id="data" name="data" type="date" defaultValue={hoje} required className="h-12" />
        </div>
        <SeletorAerodromo nome="aerodromo" rotulo="Onde abasteceu" opcoes={aerodromos} valorInicial={base} />
        <div className="space-y-1.5">
          <Label htmlFor="litros">Litros</Label>
          <Input id="litros" name="litros" inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} placeholder="ex.: 115" required className="h-12 text-lg font-semibold tabular" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="valor">Valor pago (R$)</Label>
          <Input id="valor" name="valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" required className="h-12 text-lg font-semibold tabular" />
          {precoLitro && <p className="text-xs text-marinho-300 tabular">{precoLitro.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por litro</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pagador">Quem pagou</Label>
          <Select id="pagador" name="pagador" defaultValue={socioLogadoId ?? "CAIXA"} className="h-12">
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.apelido}
              </option>
            ))}
            <option value="CAIXA">Caixa da sociedade</option>
          </Select>
          <p className="text-xs text-marinho-300">Sócio: custo direto dele e os litros entram no saldo dele. Caixa: rateio igual.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="voo_id">Voo relacionado</Label>
          <Select id="voo_id" name="voo_id" defaultValue="" className="h-12">
            <option value="">—</option>
            {voos.map((vo) => (
              <option key={vo.id} value={vo.id}>
                {fmtData(vo.data)} · {vo.origem ?? "?"} → {vo.destino ?? "?"} · {vo.socio ?? "Sociedade"}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Comprovante</Label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded border border-marinho-100 bg-areia-200 px-4 text-sm font-semibold hover:border-laranja dark:border-marinho-300 dark:bg-marinho-700">
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            {comprovante ? "Trocar comprovante" : "Foto ou PDF"}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => tratarComprovante(e.target.files?.[0])} disabled={enviando} />
          </label>
          {comprovante && <span className="text-xs text-ok">anexado</span>}
          {erro && <span className="text-xs text-erro">{erro}</span>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="observacao">Observação</Label>
        <Textarea id="observacao" name="observacao" placeholder="Opcional" />
      </div>

      <Botao />
    </form>
  );
}
