import type { Metadata } from "next";

import { Logo } from "@/components/logo";
import { FormularioDefinirSenha } from "./formulario";

export const metadata: Metadata = { title: "Definir senha" };

/** Pública (middleware: /auth). A validação do link é no navegador. */
export default function PaginaDefinirSenha() {
  return (
    <main className="flex min-h-dvh flex-col bg-marinho md:flex-row">
      <div className="hidden flex-1 flex-col justify-between p-12 md:flex">
        <Logo className="self-start" />
        <div>
          <p className="max-w-md text-2xl font-semibold leading-snug text-areia">
            Diário de bordo, despesas e agenda do RV-10 PP-ZNM.
          </p>
          <p className="mt-2 text-sm text-marinho-100">Teixeira de Freitas · Bahia</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-areia p-6 dark:bg-marinho-700">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 md:hidden" fundo="claro" />
          <h1 className="text-2xl font-semibold">Definir senha</h1>
          <p className="mt-1 text-sm text-marinho-300">
            Você foi convidado para o 73 Aviation. Escolha a senha com que vai entrar.
          </p>
          <FormularioDefinirSenha />
        </div>
      </div>
    </main>
  );
}
