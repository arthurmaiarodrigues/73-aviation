import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { FormularioLogin } from "./formulario-login";
import { RedirecionarConvite } from "./redirecionar-convite";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string }>;
}) {
  const { proximo } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col bg-marinho md:flex-row">
      {/* Painel da marca — some no celular para dar espaço ao formulário. */}
      <div className="hidden flex-1 flex-col justify-between p-12 md:flex">
        <Logo className="self-start" />
        <div>
          <p className="max-w-md text-2xl font-semibold leading-snug text-areia">
            Diário de bordo, despesas e agenda do RV-10 PP-ZNM.
          </p>
          <p className="mt-2 text-sm text-marinho-100">
            Teixeira de Freitas · Bahia
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-areia p-6 dark:bg-marinho-700">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 md:hidden" fundo="claro" />
          <h1 className="text-2xl font-semibold">Entrar</h1>
          <p className="mt-1 text-sm text-marinho-300">
            Use o e-mail e a senha cadastrados pelo administrador.
          </p>
          <RedirecionarConvite />
          <FormularioLogin proximo={proximo} />
        </div>
      </div>
    </main>
  );
}
