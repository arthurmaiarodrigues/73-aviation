"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Paperclip, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { enviarArquivo } from "@/lib/upload-cliente";
import { salvarReembolso, type Resultado } from "./acoes";

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
  cidadeInicial,
}: {
  socios: { id: string; apelido: string }[];
  categorias: { id: number; nome: string }[];
  hoje: string;
  /** Última cidade usada: quase sempre é a mesma viagem. */
  cidadeInicial?: string | null;
}) {
  const [estado, acao] = useActionState(salvarReembolso, INICIAL);
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [chave, setChave] = useState(0);
  const [socio, setSocio] = useState("");

  useEffect(() => {
    if (estado.ok && estado.mensagem) {
      setComprovante(null);
      setSocio("");
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
          {enviando ? "Enviando…" : comprovante ? "Trocar nota" : "Anexar nota (foto, galeria ou PDF)"}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => tratarComprovante(e.target.files?.[0])} disabled={enviando} />
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
        <div className="space-y-1.5">
          <Label htmlFor="descricao">O que pagou</Label>
          <Input id="descricao" name="descricao" placeholder="ex.: TAXA DE POUSO SBSV" required className="h-12 uppercase" maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cidade">Cidade</Label>
          <Input id="cidade" name="cidade" defaultValue={cidadeInicial ?? ""} placeholder="ex.: GOIÂNIA" required className="h-12 uppercase" maxLength={60} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="socio_id">Quem deve reembolsar</Label>
          <Select id="socio_id" name="socio_id" value={socio} onChange={(e) => setSocio(e.target.value)} required className="h-12">
            <option value="" disabled>
              Escolha…
            </option>
            <option value="TODOS_IGUAL">TODOS OS SÓCIOS — partes iguais</option>
            <option value="TODOS_HORAS">TODOS OS SÓCIOS — conforme as horas voadas</option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.apelido}
              </option>
            ))}
          </Select>
          <p className="text-xs text-marinho-300">
            {socio === "TODOS_IGUAL"
              ? "Uniforme, salário, CVA, homologação IFR, revisão obrigatória: a sociedade devolve pelo caixa e cada sócio paga 1/4."
              : socio === "TODOS_HORAS"
                ? "Manutenção e peças: a sociedade devolve pelo caixa e cada sócio paga conforme as horas que voou (o administrador pode ajustar o período)."
                : "Gasto de um voo de um sócio só (taxa de pouso, combustível): ele paga direto a você."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="categoria_id">Categoria</Label>
          <Select
            id="categoria_id"
            name="categoria_id"
            defaultValue={taxas ?? ""}
            onChange={(e) => {
              const nome = categorias.find((c) => String(c.id) === e.target.value)?.nome ?? "";
              if (/MANUTEN|PEÇAS|PECAS|ÓLEO|OLEO/.test(nome)) setSocio("TODOS_HORAS");
              else if (/SEGURO|DOCUMENTA|HANGAR|ASSINATURAS|PILOTO/.test(nome)) setSocio("TODOS_IGUAL");
            }}
            className="h-12"
          >
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
