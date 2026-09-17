"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Cliente de navegador: chave publicável (sb_publishable_…), nunca a secreta. */
export function criarClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
