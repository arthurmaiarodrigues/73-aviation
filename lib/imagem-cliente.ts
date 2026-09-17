/**
 * Reduz uma foto no NAVEGADOR antes de subir: maior lado em 1600 px, JPEG 85.
 * Foto de celular tem 3–6 MB; no hangar a rede é fraca. Se qualquer passo
 * falhar (HEIC que o navegador não decodifica), devolve o original.
 */
export const LADO_MAXIMO = 1600;
export const QUALIDADE_JPEG = 0.85;

export async function prepararImagem(arquivo: File): Promise<{ dados: Blob; tipo: string }> {
  if (!arquivo.type.startsWith("image/")) return { dados: arquivo, tipo: arquivo.type };

  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const maior = Math.max(bitmap.width, bitmap.height);
    const escala = maior > LADO_MAXIMO ? LADO_MAXIMO / maior : 1;

    const tela = document.createElement("canvas");
    tela.width = Math.max(1, Math.round(bitmap.width * escala));
    tela.height = Math.max(1, Math.round(bitmap.height * escala));

    const ctx = tela.getContext("2d");
    if (!ctx) throw new Error("sem contexto 2d");
    ctx.drawImage(bitmap, 0, 0, tela.width, tela.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolver) => tela.toBlob(resolver, "image/jpeg", QUALIDADE_JPEG));
    if (!blob) throw new Error("conversão vazia");

    return { dados: blob, tipo: "image/jpeg" };
  } catch {
    return { dados: arquivo, tipo: arquivo.type };
  }
}

export function extensaoDe(tipo: string, nome: string): string {
  if (tipo === "image/jpeg") return "jpg";
  if (tipo === "image/png") return "png";
  if (tipo === "image/webp") return "webp";
  if (tipo === "application/pdf") return "pdf";
  const m = /\.([a-z0-9]+)$/i.exec(nome);
  return m ? m[1].toLowerCase() : "bin";
}
