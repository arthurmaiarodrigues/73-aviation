"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enviarArquivo } from "@/lib/upload-cliente";
import { horimetro as fmtHorimetro } from "@/lib/formato";
import { cn } from "@/lib/utils";

type Leitura = { leitura: number | null; confianca: number; legivel: boolean; observacao: string };

export type EstadoFoto = {
  caminho: string | null;
  leitura: Leitura | null;
  valor: string;
};

/**
 * Um passo "foto → número": tira a foto, sobe para o Storage, manda ler,
 * mostra a leitura com selo de confiança e deixa o piloto corrigir.
 *
 * A leitura é acessória (CLAUDE.md §9): se a API falhar, o campo fica
 * livre para digitar e a foto continua guardada.
 */
export function FotoHorimetro({
  nome,
  rotulo,
  esperado,
  rotuloArquivo,
  estado,
  aoMudar,
  obrigatoria = true,
  leituraAutomatica,
}: {
  nome: "inicial" | "final";
  rotulo: string;
  /** Horímetro que a leitura deveria bater ou superar (o último registrado). */
  esperado: number | null;
  rotuloArquivo: string;
  estado: EstadoFoto;
  aoMudar: (e: EstadoFoto) => void;
  obrigatoria?: boolean;
  leituraAutomatica: boolean;
}) {
  const [previa, setPrevia] = useState<string | null>(null);
  const [fase, setFase] = useState<"parado" | "enviando" | "lendo">("parado");
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function tratarArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setPrevia(URL.createObjectURL(arquivo));

    setFase("enviando");
    const envio = await enviarArquivo(arquivo, "horimetro", rotuloArquivo);
    if (!envio.ok) {
      setFase("parado");
      setErro(envio.mensagem);
      return;
    }
    aoMudar({ ...estado, caminho: envio.caminho, leitura: null });

    if (!leituraAutomatica) {
      setFase("parado");
      return;
    }

    setFase("lendo");
    try {
      const form = new FormData();
      form.append("foto", arquivo);
      if (esperado !== null) form.append("esperado", String(esperado));
      const resposta = await fetch("/api/horimetro", { method: "POST", body: form });
      const corpo = (await resposta.json()) as Leitura & { erro?: string };
      if (!resposta.ok) throw new Error(corpo.erro ?? "Falha na leitura.");
      aoMudar({
        caminho: envio.caminho,
        leitura: corpo,
        valor: corpo.legivel && corpo.leitura !== null ? corpo.leitura.toFixed(1).replace(".", ",") : estado.valor,
      });
    } catch (e) {
      setErro(`${e instanceof Error ? e.message : "Falha na leitura."} Digite o horímetro.`);
    } finally {
      setFase("parado");
    }
  }

  const leitura = estado.leitura;
  const valorNumero = Number(estado.valor.replace(/\./g, "").replace(",", "."));
  const diferenca = esperado !== null && Number.isFinite(valorNumero) && estado.valor ? Math.round((valorNumero - esperado) * 10) / 10 : null;

  return (
    <div className="space-y-3 rounded-lg border border-marinho-100 bg-areia-200 p-4 dark:border-marinho-300 dark:bg-marinho-700">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">{rotulo}</Label>
        {leitura && (
          <Badge variant={!leitura.legivel ? "erro" : leitura.confianca >= 0.8 ? "ok" : "atencao"}>
            {!leitura.legivel ? "ilegível" : `leitura ${Math.round(leitura.confianca * 100)} %`}
          </Badge>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => tratarArquivo(e.target.files?.[0])}
      />

      {previa ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previa} alt={`Foto do horímetro ${nome}`} className="max-h-56 w-full rounded object-contain" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={fase !== "parado"}
            className="absolute right-2 top-2 flex items-center gap-1 rounded bg-marinho/80 px-2 py-1 text-xs text-areia"
          >
            <RefreshCw className="size-3" /> outra foto
          </button>
          {fase !== "parado" && (
            <div className="absolute inset-0 flex items-center justify-center rounded bg-marinho/60 text-areia">
              <Loader2 className="mr-2 size-5 animate-spin" />
              {fase === "enviando" ? "Enviando foto…" : "Lendo o horímetro…"}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex h-32 w-full flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-marinho-300 text-marinho-300",
            "hover:border-laranja hover:text-laranja-700",
          )}
        >
          <Camera className="size-8" />
          <span className="text-sm font-semibold">Tirar foto do horímetro</span>
          {!obrigatoria && <span className="text-xs">opcional</span>}
        </button>
      )}

      {erro && <p className="text-sm text-erro">{erro}</p>}
      {leitura?.observacao && <p className="text-xs text-marinho-300">{leitura.observacao}</p>}

      <input type="hidden" name={`foto_${nome}`} value={estado.caminho ?? ""} />
      <input type="hidden" name={`leitura_${nome}`} value={leitura ? JSON.stringify(leitura) : ""} />

      <div className="space-y-1.5">
        <Label htmlFor={`horimetro_${nome}`}>Horímetro {nome}</Label>
        <Input
          id={`horimetro_${nome}`}
          name={`horimetro_${nome}`}
          inputMode="decimal"
          placeholder={esperado !== null ? fmtHorimetro(esperado) : "0000,0"}
          value={estado.valor}
          onChange={(e) => aoMudar({ ...estado, valor: e.target.value })}
          className="h-12 text-lg font-semibold tabular"
          required={obrigatoria}
        />
        {esperado !== null && diferenca !== null && nome === "inicial" && diferenca !== 0 && (
          <p className={cn("text-xs", diferenca > 0 ? "text-atencao" : "text-erro")}>
            {diferenca > 0
              ? `Há ${diferenca.toFixed(1).replace(".", ",")} h entre o último voo registrado (${fmtHorimetro(esperado)}) e esta foto. Vai entrar um voo "sem registro" para o administrador conferir.`
              : `Menor que o último horímetro registrado (${fmtHorimetro(esperado)}). Confira a foto.`}
          </p>
        )}
        {esperado !== null && diferenca !== null && nome === "final" && (
          <p className={cn("text-xs", diferenca > 0 ? "text-marinho-300" : "text-erro")}>
            {diferenca > 0 ? `${diferenca.toFixed(1).replace(".", ",")} h de voo` : "O final tem de ser maior que o inicial."}
          </p>
        )}
      </div>
    </div>
  );
}
