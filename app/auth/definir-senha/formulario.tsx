"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alerta } from "@/components/ui/alerta";
import { criarClienteNavegador } from "@/lib/supabase/client";

type Estado =
  | { fase: "lendo" }
  | { fase: "pronto"; email: string | null }
  | { fase: "invalido"; motivo: string }
  | { fase: "feito" };

/**
 * Onde o link do convite chega.
 *
 * O Auth do Supabase valida o link e manda a pessoa para cá com a sessão
 * nos fragmentos da URL (#access_token=…). Esta tela guarda a sessão no
 * navegador e pede a senha — antes, o link caía na tela de login, que não
 * sabia o que fazer com o token, e ninguém conseguia entrar.
 */
export function FormularioDefinirSenha() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [estado, setEstado] = useState<Estado>({ fase: "lendo" });
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const supabase = criarClienteNavegador();
    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);

      if (hash.get("error") || query.get("error")) {
        const desc = hash.get("error_description") ?? query.get("error_description") ?? "";
        setEstado({
          fase: "invalido",
          motivo: /expired|invalid/i.test(desc) ? "O link venceu ou já foi usado. Peça um convite novo ao administrador." : desc || "Link inválido.",
        });
        return;
      }

      const access = hash.get("access_token");
      const refresh = hash.get("refresh_token");
      const code = query.get("code");
      // Link "#th=…": o token fica no fragmento, que o WhatsApp não lê ao
      // montar a prévia — só o navegador da pessoa gasta o link, aqui.
      const tokenHash = hash.get("th");
      try {
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
          if (error) throw error;
          window.history.replaceState(null, "", window.location.pathname);
        } else if (access && refresh) {
          const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
          if (error) throw error;
          // Tira o token da barra de endereço: não fica no histórico.
          window.history.replaceState(null, "", window.location.pathname);
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          window.history.replaceState(null, "", window.location.pathname);
        }
      } catch (e) {
        const m = e instanceof Error ? e.message : "";
        setEstado({ fase: "invalido", motivo: /expired|invalid|not found/i.test(m) ? "O link venceu ou já foi usado. Peça um convite novo ao administrador." : m || "Não consegui validar o link." });
        return;
      }

      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setEstado({ fase: "invalido", motivo: "Link inválido ou vencido. Peça um convite novo ao administrador." });
        return;
      }
      setEstado({ fase: "pronto", email: data.user.email ?? null });
    })();
  }, []);

  function salvar() {
    setErro(null);
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== confirmar) return setErro("As duas senhas não são iguais.");
    iniciar(async () => {
      const supabase = criarClienteNavegador();
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) {
        setErro(/same password|different from the old/i.test(error.message) ? "Escolha uma senha diferente da atual." : error.message);
        return;
      }
      setEstado({ fase: "feito" });
      router.replace("/inicio");
      router.refresh();
    });
  }

  if (estado.fase === "lendo") {
    return (
      <p className="mt-8 flex items-center gap-2 text-sm text-marinho-300">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Validando o link…
      </p>
    );
  }
  if (estado.fase === "invalido") {
    return (
      <div className="mt-8 space-y-4">
        <Alerta tom="erro">{estado.motivo}</Alerta>
        <Button asChild variant="secundario">
          <a href="/login">Ir para o login</a>
        </Button>
      </div>
    );
  }
  if (estado.fase === "feito") {
    return <Alerta tom="ok">Senha definida. Entrando…</Alerta>;
  }

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
    >
      {estado.email && (
        <p className="text-sm text-marinho-300">
          Conta: <strong>{estado.email}</strong>
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="senha">Nova senha</Label>
        <Input id="senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} autoFocus />
        <p className="text-xs text-marinho-300">Pelo menos 8 caracteres.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmar">Repita a senha</Label>
        <Input id="confirmar" type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required minLength={8} />
      </div>
      {erro && <Alerta tom="erro">{erro}</Alerta>}
      <Button type="submit" size="campo" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
        {pendente ? "Salvando…" : "Definir senha e entrar"}
      </Button>
    </form>
  );
}
