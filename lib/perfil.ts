import "server-only";

import { redirect } from "next/navigation";

import { criarClienteServidor } from "@/lib/supabase/server";
import { veValores, type Perfil } from "@/lib/tipos";

export type UsuarioSessao = {
  id: string;
  email: string | null;
  nome: string;
  perfil: Perfil;
  ativo: boolean;
  /** id em `socios`, quando o usuário é um dos sócios. */
  socioId: string | null;
  socioApelido: string | null;
};

/**
 * Usuário da sessão + perfil, lido com o cliente de SESSÃO — a RLS decide o
 * que aparece. Nada de chave secreta no caminho da requisição.
 */
export async function usuarioDaSessao(): Promise<
  | { user: null; usuario: null }
  | { user: { id: string; email: string | null }; usuario: UsuarioSessao | null }
> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, usuario: null };

  const [{ data }, { data: socio }] = await Promise.all([
    supabase.from("usuarios").select("id, nome, perfil, ativo").eq("id", user.id).maybeSingle(),
    supabase.from("socios").select("id, apelido").eq("usuario_id", user.id).maybeSingle(),
  ]);

  return {
    user: { id: user.id, email: user.email ?? null },
    usuario: data
      ? {
          id: data.id as string,
          email: user.email ?? null,
          nome: data.nome as string,
          perfil: data.perfil as Perfil,
          ativo: data.ativo as boolean,
          socioId: (socio?.id as string | undefined) ?? null,
          socioApelido: (socio?.apelido as string | undefined) ?? null,
        }
      : null,
  };
}

export async function exigirSessao(): Promise<UsuarioSessao> {
  const { user, usuario } = await usuarioDaSessao();
  if (!user) redirect("/login");
  if (!usuario || !usuario.ativo) redirect("/inicio");
  return usuario;
}

/** Porteiro das telas com valores: piloto de fora não entra. */
export async function exigirValores(): Promise<UsuarioSessao> {
  const usuario = await exigirSessao();
  if (!veValores(usuario.perfil)) redirect("/inicio?sem-acesso=valores");
  return usuario;
}

export async function exigirAdmin(): Promise<UsuarioSessao> {
  const usuario = await exigirSessao();
  if (usuario.perfil !== "admin") redirect("/inicio?sem-acesso=admin");
  return usuario;
}
