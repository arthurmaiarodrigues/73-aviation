import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave secreta (sb_secret_…). Ignora RLS — usar SÓ no servidor
 * e SÓ onde não há alternativa. O import de "server-only" quebra o build se
 * este arquivo for puxado por um componente de cliente.
 */
export function criarClienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
