"use client";

import { useEffect } from "react";

/**
 * Convite antigo, mandado antes de existir /auth/definir-senha, cai aqui
 * com a sessão no fragmento da URL. Em vez de a pessoa olhar para um login
 * que não sabe o que fazer com isso, segue para a tela certa — com o
 * fragmento junto, que é onde está o token.
 */
export function RedirecionarConvite() {
  useEffect(() => {
    const h = window.location.hash;
    if (/access_token=|type=invite|type=recovery|error=/.test(h)) {
      window.location.replace(`/auth/definir-senha${h}`);
    }
  }, []);
  return null;
}
