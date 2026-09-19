"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type Estado = "carregando" | "sem-suporte" | "bloqueado" | "inativo" | "ativo" | "trabalhando";

function base64ParaUint8(b64: string): Uint8Array {
  const p = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + p).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Botão "Receber avisos no celular": registra o service worker, pede
 * permissão e guarda a inscrição. No iPhone só funciona com o app
 * instalado na tela inicial (Compartilhar → Adicionar à Tela de Início).
 */
export function AtivarAvisos({ compacto = false }: { compacto?: boolean }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!chave || typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setEstado("sem-suporte");
      return;
    }
    if (Notification.permission === "denied") {
      setEstado("bloqueado");
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEstado(sub ? "ativo" : "inativo"))
      .catch(() => setEstado("sem-suporte"));
  }, [chave]);

  async function ativar() {
    setErro(null);
    setEstado("trabalhando");
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "inativo");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaUint8(chave!) as BufferSource });
      const resp = await fetch("/api/push/inscrever", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...sub.toJSON(), aparelho: navigator.userAgent }),
      });
      if (!resp.ok) throw new Error("Não consegui guardar a inscrição.");
      setEstado("ativo");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ativar.");
      setEstado("inativo");
    }
  }

  async function desativar() {
    setEstado("trabalhando");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/inscrever", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint, remover: true }) });
        await sub.unsubscribe();
      }
    } finally {
      setEstado("inativo");
    }
  }

  if (estado === "carregando" || estado === "sem-suporte") {
    if (estado === "sem-suporte" && !compacto) {
      return <p className="text-xs text-marinho-300">Avisos no celular: no iPhone, instale o app na tela inicial (Compartilhar → Adicionar à Tela de Início) e abra por lá.</p>;
    }
    return null;
  }
  if (estado === "bloqueado") {
    return <p className="text-xs text-marinho-300">Avisos bloqueados neste aparelho — libere nas configurações do navegador.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {estado === "ativo" ? (
        <Button type="button" variant="fantasma" size="pequeno" onClick={desativar}>
          <BellOff /> Avisos ativos neste aparelho · desligar
        </Button>
      ) : (
        <Button type="button" variant="secundario" size="pequeno" onClick={ativar} disabled={estado === "trabalhando"}>
          {estado === "trabalhando" ? <Loader2 className="animate-spin" /> : <Bell />} Receber avisos no celular
        </Button>
      )}
      {erro && <span className="text-xs text-erro">{erro}</span>}
    </div>
  );
}
