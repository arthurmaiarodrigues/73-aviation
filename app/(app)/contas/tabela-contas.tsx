"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Link2, Loader2, Trash2, Undo2, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alerta } from "@/components/ui/alerta";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha, TabelaRodape } from "@/components/ui/tabela";
import { enviarArquivo } from "@/lib/upload-cliente";
import { data as fmtData, reais } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { ContaPagar, NotaCandidata } from "@/lib/dados/contas";
import { apagarConta, ligarNota, marcarPaga, sugestoesDaConta } from "./acoes";

const TOM: Record<string, "ok" | "erro" | "atencao" | "info"> = { PAGA: "ok", VENCIDA: "erro", VENCE_EM_BREVE: "atencao", ABERTA: "info" };
const ROTULO: Record<string, string> = { PAGA: "paga", VENCIDA: "vencida", VENCE_EM_BREVE: "vence logo", ABERTA: "em aberto" };

/**
 * As contas em aberto e as pagas, com a nota ligada a cada uma. A
 * conciliação fica na própria linha: "ligar a uma nota" busca as despesas
 * de valor parecido perto do vencimento.
 */
export function TabelaContas({
  contas,
  socios,
  admin,
  hoje,
}: {
  contas: ContaPagar[];
  socios: { id: string; apelido: string }[];
  admin: boolean;
  hoje: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const total = contas.filter((c) => !c.pago_em).reduce((s, c) => s + c.valor, 0);

  return (
    <div className="space-y-3">
      {msg && <Alerta tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Alerta>}

      <Tabela>
        <TabelaCabecalho>
          <tr>
            <Cabecalho>Vence</Cabecalho>
            <Cabecalho>Conta</Cabecalho>
            <Cabecalho numerico>Valor</Cabecalho>
            <Cabecalho>Nota lançada</Cabecalho>
            <Cabecalho>Situação</Cabecalho>
            <Cabecalho> </Cabecalho>
          </tr>
        </TabelaCabecalho>
        <TabelaCorpo>
          {contas.length === 0 && (
            <TabelaLinha>
              <Celula colSpan={6} className="text-marinho-300">
                Nenhuma conta lançada.
              </Celula>
            </TabelaLinha>
          )}
          {contas.map((c) => (
            <TabelaLinha key={c.id} className={cn(c.situacao === "VENCIDA" && "bg-erro/5")}>
              <Celula className="whitespace-nowrap">
                {fmtData(c.vencimento)}
                {!c.pago_em && (
                  <span className="block text-xs text-marinho-300">{c.dias < 0 ? `${-c.dias} dia(s) atrás` : c.dias === 0 ? "hoje" : `em ${c.dias} dia(s)`}</span>
                )}
              </Celula>
              <Celula>
                {c.descricao}
                <span className="block text-xs text-marinho-300">{[c.fornecedor, c.categoria, c.documento].filter(Boolean).join(" · ") || "—"}</span>
              </Celula>
              <Celula numerico className="font-semibold">
                {reais(c.valor)}
              </Celula>
              <Celula>
                {c.despesa_id ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Link href={`/despesas/${c.despesa_id}`} className="text-laranja-700 hover:underline">
                      {c.nota_descricao}
                    </Link>
                    <span className="text-xs text-marinho-300">
                      {c.nota_data ? fmtData(c.nota_data) : ""} {c.nota_valor !== null && c.nota_valor !== c.valor ? `· ${reais(c.nota_valor)}` : ""}
                    </span>
                    <Button
                      type="button"
                      variant="fantasma"
                      size="pequeno"
                      onClick={() =>
                        ligarNota(c.id, null).then((r) => {
                          setMsg({ ok: r.ok, texto: r.mensagem });
                          router.refresh();
                        })
                      }
                    >
                      <Unlink className="size-4" /> desligar
                    </Button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setAberta(aberta === c.id ? null : c.id)} className="inline-flex items-center gap-1 text-sm font-semibold text-laranja-700">
                    <Link2 className="size-4" /> {aberta === c.id ? "fechar" : "ligar a uma nota"}
                  </button>
                )}
                {aberta === c.id && !c.despesa_id && <Sugestoes conta={c} aoLigar={(t) => setMsg(t)} />}
              </Celula>
              <Celula>
                <Badge variant={TOM[c.situacao]}>
                  {ROTULO[c.situacao]}
                  {c.pago_em ? ` ${fmtData(c.pago_em)}` : ""}
                </Badge>
                {c.pago_em && c.pagador && <span className="block text-xs text-marinho-300">por {c.pagador}</span>}
              </Celula>
              <Celula className="whitespace-nowrap text-right">
                <Pagamento conta={c} socios={socios} hoje={hoje} aoResponder={(t) => setMsg(t)} />
                {admin && (
                  <Button
                    type="button"
                    variant="fantasma"
                    size="pequeno"
                    onClick={() => {
                      if (!confirm(`Apagar a conta ${c.descricao}?`)) return;
                      apagarConta(c.id).then((r) => {
                        setMsg({ ok: r.ok, texto: r.mensagem });
                        router.refresh();
                      });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </Celula>
            </TabelaLinha>
          ))}
        </TabelaCorpo>
        {contas.length > 0 && (
          <TabelaRodape>
            <tr>
              <Celula colSpan={2}>Em aberto</Celula>
              <Celula numerico>{reais(total)}</Celula>
              <Celula colSpan={3} />
            </tr>
          </TabelaRodape>
        )}
      </Tabela>
    </div>
  );
}

/** Notas parecidas com a conta, para escolher qual é. */
function Sugestoes({ conta, aoLigar }: { conta: ContaPagar; aoLigar: (m: { ok: boolean; texto: string }) => void }) {
  const router = useRouter();
  const [notas, setNotas] = useState<NotaCandidata[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (notas === null && !pendente) {
    iniciar(async () => {
      const r = await sugestoesDaConta(conta.id);
      setNotas(r.notas);
      setAviso(r.mensagem || null);
    });
  }

  return (
    <div className="mt-2 space-y-1 rounded border border-marinho-100 p-2 text-sm dark:border-marinho-300">
      {pendente && <span className="text-xs text-marinho-300">procurando notas parecidas…</span>}
      {aviso && <p className="text-xs text-marinho-300">{aviso}</p>}
      {(notas ?? []).map((n) => (
        <div key={n.despesa_id} className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-marinho-300">{fmtData(n.data)}</span>
          <span className="min-w-0 flex-1 truncate">{n.descricao}</span>
          <span className="tabular font-semibold">{reais(n.valor)}</span>
          {n.diferenca > 0.05 && <span className="text-xs text-atencao">dif. {reais(n.diferenca)}</span>}
          <Button
            type="button"
            size="pequeno"
            variant="secundario"
            onClick={() =>
              ligarNota(conta.id, n.despesa_id).then((r) => {
                aoLigar({ ok: r.ok, texto: r.mensagem });
                router.refresh();
              })
            }
          >
            é esta
          </Button>
        </div>
      ))}
    </div>
  );
}

/** Marcar como paga: data, quem pagou e o comprovante. */
function Pagamento({
  conta,
  socios,
  hoje,
  aoResponder,
}: {
  conta: ContaPagar;
  socios: { id: string; apelido: string }[];
  hoje: string;
  aoResponder: (m: { ok: boolean; texto: string }) => void;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(hoje);
  const [pagador, setPagador] = useState("CAIXA");
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (conta.pago_em) {
    return (
      <Button
        type="button"
        variant="fantasma"
        size="pequeno"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await marcarPaga(conta.id, null);
            aoResponder({ ok: r.ok, texto: r.mensagem });
            router.refresh();
          })
        }
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Undo2 className="size-4" />} desfazer
      </Button>
    );
  }

  if (!aberto) {
    return (
      <Button type="button" size="pequeno" variant="secundario" onClick={() => setAberto(true)}>
        <Check className="size-4" /> Paguei
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-9 w-auto" />
      <Select value={pagador} onChange={(e) => setPagador(e.target.value)} className="h-9 w-auto text-sm">
        <option value="CAIXA">Caixa</option>
        {socios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.apelido}
          </option>
        ))}
      </Select>
      <label className="cursor-pointer text-xs font-semibold text-laranja-700">
        {comprovante ? "trocar" : "comprovante"}
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={async (e) => {
            const arquivo = e.target.files?.[0];
            if (!arquivo) return;
            const r = await enviarArquivo(arquivo, "comprovantes", "PAGAMENTO - CONTA");
            if (r.ok) setComprovante(r.caminho);
            else aoResponder({ ok: false, texto: r.mensagem });
          }}
        />
      </label>
      <Button
        type="button"
        size="pequeno"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await marcarPaga(conta.id, { data, pagador: pagador === "CAIXA" ? null : pagador, comprovante });
            aoResponder({ ok: r.ok, texto: r.mensagem });
            setAberto(false);
            router.refresh();
          })
        }
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Check className="size-4" />} confirmar
      </Button>
    </span>
  );
}
