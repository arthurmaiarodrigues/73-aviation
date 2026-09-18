"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { cn } from "@/lib/utils";
import { data as fmtData, reais } from "@/lib/formato";
import type { Sugestao } from "@/lib/dados/conciliacao";
import { conciliar, desfazer, ignorar, importarExtrato, lancarAporteDaLinha, lancarDespesaDaLinha, type Resultado } from "./acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function BotaoImportar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Upload />}
      {pending ? "Lendo o extrato…" : "Importar extrato"}
    </Button>
  );
}

export function FormularioImportar() {
  const [estado, acao] = useActionState(importarExtrato, INICIAL);
  return (
    <form action={acao} className="space-y-3">
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="arquivo" className="text-xs">
            Arquivo do extrato (OFX ou CSV exportado do internet banking)
          </Label>
          <Input id="arquivo" name="arquivo" type="file" accept=".ofx,.csv,.txt,text/csv,application/x-ofx" required className="h-11 file:mr-3 file:rounded file:border-0 file:bg-laranja file:px-3 file:py-1 file:text-sm file:font-semibold file:text-marinho" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="conta" className="text-xs">
            Conta (só para CSV)
          </Label>
          <Input id="conta" name="conta" placeholder="SICOOB" className="uppercase" />
        </div>
      </div>
      <BotaoImportar />
      <p className="text-xs text-marinho-300">Sicoob: Extrato → Exportar → OFX (melhor) ou CSV. Importar o mesmo período de novo não duplica.</p>
    </form>
  );
}

/** As ações de uma linha pendente: aceitar sugestão, escolher à mão, lançar, ignorar. */
export function AcoesLinha({
  linhaId,
  valor,
  descricao,
  sugestoes,
  despesas,
  aportes,
  categorias,
  socios,
}: {
  linhaId: string;
  valor: number;
  descricao: string | null;
  sugestoes: Sugestao[];
  despesas: { id: string; data: string; descricao: string; valor: number }[];
  aportes: { id: string; data: string; descricao: string; valor: number }[];
  categorias: { id: number; nome: string }[];
  socios: { id: string; apelido: string }[];
}) {
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [modo, setModo] = useState<"nenhum" | "manual" | "lancar" | "ignorar">("nenhum");
  const [escolha, setEscolha] = useState("");
  const [categoria, setCategoria] = useState(String(categorias.find((c) => c.nome === "OUTROS")?.id ?? categorias[0]?.id ?? ""));
  const [descricaoNova, setDescricaoNova] = useState(descricao ?? "");
  const [criterio, setCriterio] = useState<"IGUAL" | "POR_HORAS">("IGUAL");
  const [socio, setSocio] = useState(socios[0]?.id ?? "");
  const [motivo, setMotivo] = useState("TARIFA BANCÁRIA");

  const rodar = (fn: () => Promise<Resultado>) =>
    iniciar(async () => {
      setResultado(await fn());
      setModo("nenhum");
    });

  const saida = valor < 0;
  const candidatos = saida ? despesas.filter((d) => Math.abs(d.valor + valor) < 0.005) : aportes.filter((a) => Math.abs(a.valor - valor) < 0.005);
  const outros = saida ? despesas : aportes;

  return (
    <div className="space-y-2">
      {sugestoes.length > 0 && modo === "nenhum" && (
        <div className="flex flex-wrap gap-2">
          {sugestoes.slice(0, 3).map((s) => (
            <Button key={s.id} type="button" size="pequeno" variant="primario" disabled={pendente} onClick={() => rodar(() => conciliar(linhaId, s.tipo, s.id))} title={`${s.tipo} de ${fmtData(s.data)} · ${s.quem}`}>
              <Check /> {s.tipo === "DESPESA" ? "É esta despesa" : "É este aporte"}: {s.descricao.slice(0, 32)}
              {s.dias > 0 ? ` (${s.dias} d)` : ""}
            </Button>
          ))}
        </div>
      )}

      {modo === "nenhum" && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Button type="button" size="pequeno" variant="fantasma" onClick={() => setModo("manual")}>
            escolher {saida ? "despesa" : "aporte"}…
          </Button>
          <Button type="button" size="pequeno" variant="fantasma" onClick={() => setModo("lancar")}>
            {saida ? "lançar como despesa nova" : "lançar como aporte novo"}
          </Button>
          <Button type="button" size="pequeno" variant="fantasma" onClick={() => setModo("ignorar")}>
            ignorar
          </Button>
        </div>
      )}

      {modo === "manual" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1 space-y-1">
            <Label className="text-xs">{saida ? "Despesa paga pelo caixa" : "Aporte"} (mesmo valor primeiro)</Label>
            <Select value={escolha} onChange={(e) => setEscolha(e.target.value)}>
              <option value="">Escolha…</option>
              {[...candidatos, ...outros.filter((o) => !candidatos.some((c) => c.id === o.id))].map((o) => (
                <option key={o.id} value={o.id}>
                  {fmtData(o.data)} · {o.descricao.slice(0, 40)} · {reais(o.valor)}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" size="pequeno" disabled={!escolha || pendente} onClick={() => rodar(() => conciliar(linhaId, saida ? "DESPESA" : "APORTE", escolha))}>
            Conciliar
          </Button>
          <Button type="button" size="pequeno" variant="fantasma" onClick={() => setModo("nenhum")}>
            <X />
          </Button>
        </div>
      )}

      {modo === "lancar" && saida && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Input value={descricaoNova} onChange={(e) => setDescricaoNova(e.target.value)} className="uppercase" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoria</Label>
            <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rateio</Label>
            <Select value={criterio} onChange={(e) => setCriterio(e.target.value as "IGUAL" | "POR_HORAS")}>
              <option value="IGUAL">Igual</option>
              <option value="POR_HORAS">Por horas</option>
            </Select>
          </div>
          <Button type="button" size="pequeno" disabled={pendente} onClick={() => rodar(() => lancarDespesaDaLinha(linhaId, Number(categoria), descricaoNova, criterio))}>
            Lançar {reais(-valor)}
          </Button>
          <Button type="button" size="pequeno" variant="fantasma" onClick={() => setModo("nenhum")}>
            <X />
          </Button>
        </div>
      )}

      {modo === "lancar" && !saida && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Aporte de</Label>
            <Select value={socio} onChange={(e) => setSocio(e.target.value)}>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.apelido}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" size="pequeno" disabled={pendente || !socio} onClick={() => rodar(() => lancarAporteDaLinha(linhaId, socio))}>
            Registrar aporte de {reais(valor)}
          </Button>
          <Button type="button" size="pequeno" variant="fantasma" onClick={() => setModo("nenhum")}>
            <X />
          </Button>
        </div>
      )}

      {modo === "ignorar" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 space-y-1">
            <Label className="text-xs">Motivo</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="uppercase" />
          </div>
          <Button type="button" size="pequeno" variant="secundario" disabled={pendente} onClick={() => rodar(() => ignorar(linhaId, motivo))}>
            Ignorar
          </Button>
          <Button type="button" size="pequeno" variant="fantasma" onClick={() => setModo("nenhum")}>
            <X />
          </Button>
        </div>
      )}

      {pendente && <Loader2 className="size-4 animate-spin text-marinho-300" />}
      {resultado && <p className={cn("text-xs", resultado.ok ? "text-ok" : "text-erro")}>{resultado.mensagem}</p>}
    </div>
  );
}

export function BotaoDesfazer({ linhaId }: { linhaId: string }) {
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="pequeno" variant="fantasma" disabled={pendente} onClick={() => iniciar(async () => setResultado(await desfazer(linhaId)))}>
        {pendente ? <Loader2 className="animate-spin" /> : "desfazer"}
      </Button>
      {resultado && !resultado.ok && <span className="text-xs text-erro">{resultado.mensagem}</span>}
    </span>
  );
}
