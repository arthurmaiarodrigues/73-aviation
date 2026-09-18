"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Sugestao = { icao: string; nome: string | null; cidade: string | null; uf?: string | null; tipo?: string | null; pista_m?: number | null };

/**
 * Campo ICAO com preenchimento automático.
 *
 * Digitou 2+ letras → busca no servidor por ICAO (prefixo), nome ou cidade
 * (lista da ANAC). Campo vazio → os aeródromos usados nos últimos voos.
 * Aceita qualquer código de 4 letras mesmo sem estar na lista: o cadastro
 * cresce sozinho a partir do voo. Não usa <datalist>: o iPhone não mostra.
 */
export function SeletorAerodromo({
  nome,
  rotulo,
  opcoes,
  valorInicial = "",
  obrigatorio = false,
}: {
  nome: string;
  rotulo: string;
  /** Recentes (ICAO), mostrados com o campo vazio. */
  opcoes: string[];
  valorInicial?: string;
  obrigatorio?: boolean;
}) {
  const listaId = useId();
  const [valor, setValor] = useState(valorInicial);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const [descricao, setDescricao] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const ultimaBusca = useRef(0);

  // Busca com atraso curto, descartando respostas fora de ordem.
  useEffect(() => {
    if (!aberto) return;
    const termo = valor.trim();
    if (termo.length < 2) {
      setSugestoes(opcoes.slice(0, 8).map((icao) => ({ icao, nome: null, cidade: null })));
      return;
    }
    const n = ++ultimaBusca.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/aerodromos?q=${encodeURIComponent(termo)}`);
        const lista = (await r.json()) as Sugestao[];
        if (n === ultimaBusca.current) setSugestoes(Array.isArray(lista) ? lista : []);
      } catch {
        /* sem rede: segue só com o que a pessoa digitou */
      }
    }, 180);
    return () => clearTimeout(t);
  }, [valor, aberto, opcoes]);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  function escolher(s: Sugestao) {
    setValor(s.icao);
    setDescricao(s.nome ? `${s.nome}${s.cidade ? ` · ${s.cidade}` : ""}${s.uf ? `/${s.uf}` : ""}` : null);
    setAberto(false);
    setAtivo(-1);
  }

  function tecla(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto || sugestoes.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((a) => (a + 1) % sugestoes.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((a) => (a <= 0 ? sugestoes.length - 1 : a - 1));
    } else if (e.key === "Enter" && ativo >= 0) {
      e.preventDefault();
      escolher(sugestoes[ativo]);
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  return (
    <div className="relative space-y-1.5" ref={caixa}>
      <Label htmlFor={nome}>{rotulo}</Label>
      <Input
        id={nome}
        name={nome}
        value={valor}
        onChange={(e) => {
          setValor(e.target.value.toUpperCase());
          setDescricao(null);
          setAberto(true);
          setAtivo(-1);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={tecla}
        onBlur={() => setValor((v) => v.replace(/[^A-Z0-9]/g, "").slice(0, 4))}
        placeholder="SNTF ou nome da cidade"
        autoCapitalize="characters"
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={listaId}
        required={obrigatorio}
        className="h-12 font-semibold uppercase tracking-widest"
      />
      {descricao && <p className="text-xs text-marinho-300">{descricao}</p>}
      {aberto && sugestoes.length > 0 && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 max-h-64 w-max min-w-full max-w-[min(90vw,28rem)] overflow-y-auto rounded border border-marinho-100 bg-areia shadow-lg dark:border-marinho-300 dark:bg-marinho-700"
        >
          {sugestoes.map((s, i) => (
            <li
              key={s.icao}
              role="option"
              aria-selected={i === ativo}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(s);
              }}
              className={cn("flex cursor-pointer items-baseline gap-2 px-3 py-2 text-sm hover:bg-areia-200 dark:hover:bg-marinho", i === ativo && "bg-areia-200 dark:bg-marinho")}
            >
              <span className="w-12 shrink-0 font-semibold tracking-widest">{s.icao}</span>
              <span className="min-w-0 flex-1 truncate">
                {s.nome ?? <span className="text-marinho-300">recente</span>}
                {s.cidade && <span className="text-marinho-300"> · {s.cidade}{s.uf ? `/${s.uf}` : ""}</span>}
              </span>
              {s.tipo === "PRIVADO" && <span className="text-[10px] uppercase text-marinho-300">privado</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
