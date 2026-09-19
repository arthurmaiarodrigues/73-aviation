"use server";

import { usuarioDaSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hoje } from "@/lib/formato";

/**
 * Upload direto do navegador para o Storage: o servidor assina a URL e o
 * arquivo não passa pela Server Action (limite de 1 MB). O caminho é a
 * permissão — a policy do bucket decide quem grava.
 *
 * horimetro   → todo mundo logado (piloto inclusive)
 * comprovantes → só quem vê valores
 * documentos-aeronave → só admin
 */
export type Bucket = "horimetro" | "comprovantes" | "documentos-aeronave" | "anotacoes";

export type UploadPreparado = { ok: true; caminho: string; token: string } | { ok: false; mensagem: string };

const TAMANHO_MAXIMO = 25 * 1024 * 1024;
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function extensao(tipo: string): string {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[tipo] ?? "bin";
}

export async function prepararUpload(entrada: {
  bucket: Bucket;
  tipo: string;
  tamanho: number;
  /** Prefixo legível no nome: "HORIMETRO - INICIAL - ARTHUR" */
  rotulo: string;
}): Promise<UploadPreparado> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return { ok: false, mensagem: "Sem sessão." };
  if (entrada.bucket === "documentos-aeronave" && usuario.perfil !== "admin") return { ok: false, mensagem: "Só o administrador guarda documentos da aeronave." };
  if (!TIPOS.has(entrada.tipo)) return { ok: false, mensagem: "Só foto (JPG, PNG, WebP) ou PDF." };
  if (!Number.isFinite(entrada.tamanho) || entrada.tamanho <= 0) return { ok: false, mensagem: "Arquivo vazio." };
  if (entrada.tamanho > TAMANHO_MAXIMO) return { ok: false, mensagem: "Arquivo maior que 25 MB." };

  const rotulo = entrada.rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 \-]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, 80);
  const dia = hoje();
  const caminho = `${dia.slice(0, 7)}/${dia} - ${rotulo || "ARQUIVO"} - ${crypto.randomUUID().slice(0, 8)}.${extensao(entrada.tipo)}`;

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.storage.from(entrada.bucket).createSignedUploadUrl(caminho);
  if (error || !data) {
    return {
      ok: false,
      mensagem: /row-level security|not authorized|policy/i.test(error?.message ?? "")
        ? "Sem permissão para gravar neste bucket."
        : `Não foi possível liberar o envio: ${error?.message ?? "sem resposta"}`,
    };
  }
  return { ok: true, caminho: data.path, token: data.token };
}
