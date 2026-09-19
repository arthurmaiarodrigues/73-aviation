"use client";

import { useEffect, useState } from "react";
import { Check, Download, Share, SquarePlus, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";

type Plataforma = "ios" | "android" | "outro";
type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function detectar(): Plataforma {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "outro";
}

/**
 * Instalar o app na tela inicial. Android/Chrome: um toque (o navegador
 * entrega o pedido de instalação). iPhone: a Apple não deixa instalar por
 * botão — mostra o passo a passo do Safari. Já instalado: diz que está.
 */
export function InstalarApp() {
  const [plataforma, setPlataforma] = useState<Plataforma>("outro");
  const [instalado, setInstalado] = useState(false);
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [safari, setSafari] = useState(true);

  useEffect(() => {
    setPlataforma(detectar());
    const modo = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalado(modo);
    setSafari(/Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent));
    const capturar = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    window.addEventListener("beforeinstallprompt", capturar);
    window.addEventListener("appinstalled", () => setInstalado(true));
    return () => window.removeEventListener("beforeinstallprompt", capturar);
  }, []);

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    if (outcome === "accepted") setInstalado(true);
    setEvento(null);
  }

  if (instalado) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-ok bg-ok/10 p-4 text-sm">
        <Check className="size-5 text-ok" />
        <p>
          <span className="font-semibold">O app já está instalado neste aparelho.</span> Abra pelo ícone 73 Aviation na tela inicial.
        </p>
      </div>
    );
  }

  if (plataforma === "ios") {
    return (
      <div className="space-y-4">
        {!safari && (
          <p className="rounded-lg border border-atencao bg-atencao/10 p-3 text-sm">
            No iPhone a instalação só funciona pelo <strong>Safari</strong>. Abra <strong>ppznm.vercel.app</strong> no Safari e volte aqui.
          </p>
        )}
        <ol className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-marinho text-xs font-semibold text-areia">1</span>
            <p>
              Toque no botão <strong>Compartilhar</strong> <Share className="inline size-4 align-text-bottom" /> na barra de baixo do Safari (o quadrado com a seta para cima).
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-marinho text-xs font-semibold text-areia">2</span>
            <p>
              Role a lista e toque em <strong>Adicionar à Tela de Início</strong> <SquarePlus className="inline size-4 align-text-bottom" />.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-marinho text-xs font-semibold text-areia">3</span>
            <p>
              Toque em <strong>Adicionar</strong> no canto superior direito. Pronto: o ícone 73 Aviation aparece na tela inicial — abra sempre por ele (é o que permite os avisos).
            </p>
          </li>
        </ol>
      </div>
    );
  }

  if (evento) {
    return (
      <div className="space-y-3">
        <Button type="button" size="campo" onClick={instalar}>
          <Download /> Instalar o app neste aparelho
        </Button>
        <p className="text-xs text-marinho-300">Um toque: o Android pergunta "Instalar?" e coloca o ícone na tela inicial.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-start gap-2">
        <Smartphone className="mt-0.5 size-4 shrink-0" />
        <span>
          No <strong>Android (Chrome)</strong>: toque nos três pontos <strong>⋮</strong> no canto superior direito e em <strong>Instalar app</strong> (ou "Adicionar à tela inicial").
        </span>
      </p>
      <p className="text-xs text-marinho-300">No computador (Chrome ou Edge): ícone de instalar na barra de endereço, à direita.</p>
    </div>
  );
}
