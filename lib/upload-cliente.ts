"use client";

import { prepararUpload, type Bucket } from "@/lib/arquivos";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { prepararImagem } from "@/lib/imagem-cliente";

/**
 * Sobe um arquivo do navegador para o Storage e devolve o caminho gravado.
 * Foto é reduzida antes; PDF vai como está.
 */
export async function enviarArquivo(arquivo: File, bucket: Bucket, rotulo: string): Promise<{ ok: true; caminho: string } | { ok: false; mensagem: string }> {
  const { dados, tipo } = await prepararImagem(arquivo);

  const preparado = await prepararUpload({ bucket, tipo, tamanho: dados.size, rotulo });
  if (!preparado.ok) return preparado;

  const supabase = criarClienteNavegador();
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(preparado.caminho, preparado.token, dados, { contentType: tipo, upsert: false });
  if (error) return { ok: false, mensagem: `Falha no envio: ${error.message}` };

  return { ok: true, caminho: preparado.caminho };
}
