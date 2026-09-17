"use server";

import { redirect } from "next/navigation";

import { criarClienteServidor } from "@/lib/supabase/server";

export type EstadoLogin = { erro: string | null };

/** Traduz as mensagens do Supabase Auth; nada de inglês para o usuário. */
function traduzirErro(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "E-mail ainda não confirmado.";
  if (m.includes("too many requests") || m.includes("rate limit"))
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  if (m.includes("fetch") || m.includes("network"))
    return "Sem conexão com o servidor. Verifique a internet.";
  return "Não foi possível entrar. Tente novamente.";
}

/**
 * Login como Server Action, de propósito.
 *
 * Com `onSubmit` no cliente, um envio antes da hidratação (celular lento na
 * obra, erro de JS) caía no envio nativo do formulário — que é GET e joga
 * `?email=...&senha=...` na URL, no histórico do navegador e no log do
 * servidor. Como Server Action o envio é POST para o servidor mesmo sem
 * JavaScript, e a senha nunca aparece na barra de endereços.
 */
export async function entrar(
  _anterior: EstadoLogin,
  formulario: FormData,
): Promise<EstadoLogin> {
  const email = String(formulario.get("email") ?? "")
    .trim()
    .toLowerCase();
  const senha = String(formulario.get("senha") ?? "");
  const proximo = String(formulario.get("proximo") ?? "");

  if (!email || !senha) return { erro: "Preencha o e-mail e a senha." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) return { erro: traduzirErro(error.message) };

  // Destino só pode ser caminho interno — evita redirecionamento aberto.
  const destino = proximo.startsWith("/") && !proximo.startsWith("//") ? proximo : "/inicio";
  redirect(destino);
}
