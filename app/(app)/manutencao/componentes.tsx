"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, Paperclip, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { enviarArquivo } from "@/lib/upload-cliente";
import { cn } from "@/lib/utils";
import { data as fmtData } from "@/lib/formato";
import { ROTULO_GATILHO, ROTULO_TIPO_CUSTO, TIPOS_DOCUMENTO, type Gatilho, type TipoCusto } from "@/lib/manutencao-constantes";
import type { ItemManutencao, ItemPlano, Manutencao } from "@/lib/dados/manutencao";
import {
  apagarDocumento,
  apagarItemManutencao,
  apagarManutencao,
  concluirManutencao,
  desativarItemPlano,
  salvarDocumento,
  salvarItemManutencao,
  salvarItemPlano,
  salvarManutencao,
  type Resultado,
} from "./acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };
const dec = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

function Botao({ rotulo, icone, tamanho = "padrao" }: { rotulo: string; icone?: React.ReactNode; tamanho?: "padrao" | "pequeno" | "campo" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={tamanho} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : (icone ?? <Save />)}
      {rotulo}
    </Button>
  );
}

/** Botão de ação com confirmação e resposta ao lado (só recebe dados serializáveis). */
export function BotaoAcao({
  acao,
  id,
  extra,
  rotulo,
  confirmar,
  variant = "fantasma",
}: {
  acao: "tirarDoPlano" | "removerItem" | "removerDocumento";
  id: string;
  extra?: string;
  rotulo: string;
  confirmar?: string;
  variant?: "fantasma" | "destrutivo" | "secundario";
}) {
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pedindo, setPedindo] = useState(false);
  const executar = () =>
    iniciar(async () => {
      const r =
        acao === "tirarDoPlano" ? await desativarItemPlano(id) : acao === "removerItem" ? await apagarItemManutencao(id, extra ?? "") : await apagarDocumento(id);
      setResultado(r);
      setPedindo(false);
    });
  if (pedindo)
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-marinho-300">{confirmar}</span>
        <Button type="button" size="pequeno" variant="destrutivo" onClick={executar} disabled={pendente}>{pendente ? <Loader2 className="animate-spin" /> : "Sim"}</Button>
        <Button type="button" size="pequeno" variant="fantasma" onClick={() => setPedindo(false)}>Não</Button>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="pequeno" variant={variant} onClick={() => (confirmar ? setPedindo(true) : executar())} disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : rotulo}
      </Button>
      {resultado && <span className={cn("text-xs", resultado.ok ? "text-ok" : "text-erro")}>{resultado.mensagem}</span>}
    </span>
  );
}


// ------------------------------------------------------------ plano
export function FormularioItemPlano({ item }: { item?: ItemPlano }) {
  const [estado, acao] = useActionState(salvarItemPlano, INICIAL);
  const [gatilho, setGatilho] = useState<Gatilho>(item?.gatilho ?? "POR_HORAS");
  return (
    <form action={acao} className="space-y-3">
      {item && <input type="hidden" name="id" value={item.id} />}
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Item</Label>
          <Input name="descricao" defaultValue={item?.descricao ?? ""} placeholder="TROCA DE ÓLEO E FILTRO" className="uppercase" required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Gatilho</Label>
          <Select name="gatilho" value={gatilho} onChange={(e) => setGatilho(e.target.value as Gatilho)}>
            {(Object.keys(ROTULO_GATILHO) as Gatilho[]).map((g) => (
              <option key={g} value={g}>{ROTULO_GATILHO[g]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Custo divide</Label>
          <Select name="tipo_custo" defaultValue={item?.tipo_custo ?? (gatilho === "POR_TEMPO" ? "POR_TEMPO" : "POR_USO")}>
            {(Object.keys(ROTULO_TIPO_CUSTO) as TipoCusto[]).map((t) => (
              <option key={t} value={t}>{ROTULO_TIPO_CUSTO[t]}</option>
            ))}
          </Select>
        </div>
        {gatilho !== "POR_TEMPO" && (
          <div className="space-y-1">
            <Label className="text-xs">A cada (horas)</Label>
            <Input name="intervalo_horas" inputMode="decimal" defaultValue={dec(item?.intervalo_horas)} className="tabular" />
          </div>
        )}
        {gatilho !== "POR_HORAS" && (
          <div className="space-y-1">
            <Label className="text-xs">A cada (meses)</Label>
            <Input name="intervalo_meses" type="number" min={1} defaultValue={item?.intervalo_meses ?? ""} className="tabular" />
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Última execução (data)</Label>
          <Input name="ultima_data" type="date" defaultValue={item?.ultima_data ?? ""} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Última execução (horímetro)</Label>
          <Input name="ultimo_horimetro" inputMode="decimal" defaultValue={dec(item?.ultimo_horimetro)} className="tabular" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Avisar com (horas)</Label>
          <Input name="aviso_horas" inputMode="decimal" defaultValue={dec(item?.aviso_horas ?? 10)} className="tabular" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Avisar com (dias)</Label>
          <Input name="aviso_dias" type="number" defaultValue={item?.aviso_dias ?? 30} className="tabular" />
        </div>
      </div>
      <Botao rotulo={item ? "Salvar" : "Adicionar ao plano"} tamanho="pequeno" icone={item ? undefined : <Plus />} />
    </form>
  );
}

// ------------------------------------------------------ manutenções
export function FormularioManutencao({
  manutencao,
  fornecedores,
  socios,
  voos,
  hoje,
}: {
  manutencao?: Manutencao;
  fornecedores: { id: string; nome: string }[];
  socios: { id: string; apelido: string }[];
  voos: { id: string; data: string; origem: string | null; destino: string | null; natureza: string }[];
  hoje: string;
}) {
  const [estado, acao] = useActionState(salvarManutencao, INICIAL);
  const concluida = manutencao?.status === "CONCLUIDA";
  return (
    <form action={acao} className="space-y-3">
      {manutencao && <input type="hidden" name="id" value={manutencao.id} />}
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Descrição</Label>
          <Input name="descricao" defaultValue={manutencao?.descricao ?? ""} placeholder="REVISÃO 100 H" className="uppercase" required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Oficina</Label>
          <Select name="fornecedor_id" defaultValue={manutencao?.fornecedor_id ?? ""}>
            <option value="">—</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Situação</Label>
          {concluida ? (
            <p className="flex h-10 items-center text-sm font-semibold text-ok">Concluída</p>
          ) : (
            <Select name="status" defaultValue={manutencao?.status ?? "PROGRAMADA"}>
              <option value="PROGRAMADA">Programada</option>
              <option value="EM_OFICINA">Na oficina</option>
            </Select>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Entrada na oficina</Label>
          <Input name="data_inicio" type="date" defaultValue={manutencao?.data_inicio ?? hoje} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{concluida ? "Saída" : "Previsão de saída"}</Label>
          <Input name="data_fim" type="date" defaultValue={manutencao?.data_fim ?? ""} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Horímetro na entrada</Label>
          <Input name="horimetro" inputMode="decimal" defaultValue={dec(manutencao?.horimetro)} className="tabular" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Quem paga a oficina</Label>
          <Select name="pagador" defaultValue={manutencao?.pagador_socio_id ?? "CAIXA"}>
            <option value="CAIXA">Caixa da sociedade</option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>{s.apelido} (do próprio bolso)</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Voo de translado (ida)</Label>
          <Select name="voo_translado_id" defaultValue={manutencao?.voo_translado_id ?? ""}>
            <option value="">—</option>
            {voos.map((v) => (
              <option key={v.id} value={v.id}>{fmtData(v.data)} · {v.origem ?? "?"} → {v.destino ?? "?"}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Voo de teste / volta</Label>
          <Select name="voo_teste_id" defaultValue={manutencao?.voo_teste_id ?? ""}>
            <option value="">—</option>
            {voos.map((v) => (
              <option key={v.id} value={v.id}>{fmtData(v.data)} · {v.origem ?? "?"} → {v.destino ?? "?"}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-4">
          <Label className="text-xs">Observação</Label>
          <Textarea name="observacao" defaultValue={manutencao?.observacao ?? ""} className="min-h-14" />
        </div>
      </div>
      <p className="text-xs text-marinho-300">Programada ou na oficina, o avião fica bloqueado na agenda entre as datas (previsão de saída em branco = 7 dias).</p>
      <Botao rotulo={manutencao ? "Salvar" : "Programar manutenção"} icone={manutencao ? undefined : <Plus />} />
    </form>
  );
}

export function FormularioItemManutencao({ manutencaoId, plano, item }: { manutencaoId: string; plano: ItemPlano[]; item?: ItemManutencao }) {
  const [estado, acao] = useActionState(salvarItemManutencao, INICIAL);
  const [planoId, setPlanoId] = useState(item?.plano_item_id ?? "");
  const planoEscolhido = plano.find((p) => p.id === planoId);
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="manutencao_id" value={manutencaoId} />
      {item && <input type="hidden" name="id" value={item.id} />}
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <div className="grid gap-3 sm:grid-cols-5">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Item da nota</Label>
          <Input name="descricao" defaultValue={item?.descricao ?? planoEscolhido?.descricao ?? ""} placeholder="ÓLEO W100 + FILTRO" className="uppercase" required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Valor (R$)</Label>
          <Input name="valor" inputMode="decimal" defaultValue={item ? item.valor.toFixed(2).replace(".", ",") : ""} className="tabular font-semibold" required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Item do plano</Label>
          <Select name="plano_item_id" value={planoId} onChange={(e) => setPlanoId(e.target.value)}>
            <option value="">— (avulso)</option>
            {plano.map((p) => (
              <option key={p.id} value={p.id}>{p.descricao}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Custo divide</Label>
          <Select name="tipo_custo" key={planoId} defaultValue={item?.tipo_custo ?? planoEscolhido?.tipo_custo ?? "IGUAL"}>
            {(Object.keys(ROTULO_TIPO_CUSTO) as TipoCusto[]).map((t) => (
              <option key={t} value={t}>{ROTULO_TIPO_CUSTO[t]}</option>
            ))}
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="pago_pelo_fundo" defaultChecked={item?.pago_pelo_fundo ?? false} />
        Pago pelo fundo de reserva (não rateia; vira saída do fundo)
      </label>
      <Botao rotulo={item ? "Salvar item" : "Lançar item"} tamanho="pequeno" icone={item ? undefined : <Plus />} />
    </form>
  );
}

export function FormularioConcluir({ manutencao, plano, hoje }: { manutencao: Manutencao; plano: ItemPlano[]; hoje: string }) {
  const [estado, acao] = useActionState(concluirManutencao, INICIAL);
  const jaLigados = new Set(manutencao.itens.map((i) => i.plano_item_id).filter(Boolean));
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="id" value={manutencao.id} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Saiu da oficina em</Label>
          <Input name="data_fim" type="date" defaultValue={manutencao.data_fim ?? hoje} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Horímetro na saída</Label>
          <Input name="horimetro" inputMode="decimal" defaultValue={dec(manutencao.horimetro)} className="tabular" />
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs text-marinho-300">Itens do plano executados nesta manutenção (zera a contagem deles):</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {plano.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="plano_itens" value={p.id} defaultChecked={jaLigados.has(p.id)} />
              {p.descricao}
            </label>
          ))}
        </div>
      </div>
      <Botao rotulo="Concluir manutenção" icone={<CheckCircle2 />} />
    </form>
  );
}

// ------------------------------------------------------- documentos
export function FormularioDocumento() {
  const [estado, acao] = useActionState(salvarDocumento, INICIAL);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState(TIPOS_DOCUMENTO[0]);

  async function tratar(f: File | undefined) {
    if (!f) return;
    setErro(null);
    setEnviando(true);
    const r = await enviarArquivo(f, "documentos-aeronave", `DOCUMENTO - ${tipo}`);
    setEnviando(false);
    if (!r.ok) return setErro(r.mensagem);
    setArquivo(r.caminho);
  }

  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="arquivo_path" value={arquivo ?? ""} />
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      <div className="grid gap-3 sm:grid-cols-5">
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Número</Label>
          <Input name="numero" className="uppercase" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Emissão</Label>
          <Input name="emissao" type="date" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Vencimento</Label>
          <Input name="vencimento" type="date" required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Arquivo</Label>
          <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded border border-marinho-100 bg-areia-200 px-3 text-sm font-semibold hover:border-laranja dark:border-marinho-300 dark:bg-marinho-700">
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            {arquivo ? "Anexado" : "PDF ou foto"}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => tratar(e.target.files?.[0])} disabled={enviando} />
          </label>
          {erro && <p className="text-xs text-erro">{erro}</p>}
        </div>
      </div>
      <Botao rotulo="Registrar documento" tamanho="pequeno" icone={<Plus />} />
    </form>
  );
}

export function BotaoApagarManutencao({ id }: { id: string }) {
  const [pedindo, setPedindo] = useState(false);
  if (!pedindo)
    return (
      <Button type="button" variant="fantasma" size="pequeno" onClick={() => setPedindo(true)}>
        <Trash2 /> Apagar esta manutenção
      </Button>
    );
  return (
    <form action={async () => { await apagarManutencao(id); }} className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-erro">Apaga a manutenção, os itens e as despesas geradas (soft-delete).</span>
      <Button type="submit" variant="destrutivo" size="pequeno">Confirmar</Button>
      <Button type="button" variant="secundario" size="pequeno" onClick={() => setPedindo(false)}>Cancelar</Button>
    </form>
  );
}
