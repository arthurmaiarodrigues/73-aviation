"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, ShieldCheck, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alerta } from "@/components/ui/alerta";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha } from "@/components/ui/tabela";
import { data as fmtData, reais } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { confirmarVarios, marcarReembolsado } from "./acoes";

export type LinhaReembolso = {
  id: string;
  data: string;
  descricao: string;
  categoria: string;
  cidade: string | null;
  observacao: string | null;
  valor: number;
  socio_id: string | null;
  socio: string;
  piloto: string;
  piloto_id: string;
  criterio: "IGUAL" | "POR_HORAS" | "DIRETO" | "MANUAL";
  status: "PENDENTE" | "APROVADA" | "RATEADA";
  reembolsado_em: string | null;
  partes: { socio_id: string; valor: number }[];
  nota: string | null;
};

const ROTULO: Record<string, string> = { IGUAL: "todos, partes iguais", POR_HORAS: "todos, pelas horas", DIRETO: "um sócio" };

/**
 * A tabela onde o admin confere: marca as linhas "a conferir" (uma, várias
 * ou todas), escolhe a divisão e confirma de uma vez. Para os outros
 * perfis é só a lista, com o botão de marcar como reembolsado.
 */
export function TabelaReembolsos({
  itens,
  perfil,
  socioId,
  pilotoId,
  socios,
}: {
  itens: LinhaReembolso[];
  perfil: "admin" | "socio" | "piloto";
  socioId: string | null;
  pilotoId: string | null;
  socios: { id: string; apelido: string }[];
}) {
  const router = useRouter();
  const pendentes = itens.filter((i) => i.status === "PENDENTE");
  const [marcados, setMarcados] = useState<string[]>([]);
  const [divisao, setDivisao] = useState("MANTER");
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const confere = perfil === "admin" && pendentes.length > 0;

  const total = itens.filter((i) => marcados.includes(i.id)).reduce((s, i) => s + i.valor, 0);
  const alternar = (id: string) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  return (
    <div className="space-y-3">
      {msg && <Alerta tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Alerta>}

      {confere && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-info/50 bg-info/5 p-3">
          <span className="text-sm">
            <strong>{pendentes.length}</strong> a conferir · marque as linhas e confirme
          </span>
          <button
            type="button"
            onClick={() => setMarcados(marcados.length === pendentes.length ? [] : pendentes.map((i) => i.id))}
            className="text-sm font-semibold text-laranja-700"
          >
            {marcados.length === pendentes.length ? "desmarcar todas" : "marcar todas"}
          </button>
          <Select value={divisao} onChange={(e) => setDivisao(e.target.value)} className="h-10 w-auto text-sm">
            <option value="MANTER">Manter a divisão do piloto</option>
            <option value="TODOS_IGUAL">Todos — partes iguais</option>
            <option value="TODOS_HORAS">Todos — pelas horas voadas</option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                Só {s.apelido}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            size="pequeno"
            disabled={pendente || marcados.length === 0}
            onClick={() =>
              iniciar(async () => {
                const r = await confirmarVarios(
                  marcados,
                  divisao === "MANTER" ? null : divisao === "TODOS_IGUAL" ? "IGUAL" : divisao === "TODOS_HORAS" ? "POR_HORAS" : "DIRETO",
                  divisao.length > 20 ? divisao : null,
                );
                setMsg({ ok: r.ok, texto: r.mensagem });
                if (r.ok) {
                  setMarcados([]);
                  router.refresh();
                }
              })
            }
          >
            {pendente ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Confirmar {marcados.length > 0 ? `${marcados.length} · ${reais(total)}` : ""}
          </Button>
        </div>
      )}

      <Tabela>
        <TabelaCabecalho>
          <tr>
            {confere && <Cabecalho> </Cabecalho>}
            <Cabecalho>Data</Cabecalho>
            <Cabecalho>O que</Cabecalho>
            <Cabecalho>Sócio</Cabecalho>
            {perfil !== "piloto" && <Cabecalho>Piloto</Cabecalho>}
            <Cabecalho numerico>Valor</Cabecalho>
            <Cabecalho>Situação</Cabecalho>
          </tr>
        </TabelaCabecalho>
        <TabelaCorpo>
          {itens.length === 0 && (
            <TabelaLinha>
              <Celula colSpan={7} className="text-marinho-300">
                Nenhum reembolso lançado.
              </Celula>
            </TabelaLinha>
          )}
          {itens.map((r) => (
            <TabelaLinha key={r.id} className={cn(marcados.includes(r.id) && "bg-info/10")}>
              {confere && (
                <Celula>
                  {r.status === "PENDENTE" && (
                    <input type="checkbox" checked={marcados.includes(r.id)} onChange={() => alternar(r.id)} className="size-5" aria-label={`marcar ${r.descricao}`} />
                  )}
                </Celula>
              )}
              <Celula className="whitespace-nowrap">{fmtData(r.data)}</Celula>
              <Celula>
                {r.descricao}
                <span className="block text-xs text-marinho-300">
                  {[r.cidade, r.categoria, r.observacao].filter(Boolean).join(" · ")}
                  {r.nota ? (
                    <>
                      {" · "}
                      <a href={r.nota} target="_blank" rel="noreferrer" className="text-laranja-700 hover:underline">
                        nota
                      </a>
                    </>
                  ) : null}
                </span>
              </Celula>
              <Celula>
                {r.status === "PENDENTE" ? (
                  <span className="text-marinho-300">{r.criterio === "DIRETO" ? `só ${r.socio}` : ROTULO[r.criterio]}</span>
                ) : (
                  <>
                    {r.socio}
                    {r.socio_id === null && r.partes.length > 0 && (
                      <span className="block text-xs text-marinho-300">
                        {r.criterio === "POR_HORAS"
                          ? r.partes.map((p) => `${socios.find((s) => s.id === p.socio_id)?.apelido ?? "?"} ${reais(p.valor)}`).join(" · ")
                          : `${reais(r.partes[0].valor)} cada`}
                      </span>
                    )}
                  </>
                )}
              </Celula>
              {perfil !== "piloto" && <Celula>{r.piloto}</Celula>}
              <Celula numerico className="font-semibold">
                {reais(r.valor)}
              </Celula>
              <Celula>
                <div className="flex flex-wrap items-center gap-2">
                  {r.status === "PENDENTE" ? (
                    <Badge variant="info">a conferir</Badge>
                  ) : r.reembolsado_em ? (
                    <Badge variant="ok">reembolsado {fmtData(r.reembolsado_em)}</Badge>
                  ) : (
                    <Badge variant="atencao">pendente</Badge>
                  )}
                  {r.status !== "PENDENTE" && (perfil === "admin" || r.socio_id === socioId || (r.socio_id === null && socioId) || r.piloto_id === pilotoId) && (
                    <BotaoReembolsado id={r.id} reembolsado={Boolean(r.reembolsado_em)} />
                  )}
                </div>
              </Celula>
            </TabelaLinha>
          ))}
        </TabelaCorpo>
      </Tabela>
    </div>
  );
}

function BotaoReembolsado({ id, reembolsado }: { id: string; reembolsado: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant={reembolsado ? "fantasma" : "secundario"}
        size="pequeno"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setMsg((await marcarReembolsado(id, reembolsado)).mensagem);
            router.refresh();
          })
        }
      >
        {pendente ? <Loader2 className="animate-spin" /> : reembolsado ? <Undo2 /> : <Check />}
        {reembolsado ? "desfazer" : "Marcar como reembolsado"}
      </Button>
      {msg && <span className="text-xs text-marinho-300">{msg}</span>}
    </span>
  );
}
