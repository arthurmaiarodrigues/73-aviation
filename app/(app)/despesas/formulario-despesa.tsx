"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Paperclip, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { enviarArquivo } from "@/lib/upload-cliente";
import { CRITERIOS, ROTULO_CRITERIO, type CriterioRateio } from "@/lib/tipos";
import { data as fmtData, reais } from "@/lib/formato";
import type { DespesaLinha } from "@/lib/dados/financeiro";
import { apagarDespesa, criarFornecedor, editarDespesa, salvarDespesa, type Resultado } from "./acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

export type VooResumo = { id: string; data: string; socio_id: string | null; socio: string | null; origem: string | null; destino: string | null };

/** Categorias em que o custo é de quem estava com o avião naquele dia. */
const CATEGORIAS_DO_VOO = ["TAXAS DE POUSO E NAVEGAÇÃO", "HANGAR"];

function Botao({ edicao }: { edicao: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={edicao ? "padrao" : "campo"} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Save />}
      {pending ? "Salvando…" : edicao ? "Salvar alterações" : "Lançar despesa"}
    </Button>
  );
}

export function FormularioDespesa({
  despesa,
  socios,
  categorias,
  fornecedores,
  voosRecentes,
  hoje,
  socioLogadoId,
  podeApagar,
}: {
  despesa?: DespesaLinha;
  socios: { id: string; apelido: string; cota: number }[];
  categorias: { id: number; nome: string }[];
  fornecedores: { id: string; nome: string }[];
  voosRecentes: VooResumo[];
  hoje: string;
  socioLogadoId: string | null;
  podeApagar: boolean;
}) {
  const edicao = Boolean(despesa);
  const [estado, acao] = useActionState(edicao ? editarDespesa : salvarDespesa, INICIAL);

  const [data, setData] = useState(despesa?.data ?? hoje);
  const [categoriaId, setCategoriaId] = useState(String(despesa?.categoria_id ?? categorias[0]?.id ?? ""));
  const [criterio, setCriterio] = useState<CriterioRateio>(despesa?.criterio ?? "IGUAL");
  const [socioDireto, setSocioDireto] = useState(despesa?.socio_direto_id ?? "");
  const [pagador, setPagador] = useState(despesa ? (despesa.pagador_socio_id ?? "CAIXA") : (socioLogadoId ?? "CAIXA"));
  const [comprovante, setComprovante] = useState<string | null>(despesa?.comprovante_path ?? null);
  const [enviando, setEnviando] = useState(false);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [listaFornecedores, setListaFornecedores] = useState(fornecedores);
  const [fornecedorId, setFornecedorId] = useState(despesa?.fornecedor_id ?? "");
  const [novoFornecedor, setNovoFornecedor] = useState("");
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [sugestao, setSugestao] = useState<string | null>(null);
  const [descricao, setDescricao] = useState(despesa?.descricao ?? "");
  const [valor, setValor] = useState(despesa ? despesa.valor.toFixed(2).replace(".", ",") : "");
  const [leitura, setLeitura] = useState<{ confianca: number; observacao: string; fornecedor: string | null } | null>(null);
  const [itens, setItens] = useState<{ descricao: string; valor: string }[]>((despesa?.itens ?? []).map((i) => ({ descricao: i.descricao, valor: i.valor.toFixed(2).replace(".", ",") })));
  const numero = (t: string) => Number(t.replace(/\./g, "").replace(",", ".")) || 0;
  const somaItens = itens.reduce((t, i) => t + numero(i.valor), 0);
  const [lendo, setLendo] = useState(false);

  const categoriaNome = categorias.find((c) => String(c.id) === categoriaId)?.nome ?? "";

  // Custo de pouso / hangar: cruza com o voo daquele dia (± 1) e sugere DIRETO.
  const vooDoDia = useMemo(() => {
    if (!CATEGORIAS_DO_VOO.includes(categoriaNome)) return null;
    const alvo = new Date(`${data}T00:00:00Z`).getTime();
    const candidatos = voosRecentes
      .map((v) => ({ v, dist: Math.abs(new Date(`${v.data}T00:00:00Z`).getTime() - alvo) }))
      .filter((c) => c.dist <= 86_400_000)
      .sort((a, b) => a.dist - b.dist);
    return candidatos[0]?.v ?? null;
  }, [categoriaNome, data, voosRecentes]);

  useEffect(() => {
    if (edicao) return;
    if (!vooDoDia) {
      setSugestao(null);
      return;
    }
    if (vooDoDia.socio_id) {
      setCriterio("DIRETO");
      setSocioDireto(vooDoDia.socio_id);
      setSugestao(`Voo de ${fmtData(vooDoDia.data)} (${vooDoDia.origem ?? "?"} → ${vooDoDia.destino ?? "?"}) era de ${vooDoDia.socio}: rateio direto a ele.`);
    } else {
      setCriterio("IGUAL");
      setSugestao(`Voo de ${fmtData(vooDoDia.data)} era da sociedade: rateio igual.`);
    }
  }, [vooDoDia, edicao]);

  async function tratarComprovante(arquivo: File | undefined) {
    if (!arquivo) return;
    setErroArquivo(null);
    setEnviando(true);
    // Sobe o arquivo e, ao mesmo tempo, manda ler. A leitura é acessória:
    // se falhar, o comprovante fica anexado e a pessoa digita.
    const leituraPromessa = edicao ? null : lerComprovanteNoServidor(arquivo);
    const r = await enviarArquivo(arquivo, "comprovantes", `COMPROVANTE - ${categoriaNome}`);
    setEnviando(false);
    if (!r.ok) return setErroArquivo(r.mensagem);
    setComprovante(r.caminho);
    if (leituraPromessa) await leituraPromessa;
  }

  async function lerComprovanteNoServidor(arquivo: File) {
    setLendo(true);
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      const resp = await fetch("/api/comprovante", { method: "POST", body: form });
      const lido = (await resp.json()) as { erro?: string; legivel: boolean; fornecedor: string | null; data: string | null; valor: number | null; descricao: string | null; categoria: string | null; itens?: { descricao: string; valor: number }[]; confianca: number; observacao: string };
      if (!resp.ok) throw new Error(lido.erro ?? "Falha na leitura.");
      if (lido.data) setData(lido.data);
      if (lido.valor !== null) setValor(lido.valor.toFixed(2).replace(".", ","));
      if (lido.descricao) setDescricao(lido.descricao);
      const cat = categorias.find((c) => c.nome === lido.categoria);
      if (cat) setCategoriaId(String(cat.id));
      setItens((lido.itens ?? []).map((i) => ({ descricao: i.descricao, valor: i.valor.toFixed(2).replace(".", ",") })));
      if (lido.fornecedor) {
        const existente = listaFornecedores.find((f) => f.nome === lido.fornecedor || f.nome.startsWith(lido.fornecedor!.split(" ")[0]) && lido.fornecedor!.split(" ").length > 1 && f.nome.includes(lido.fornecedor!.split(" ")[1]));
        if (existente) setFornecedorId(existente.id);
        else setNovoFornecedor(lido.fornecedor);
      }
      setLeitura({ confianca: lido.confianca, observacao: lido.observacao, fornecedor: lido.fornecedor });
    } catch (e) {
      setErroArquivo(`Comprovante anexado, mas não consegui ler: ${e instanceof Error ? e.message : "falha"}. Preencha à mão.`);
    } finally {
      setLendo(false);
    }
  }

  async function cadastrarFornecedor() {
    const r = await criarFornecedor(novoFornecedor, "PJ");
    if (!r.ok) return setErroArquivo(r.mensagem);
    setListaFornecedores((l) => [...l.filter((f) => f.id !== r.id), { id: r.id, nome: r.nome }].sort((a, b) => a.nome.localeCompare(b.nome)));
    setFornecedorId(r.id);
    setNovoFornecedor("");
  }

  const cotaTotal = socios.reduce((s, x) => s + x.cota, 0) || 100;

  return (
    <div className="space-y-6">
      <form action={acao} className="space-y-5">
        {despesa && <input type="hidden" name="id" value={despesa.id} />}
        <input type="hidden" name="comprovante_path" value={comprovante ?? ""} />
        {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}

        {!edicao && (
          <div className="rounded-lg border border-dashed border-marinho-300 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded bg-laranja px-4 text-sm font-semibold text-marinho hover:bg-laranja-700 hover:text-areia">
                {enviando || lendo ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
                {lendo ? "Lendo o comprovante…" : enviando ? "Enviando…" : comprovante ? "Trocar comprovante" : "Anexar comprovante (foto, galeria ou PDF)"}
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => tratarComprovante(e.target.files?.[0])} disabled={enviando || lendo} />
              </label>
              {comprovante && !lendo && <span className="text-xs text-ok">anexado</span>}
              {leitura && (
                <span className={`text-xs ${leitura.confianca >= 0.8 ? "text-ok" : "text-atencao"}`}>
                  lido da foto ({Math.round(leitura.confianca * 100)} %) — confira os campos
                </span>
              )}
            </div>
            {leitura?.observacao && <p className="mt-2 text-xs text-marinho-300">{leitura.observacao}</p>}
            {erroArquivo && <p className="mt-2 text-xs text-erro">{erroArquivo}</p>}
            <p className="mt-2 text-xs text-marinho-300">O app lê fornecedor, valor, data e categoria; você confere e lança.</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="data">Data</Label>
            <Input id="data" name="data" type="date" value={data} onChange={(e) => setData(e.target.value)} required className="h-12" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="valor">Valor (R$)</Label>
            <Input id="valor" name="valor" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} required className="h-12 text-lg font-semibold tabular" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Input id="descricao" name="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex.: TAXA DE POUSO SBSV" required className="h-12 uppercase" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="categoria_id">Categoria</Label>
            <Select id="categoria_id" name="categoria_id" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="h-12">
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fornecedor_id">Fornecedor</Label>
            <Select id="fornecedor_id" name="fornecedor_id" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="h-12">
              <option value="">—</option>
              {listaFornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Input value={novoFornecedor} onChange={(e) => setNovoFornecedor(e.target.value)} placeholder="Novo fornecedor…" className="h-9 text-xs uppercase" />
              <Button type="button" variant="secundario" size="pequeno" onClick={cadastrarFornecedor} disabled={novoFornecedor.trim().length < 2}>
                Cadastrar
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pagador">Quem pagou</Label>
            <Select id="pagador" name="pagador" value={pagador} onChange={(e) => setPagador(e.target.value)} className="h-12">
              <option value="CAIXA">Caixa da sociedade</option>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.apelido} (do próprio bolso)
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="criterio">Rateio</Label>
            <Select id="criterio" name="criterio" value={criterio} onChange={(e) => setCriterio(e.target.value as CriterioRateio)} className="h-12">
              {CRITERIOS.map((c) => (
                <option key={c} value={c}>
                  {ROTULO_CRITERIO[c]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {sugestao && <Alerta tom="info">{sugestao}</Alerta>}

        {criterio === "DIRETO" && (
          <div className="space-y-1.5">
            <Label htmlFor="socio_direto_id">Sócio que arca com tudo</Label>
            <Select id="socio_direto_id" name="socio_direto_id" value={socioDireto} onChange={(e) => setSocioDireto(e.target.value)} required className="h-12">
              <option value="">Escolha…</option>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.apelido}
                </option>
              ))}
            </Select>
          </div>
        )}

        {criterio === "POR_HORAS" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="periodo_inicio">Horas de (em branco = mês da despesa)</Label>
              <Input id="periodo_inicio" name="periodo_inicio" type="date" defaultValue={despesa?.periodo_inicio ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="periodo_fim">até</Label>
              <Input id="periodo_fim" name="periodo_fim" type="date" defaultValue={despesa?.periodo_fim ?? ""} />
            </div>
          </div>
        )}

        {criterio === "MANUAL" && (
          <div className="grid gap-3 sm:grid-cols-4">
            {socios.map((s) => {
              const atual = despesa?.rateios.find((r) => r.socio_id === s.id)?.percentual;
              return (
                <div key={s.id} className="space-y-1.5">
                  <Label htmlFor={`pct_${s.id}`}>{s.apelido} (%)</Label>
                  <Input
                    id={`pct_${s.id}`}
                    name={`pct_${s.id}`}
                    inputMode="decimal"
                    defaultValue={(atual ?? Math.round((s.cota / cotaTotal) * 10000) / 100).toString().replace(".", ",")}
                    className="tabular"
                  />
                </div>
              );
            })}
            <p className="text-xs text-marinho-300 sm:col-span-4">Os percentuais precisam somar 100 %.</p>
          </div>
        )}

        {edicao && (
        <div className="space-y-1.5">
          <Label>Comprovante</Label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded border border-marinho-100 bg-areia-200 px-4 text-sm font-semibold hover:border-laranja dark:border-marinho-300 dark:bg-marinho-700">
              {enviando ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
              {comprovante ? "Trocar comprovante" : "Foto ou PDF"}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => tratarComprovante(e.target.files?.[0])} disabled={enviando} />
            </label>
            {comprovante && <span className="text-xs text-ok">anexado</span>}
            {erroArquivo && <span className="text-xs text-erro">{erroArquivo}</span>}
          </div>
        </div>
        )}

        {/* Itens discriminados na nota: ficam na despesa, para registro; o rateio é do total. */}
        <div className="space-y-2 rounded-lg border border-marinho-100 p-4 dark:border-marinho-300">
          <input type="hidden" name="itens_json" value={JSON.stringify(itens.map((i) => ({ descricao: i.descricao, valor: numero(i.valor) })))} />
          <div className="flex items-center justify-between">
            <Label>Itens da nota {itens.length > 0 && <span className="text-marinho-300">({itens.length})</span>}</Label>
            <Button type="button" variant="fantasma" size="pequeno" onClick={() => setItens((l) => [...l, { descricao: "", valor: "" }])}>
              + item
            </Button>
          </div>
          {itens.length === 0 && <p className="text-xs text-marinho-300">A foto da nota preenche os itens sozinha quando ela discrimina mais de um. Opcional.</p>}
          {itens.map((i, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_7rem_auto] gap-2">
              <Input value={i.descricao} onChange={(e) => setItens((l) => l.map((x, j) => (j === idx ? { ...x, descricao: e.target.value } : x)))} placeholder="item" className="uppercase" aria-label="Item" />
              <Input value={i.valor} onChange={(e) => setItens((l) => l.map((x, j) => (j === idx ? { ...x, valor: e.target.value } : x)))} inputMode="decimal" placeholder="0,00" className="tabular" aria-label="Valor do item" />
              <Button type="button" variant="fantasma" size="pequeno" onClick={() => setItens((l) => l.filter((_, j) => j !== idx))} aria-label="Tirar item">
                tirar
              </Button>
            </div>
          ))}
          {itens.length > 0 && (
            <p className={"text-right text-sm " + (Math.abs(somaItens - numero(valor)) > 0.01 ? "text-atencao" : "text-marinho-300")}>
              Soma dos itens: <strong className="tabular">{reais(somaItens)}</strong>
              {Math.abs(somaItens - numero(valor)) > 0.01 ? ` · difere do valor da despesa (${reais(numero(valor))})` : " · bate com o valor da despesa"}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="observacao">Observação</Label>
          <Textarea id="observacao" name="observacao" defaultValue={despesa?.observacao ?? ""} />
        </div>

        <Botao edicao={edicao} />
      </form>

      {podeApagar && despesa && (
        <div className="border-t border-marinho-100 pt-4 dark:border-marinho-300">
          {!confirmarApagar ? (
            <Button type="button" variant="fantasma" size="pequeno" onClick={() => setConfirmarApagar(true)}>
              <Trash2 /> Apagar esta despesa
            </Button>
          ) : (
            <form action={async () => { await apagarDespesa(despesa.id); }} className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-erro">Sai dos extratos; fica guardada com quem apagou e quando.</span>
              <Button type="submit" variant="destrutivo" size="pequeno">
                Confirmar
              </Button>
              <Button type="button" variant="secundario" size="pequeno" onClick={() => setConfirmarApagar(false)}>
                Cancelar
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
