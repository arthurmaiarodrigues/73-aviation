import type { CookieOptions } from "@supabase/ssr";

/** Formato que o @supabase/ssr passa para setAll. */
export type CookieParaGravar = {
  name: string;
  value: string;
  options: CookieOptions;
};
