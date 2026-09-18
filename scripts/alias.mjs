/**
 * Resolve `@/...` fora do Next, para os testes poderem importar a camada de
 * dados de verdade em vez de simulá-la.
 *
 * O tsconfig mapeia `@/*` para a raiz do projeto; o node não lê tsconfig.
 * Este gancho faz o mesmo mapeamento e completa a extensão, que o import
 * do TypeScript omite.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-hook.mjs", pathToFileURL("./scripts/"));
