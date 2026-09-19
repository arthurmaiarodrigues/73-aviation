import type { Metadata } from "next";
import Link from "next/link";

import { usuarioDaSessao } from "@/lib/perfil";
import { Logo } from "@/components/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InstalarApp } from "@/components/instalar-app";
import { AtivarAvisos } from "@/components/ativar-avisos";

export const metadata: Metadata = { title: "Instalar o app" };

/** Pública: o sócio pode instalar antes mesmo de entrar. Avisos só logado. */
export default async function PaginaInstalar() {
  const { user } = await usuarioDaSessao();
  return (
    <main className="min-h-dvh bg-areia p-6 dark:bg-marinho-700">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Logo fundo="claro" />
          <Link href={user ? "/inicio" : "/login"} className="text-sm text-laranja-700 hover:underline">
            {user ? "← voltar ao app" : "Entrar"}
          </Link>
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Instalar o app no celular</h1>
          <p className="mt-1 text-sm text-marinho-300">Fica como um app normal: ícone na tela inicial, tela cheia e avisos.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. Instalar</CardTitle>
            <CardDescription>O aparelho é detectado sozinho: o passo certo aparece abaixo.</CardDescription>
          </CardHeader>
          <CardContent>
            <InstalarApp />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">2. Avisos</CardTitle>
            <CardDescription>Depois de instalado, abra pelo ícone, entre e ligue os avisos (reservas, reembolsos, sua vez de escolher a semana).</CardDescription>
          </CardHeader>
          <CardContent>{user ? <AtivarAvisos /> : <p className="text-sm text-marinho-300">Entre no app para ligar os avisos.</p>}</CardContent>
        </Card>
      </div>
    </main>
  );
}
