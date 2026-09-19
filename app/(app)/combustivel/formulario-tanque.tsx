"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Fuel, Loader2, Paperclip, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { enviarArquivo } from "@/lib/upload-cliente";
import { data as fmtData, litros as fmtLitros, reais } from "@/lib/formato";
import { apagarMovimentoTanque, salvarMovimentoTanque, type Resultado } from "./acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

type Tipo = "RETIRADA" | "COMPRA" | "AJUSTE";

function Botao({ tipo }: { tipo: Tipo }) {
  const { pending } = useFormStatus();
  const rotulo = tipo === "COMPRA" ? "Registrar compra" : tipo === "AJUSTE" ? "Registrar medição" : "Registrar abastecimento";
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Fuel />}
      {pending ? "Salvando…" : rotulo}
    </Button>
  );
}

/**
 * Um formulário, três movimentos: abastecer o avião pelo tanque (o comum),
 * compra de combustível para o tanque e medição da régua.
 */
export function FormularioTanque({
  socios,
  fornecedores,
  voos,
  hoje,
  socioLogadoId,
  saldoLitros,
  precoLitro,
}: {
  socios: { id: string; apelido: string }[];
  fornecedores: { id: string; nome: string }[];
  voos: { id: string; data: string; socio: string | null; origem: string | null; destino: string | null }[];
  hoje: string;
  socioLogadoId: string | null;
  saldoLitros: number;
  precoLitro: number | null;
}) {
  const [estado, acao] = useActionState(salvarMovimentoTanque, INICIAL);
  const [tipo, setTipo] = useState<Tipo>("RETIRADA");
  const [litros, setLitros] = useState("");
  const [valor, setValor] = useState("");
  const [medido, setMedido] = useState("");
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Gravou: limpa os campos para o próximo lançamento.
  useEffect(() => {
    if (estado.ok && estado.mensagem) {
      setLitros("");
      setValor("");
      setMedido("");
      setComprovante(null);
    }
  }, [estado]);

  const l = Number(litros.replace(",", "."));
  const v = Number(valor.replace(/\./g, "").replace(",", "."));
  const m = Number(medido.replace(",", "."));
  const ajuste = medido !== "" && Number.isFinite(m) ? Math.round((m - saldoLitros) * 10) / 10 : null;

  async function tratarComprovante(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    const r = await enviarArquivo(arquivo, "comprovantes", "COMPROVANTE - COMBUSTIVEL TANQUE");
    setEnviando(false);
    if (!r.ok) return setErro(r.mensagem);
    setComprovante(r.caminho);
  }

  const abas: { chave: Tipo; rotulo: string }[] = [
    { chave: "RETIRADA", rotulo: "Abastecer o avião" },
    { chave: "COMPRA", rotulo: "Compra para o tanque" },
    { chave: "AJUSTE", rotulo: "Medição" },
  ];

  return (
    <form action={acao} className="space-y-5">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="saldo_atual" value={saldoLitros} />
      <input type="hidden" name="comprovante_path" value={comprovante ?? ""} />

      <div className="flex flex-wrap gap-1" role="tablist">
        {abas.map((a) => (
          <button
            key={a.chave}
            type="button"
            role="tab"
            aria-selected={a.chave === tipo}
            onClick={() => setTipo(a.chave)}
            className={`rounded px-3 py-1.5 text-sm font-semibold transition-colors ${a.chave === tipo ? "bg-marinho text-areia dark:bg-laranja" : "text-marinho-300 hover:bg-areia-200 dark:hover:bg-marinho-700"}`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="data">Data</Label>
          <Input id="data" name="data" type="date" defaultValue={hoje} required className="h-12" />
        </div>

        {tipo === "RETIRADA" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="litros">Litros colocados no avião</Label>
              <Input id="litros" name="litros" inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} placeholder="ex.: 120" required className="h-12 text-lg font-semibold tabular" />
              <p className="text-xs text-marinho-300">
                {precoLitro !== null && l > 0 ? `≈ ${reais(l * precoLitro)} a ${reais(precoLitro)}/L (preço médio das compras)` : precoLitro === null ? "Registre a compra do combustível antes da primeira retirada." : "O valor sai do preço médio das compras do tanque."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="socio_id">Por conta de</Label>
              <Select id="socio_id" name="socio_id" defaultValue={socioLogadoId ?? "SOCIEDADE"} className="h-12">
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.apelido}
                  </option>
                ))}
                <option value="SOCIEDADE">Sociedade (dividido entre os 4)</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="voo_id">Voo relacionado</Label>
              <Select id="voo_id" name="voo_id" defaultValue="" className="h-12">
                <option value="">—</option>
                {voos.map((vv) => (
                  <option key={vv.id} value={vv.id}>
                    {fmtData(vv.data)} · {vv.socio ?? "Sociedade"} · {vv.origem ?? "?"} → {vv.destino ?? "?"}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}

        {tipo === "COMPRA" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="litros">Litros comprados</Label>
              <Input id="litros" name="litros" inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} placeholder="ex.: 2000" required className="h-12 text-lg font-semibold tabular" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valor">Valor pago (R$)</Label>
              <Input id="valor" name="valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" required className="h-12 text-lg font-semibold tabular" />
              {l > 0 && v > 0 && <p className="text-xs text-marinho-300">{reais(v / l)} por litro</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="socio_id">Quem pagou</Label>
              <Select id="socio_id" name="socio_id" defaultValue="CAIXA" className="h-12">
                <option value="CAIXA">Caixa da sociedade</option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.apelido} (fica com o crédito)
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fornecedor_id">Fornecedor</Label>
              <Select id="fornecedor_id" name="fornecedor_id" defaultValue="" className="h-12">
                <option value="">—</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2 rounded-lg border border-dashed border-marinho-300 p-4">
              <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded bg-laranja px-4 text-sm font-semibold text-marinho hover:bg-laranja-700 hover:text-areia">
                {enviando ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
                {enviando ? "Enviando…" : comprovante ? "Trocar nota" : "Foto da nota"}
                <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => tratarComprovante(e.target.files?.[0])} disabled={enviando} />
              </label>
              {comprovante && <span className="ml-3 text-xs text-ok">anexada</span>}
              {erro && <p className="mt-2 text-xs text-erro">{erro}</p>}
            </div>
          </>
        )}

        {tipo === "AJUSTE" && (
          <div className="space-y-1.5">
            <Label htmlFor="litros_medidos">Litros medidos no tanque (régua)</Label>
            <Input id="litros_medidos" name="litros_medidos" inputMode="decimal" value={medido} onChange={(e) => setMedido(e.target.value)} placeholder="ex.: 1450" required className="h-12 text-lg font-semibold tabular" />
            <p className="text-xs text-marinho-300">
              Saldo pelo controle: {fmtLitros(saldoLitros)}.{ajuste !== null ? ` Ajuste: ${ajuste > 0 ? "+" : ""}${String(ajuste).replace(".", ",")} L.` : ""}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="observacao">Observação</Label>
        <Textarea id="observacao" name="observacao" placeholder="Opcional" />
      </div>

      <Botao tipo={tipo} />
    </form>
  );
}

export function BotaoApagarMovimento({ id }: { id: string }) {
  const [confirmar, setConfirmar] = useState(false);
  if (!confirmar)
    return (
      <button type="button" onClick={() => setConfirmar(true)} title="Apagar" className="text-marinho-300 hover:text-erro">
        <Trash2 className="size-4" />
      </button>
    );
  return (
    <form action={async () => { await apagarMovimentoTanque(id); }} className="flex items-center gap-2">
      <Button type="submit" variant="destrutivo" size="pequeno">
        Apagar
      </Button>
      <Button type="button" variant="fantasma" size="pequeno" onClick={() => setConfirmar(false)}>
        Não
      </Button>
    </form>
  );
}
