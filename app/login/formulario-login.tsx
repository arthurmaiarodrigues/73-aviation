"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alerta } from "@/components/ui/alerta";
import { entrar, type EstadoLogin } from "./acoes";

const INICIAL: EstadoLogin = { erro: null };

function BotaoEntrar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending ? "Entrando…" : "Entrar"}
    </Button>
  );
}

export function FormularioLogin({ proximo }: { proximo?: string }) {
  const [estado, acao] = useActionState(entrar, INICIAL);

  return (
    <form action={acao} className="mt-8 space-y-5">
      <input type="hidden" name="proximo" value={proximo ?? ""} />

      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          placeholder="seu@email.com"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="senha">Senha</Label>
        <Input id="senha" name="senha" type="password" autoComplete="current-password" required />
      </div>

      {estado.erro && <Alerta tom="erro">{estado.erro}</Alerta>}

      <BotaoEntrar />

      <p className="text-xs text-marinho-300">
        Esqueceu a senha? Peça ao administrador para redefinir.
      </p>
    </form>
  );
}
