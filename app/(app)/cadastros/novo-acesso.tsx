"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { BotaoCopiar } from "@/components/botao-copiar";
import { ROTULO_PERFIL, type Perfil } from "@/lib/tipos";
import { criarAcesso, linkDeAcesso, type ResultadoAcesso } from "./acoes";

const INICIAL: ResultadoAcesso = { ok: true, mensagem: "", link: null };

function Botao() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
      {pending ? "Criando…" : "Criar acesso"}
    </Button>
  );
}

/** Cria o login de alguém e devolve o link pessoal para mandar. */
export function NovoAcesso() {
  const [estado, acao] = useActionState(criarAcesso, INICIAL);
  return (
    <form action={acao} className="space-y-3">
      {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}
      {estado.link && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-ok/50 bg-ok/5 p-3">
          <span className="min-w-0 flex-1 break-all text-xs">{estado.link}</span>
          <BotaoCopiar valor={estado.link} rotulo="copiar o link" />
        </div>
      )}
      <div className="grid items-end gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="a-email" className="text-xs">
            E-mail
          </Label>
          <Input id="a-email" name="email" type="email" placeholder="pessoa@email.com" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="a-nome" className="text-xs">
            Nome
          </Label>
          <Input id="a-nome" name="nome" placeholder="NOME COMPLETO" className="uppercase" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="a-perfil" className="text-xs">
            Perfil
          </Label>
          <Select id="a-perfil" name="perfil" defaultValue="socio">
            {(Object.keys(ROTULO_PERFIL) as Perfil[]).map((p) => (
              <option key={p} value={p}>
                {ROTULO_PERFIL[p]}
              </option>
            ))}
          </Select>
        </div>
        <Botao />
      </div>
      <p className="text-xs text-marinho-300">
        O app cria o login e devolve um link para a pessoa escolher a senha (vale 12 h). Sócio com o mesmo primeiro nome e piloto com o mesmo nome do cadastro
        ficam vinculados sozinhos.
      </p>
    </form>
  );
}

/** Novo link para quem já tem login: esqueceu a senha ou o link venceu. */
export function BotaoLinkAcesso({ id }: { id: string }) {
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<ResultadoAcesso | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="fantasma"
        size="pequeno"
        disabled={pendente}
        onClick={() => iniciar(async () => setR(await linkDeAcesso(id)))}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <KeyRound className="size-4" />} link de acesso
      </Button>
      {r?.link && <BotaoCopiar valor={r.link} rotulo="copiar" />}
      {r && !r.ok && <span className="text-xs text-erro">{r.mensagem}</span>}
    </span>
  );
}
