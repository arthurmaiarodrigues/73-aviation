import { redirect } from "next/navigation";

import { usuarioDaSessao } from "@/lib/perfil";
import { BarraLateral } from "@/components/barra-lateral";
import { Alerta } from "@/components/ui/alerta";
import { sair } from "./sair";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const { user, usuario } = await usuarioDaSessao();

  if (!user) redirect("/login");

  // Autenticou no Auth mas não tem linha em `usuarios`, ou foi desativado.
  if (!usuario || !usuario.ativo) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md space-y-4">
          <Alerta tom="erro">
            {usuario
              ? "Seu acesso está desativado. Fale com o administrador."
              : "Seu login existe, mas ainda não tem perfil cadastrado. Peça ao administrador para cadastrar você."}
          </Alerta>
          <form action={sair}>
            <button type="submit" className="text-sm font-semibold text-laranja-700 hover:underline">
              Sair
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <BarraLateral nome={usuario.nome} perfil={usuario.perfil} aoSair={sair} />
      {/* min-w-0: sem isso a tabela larga faz a página rolar de lado. */}
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
