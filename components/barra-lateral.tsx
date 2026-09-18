"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Camera,
  ClipboardList,
  FileCheck2,
  Fuel,
  Home,
  LogOut,
  Menu,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  PiggyBank,
  Receipt,
  Scale,
  Wrench,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { menuDoPerfil } from "@/lib/navegacao";
import { ROTULO_PERFIL, type Perfil } from "@/lib/tipos";
import { Logo, Simbolo } from "@/components/logo";

const ICONES = {
  inicio: Home,
  camera: Camera,
  voos: ClipboardList,
  combustivel: Fuel,
  despesas: Receipt,
  aportes: PiggyBank,
  extratos: Scale,
  fechamento: FileCheck2,
  agenda: CalendarDays,
  manutencao: Wrench,
  cadastros: NotebookPen,
} as const;

export function BarraLateral({
  nome,
  perfil,
  aoSair,
}: {
  nome: string;
  perfil: Perfil;
  aoSair: () => Promise<void>;
}) {
  const caminho = usePathname();
  const [recolhida, setRecolhida] = useState(false);
  const [abertaNoCelular, setAbertaNoCelular] = useState(false);

  const itens = menuDoPerfil(perfil);

  const conteudo = (
    <div className="flex h-full flex-col bg-marinho text-areia">
      <div className={cn("flex items-center gap-3 border-b border-marinho-700 px-4 py-5", recolhida && "justify-center px-2")}>
        {recolhida ? <Simbolo className="size-9" /> : <Logo />}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="Menu principal">
        {itens.map((item) => {
          const Icone = ICONES[item.icone as keyof typeof ICONES] ?? Home;
          // "/voos/novo" é item próprio; "/voos" não pode acender junto.
          const ativo =
            !item.emBreve &&
            (caminho === item.href ||
              (caminho.startsWith(`${item.href}/`) && !itens.some((o) => o !== item && o.href === caminho)));

          if (item.emBreve) {
            return (
              <div
                key={item.rotulo}
                title={recolhida ? `${item.rotulo} — em breve` : undefined}
                className={cn(
                  "flex cursor-default items-center gap-3 rounded px-3 py-2.5 text-sm text-marinho-300",
                  recolhida && "justify-center px-2",
                )}
              >
                <Icone className="size-5 shrink-0" aria-hidden />
                {!recolhida && (
                  <>
                    <span className="flex-1 truncate">{item.rotulo}</span>
                    <span className="text-[10px] uppercase tracking-wide">em breve</span>
                  </>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.rotulo}
              href={item.href}
              onClick={() => setAbertaNoCelular(false)}
              aria-current={ativo ? "page" : undefined}
              title={recolhida ? item.rotulo : undefined}
              className={cn(
                "flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition-colors",
                recolhida && "justify-center px-2",
                ativo ? "bg-laranja text-marinho" : "text-areia hover:bg-marinho-700",
              )}
            >
              <Icone className="size-5 shrink-0" aria-hidden />
              {!recolhida && <span className="truncate">{item.rotulo}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={cn("border-t border-marinho-700 p-3", recolhida && "px-2")}>
        {!recolhida && (
          <div className="mb-2 px-1">
            <p className="truncate text-sm font-semibold">{nome}</p>
            <p className="text-xs text-marinho-300">{ROTULO_PERFIL[perfil]}</p>
          </div>
        )}
        <div className={cn("flex items-center gap-1", recolhida && "flex-col")}>
          <form action={aoSair} className="flex-1">
            <button
              type="submit"
              title="Sair"
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-2 text-sm text-areia hover:bg-marinho-700",
                recolhida && "justify-center",
              )}
            >
              <LogOut className="size-4" aria-hidden />
              {!recolhida && "Sair"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setRecolhida((r) => !r)}
            title={recolhida ? "Expandir menu" : "Recolher menu"}
            className="hidden rounded p-2 text-marinho-300 hover:bg-marinho-700 hover:text-areia md:block"
          >
            {recolhida ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Celular: cabeçalho com o botão do menu */}
      <header className="flex items-center justify-between bg-marinho px-4 py-3 text-areia md:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setAbertaNoCelular(true)}
          aria-label="Abrir menu"
          className="rounded p-2 hover:bg-marinho-700"
        >
          <Menu className="size-6" />
        </button>
      </header>

      {abertaNoCelular && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-72 max-w-[85vw]">{conteudo}</div>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setAbertaNoCelular(false)}
            className="flex-1 bg-marinho/60"
          >
            <X className="m-4 size-6 text-areia" />
          </button>
        </div>
      )}

      <aside className={cn("hidden shrink-0 md:block", recolhida ? "w-16" : "w-64")}>
        <div className="sticky top-0 h-dvh">{conteudo}</div>
      </aside>
    </>
  );
}
