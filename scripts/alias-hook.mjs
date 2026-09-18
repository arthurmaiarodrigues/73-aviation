import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = pathToFileURL(`${process.cwd()}/`).href;

/** O import do TypeScript não escreve a extensão; aqui ela é descoberta. */
function comExtensao(url) {
  const caminho = fileURLToPath(url);
  if (existsSync(caminho)) return url;
  for (const sufixo of [".ts", ".tsx", ".js", "/index.ts", "/index.tsx"]) {
    if (existsSync(caminho + sufixo)) return url + sufixo;
  }
  return url;
}

/** Módulos que só existem dentro do Next e não são usados pelos testes. */
const SUBSTITUTOS = {
  "next/headers": "./next-headers-stub.mjs",
};

export async function resolve(especificador, contexto, proximo) {
  if (SUBSTITUTOS[especificador]) {
    return proximo(new URL(SUBSTITUTOS[especificador], import.meta.url).href, contexto);
  }
  if (especificador.startsWith("@/")) {
    return proximo(comExtensao(new URL(especificador.slice(2), RAIZ).href), contexto);
  }
  // Import relativo entre arquivos do app — `./prompt` dentro de claude.ts.
  // Só o "@/" era tratado, então qualquer módulo que importasse um vizinho
  // pela via curta quebrava ao ser usado num script.
  if (especificador.startsWith("./") || especificador.startsWith("../")) {
    const pai = contexto.parentURL;
    if (pai && /\.tsx?$/.test(pai)) {
      return proximo(comExtensao(new URL(especificador, pai).href), contexto);
    }
  }
  return proximo(especificador, contexto);
}
