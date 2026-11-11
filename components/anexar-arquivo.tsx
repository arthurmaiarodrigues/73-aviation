"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Anexar sem abrir o seletor de arquivo: arrastar da pasta ou do e-mail para
 * a tela, ou colar um print (Ctrl+V / Cmd+V). Chama o MESMO tratador do botão
 * de anexar — leitura, envio e mensagens continuam os de cada tela.
 *
 * `ColarArquivo` vale para a página inteira: solta o arquivo em qualquer
 * lugar ou cola com o foco onde for (colar texto num campo continua normal —
 * só reage quando a área de transferência tem arquivo). Com mais de um na
 * tela, vale o último que apareceu (ex.: o painel "Paguei" aberto agora).
 *
 * `ZonaArquivo` vale só dentro da área que ela envolve — para telas com
 * vários anexos ao mesmo tempo (foto inicial e final do horímetro, uma linha
 * por sócio). Cola com a área focada (clique nela antes).
 */

const PADRAO = "image/*,application/pdf";

/** O arquivo serve para o `accept` do campo? ("image/*,application/pdf") */
function serve(arquivo: File, aceita: string): boolean {
  const tipo = (arquivo.type || "").toLowerCase();
  const nome = arquivo.name.toLowerCase();
  return aceita.split(",").some((a) => {
    const regra = a.trim().toLowerCase();
    if (!regra) return false;
    if (regra.endsWith("/*")) return tipo.startsWith(regra.slice(0, -1));
    if (regra.startsWith(".")) return nome.endsWith(regra);
    return tipo === regra;
  });
}

const tiposAceitos = (aceita: string) => (aceita.includes("pdf") ? "foto ou PDF" : "foto");

/** Print colado vem como "image.png": dá um nome que diga o que é. */
function nomear(arquivo: File): File {
  if (arquivo.name && arquivo.name !== "image.png" && arquivo.name !== "image.jpg") return arquivo;
  const ext = arquivo.type === "image/jpeg" ? "jpg" : (arquivo.type.split("/")[1] ?? "png");
  const agora = new Date();
  const carimbo = `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, "0")}${String(agora.getDate()).padStart(2, "0")}-${String(agora.getHours()).padStart(2, "0")}${String(agora.getMinutes()).padStart(2, "0")}${String(agora.getSeconds()).padStart(2, "0")}`;
  return new File([arquivo], `print-${carimbo}.${ext}`, { type: arquivo.type, lastModified: arquivo.lastModified });
}

const temArquivo = (dt: DataTransfer | null) => Array.from(dt?.types ?? []).includes("Files");

// No Next o React escuta no próprio `document`, então stopPropagation na zona
// não segura o ouvinte geral: ele ignora o que acontece dentro de uma zona.
const ATRIBUTO_ZONA = "data-zona-arquivo";
const dentroDeZona = (e: Event) => e.target instanceof Element && e.target.closest(`[${ATRIBUTO_ZONA}]`) !== null;

// Quem está "de plantão" na página: o último ColarArquivo montado.
const pilha: symbol[] = [];

export function ColarArquivo({
  onArquivo,
  desativado = false,
  aceita = PADRAO,
  className,
}: {
  onArquivo: (arquivo: File) => void;
  desativado?: boolean;
  aceita?: string;
  className?: string;
}) {
  const tratador = useRef(onArquivo);
  const parado = useRef(desativado);
  useEffect(() => {
    tratador.current = onArquivo;
    parado.current = desativado;
  });
  const [arrastando, setArrastando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const eu = Symbol("colar");
    pilha.push(eu);
    const deVez = () => pilha[pilha.length - 1] === eu && !parado.current;
    let camadas = 0;

    const entregar = (lista: FileList | null | undefined) => {
      const arquivo = lista?.[0];
      if (!arquivo) return;
      if (!serve(arquivo, aceita)) {
        setAviso(`Esse arquivo não serve aqui — use ${tiposAceitos(aceita)}.`);
        return;
      }
      setAviso(null);
      tratador.current(nomear(arquivo));
    };
    const entrar = (e: DragEvent) => {
      if (!deVez() || !temArquivo(e.dataTransfer)) return;
      camadas += 1;
      setArrastando(true);
    };
    const sair = (e: DragEvent) => {
      if (!deVez() || !temArquivo(e.dataTransfer)) return;
      camadas = Math.max(0, camadas - 1);
      if (camadas === 0) setArrastando(false);
    };
    const sobre = (e: DragEvent) => {
      if (deVez() && temArquivo(e.dataTransfer) && !dentroDeZona(e)) e.preventDefault();
    };
    const soltar = (e: DragEvent) => {
      if (!deVez() || !temArquivo(e.dataTransfer)) return;
      if (dentroDeZona(e)) {
        camadas = 0;
        setArrastando(false);
        return;
      }
      e.preventDefault();
      camadas = 0;
      setArrastando(false);
      entregar(e.dataTransfer?.files);
    };
    const fim = () => {
      camadas = 0;
      setArrastando(false);
    };
    const colar = (e: ClipboardEvent) => {
      if (!deVez() || dentroDeZona(e)) return;
      const lista = e.clipboardData?.files;
      if (!lista || lista.length === 0) return; // texto: cola normal no campo
      e.preventDefault();
      entregar(lista);
    };

    document.addEventListener("dragenter", entrar);
    document.addEventListener("dragleave", sair);
    document.addEventListener("dragover", sobre);
    document.addEventListener("drop", soltar);
    document.addEventListener("dragend", fim);
    document.addEventListener("paste", colar);
    return () => {
      document.removeEventListener("dragenter", entrar);
      document.removeEventListener("dragleave", sair);
      document.removeEventListener("dragover", sobre);
      document.removeEventListener("drop", soltar);
      document.removeEventListener("dragend", fim);
      document.removeEventListener("paste", colar);
      const i = pilha.indexOf(eu);
      if (i >= 0) pilha.splice(i, 1);
    };
  }, [aceita]);

  return (
    <>
      <span className={cn("hidden text-xs text-marinho-300 md:inline", className)}>ou arraste o arquivo para a tela · cole um print com Ctrl+V</span>
      {aviso && <span className="text-xs text-erro">{aviso}</span>}
      {arrastando && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-marinho/40 p-6">
          <div className="flex items-center gap-3 rounded-xl border-4 border-dashed border-laranja bg-areia px-8 py-6 text-lg font-semibold text-marinho shadow-xl dark:bg-marinho-700 dark:text-areia">
            <Upload className="size-6" /> Solte para anexar ({tiposAceitos(aceita)})
          </div>
        </div>
      )}
    </>
  );
}

/** Área própria: arrastar para dentro dela ou colar com ela focada. */
export function ZonaArquivo({
  onArquivo,
  desativado = false,
  aceita = PADRAO,
  className,
  children,
}: {
  onArquivo: (arquivo: File) => void;
  desativado?: boolean;
  aceita?: string;
  className?: string;
  children: ReactNode;
}) {
  const [sobre, setSobre] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const entregar = (lista: FileList | null | undefined) => {
    const arquivo = lista?.[0];
    if (!arquivo || desativado) return;
    if (!serve(arquivo, aceita)) {
      setAviso(`Esse arquivo não serve aqui — use ${tiposAceitos(aceita)}.`);
      return;
    }
    setAviso(null);
    onArquivo(nomear(arquivo));
  };

  return (
    <div
      {...{ [ATRIBUTO_ZONA]: "" }}
      tabIndex={-1}
      className={cn("rounded-lg outline-none transition-shadow focus-within:ring-0", sobre && "ring-2 ring-laranja ring-offset-2", className)}
      onDragOver={(e) => {
        if (!temArquivo(e.dataTransfer) || desativado) return;
        e.preventDefault();
        e.stopPropagation();
        setSobre(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(false);
      }}
      onDrop={(e) => {
        if (!temArquivo(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        setSobre(false);
        entregar(e.dataTransfer.files);
      }}
      onPaste={(e) => {
        if (e.clipboardData.files.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        entregar(e.clipboardData.files);
      }}
    >
      {children}
      {aviso && <p className="mt-1 text-xs text-erro">{aviso}</p>}
    </div>
  );
}
