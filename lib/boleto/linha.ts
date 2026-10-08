/**
 * Linha digitável do boleto: confere os dígitos e tira dela o vencimento e
 * o valor. É a parte mais confiável do documento — quando os dígitos
 * verificadores fecham, o que está codificado ali vale mais do que a
 * leitura do desenho do boleto.
 *
 * Boleto de cobrança bancária (47 dígitos):
 *   campo 1 (10) · campo 2 (11) · campo 3 (11) · DV geral (1) ·
 *   fator de vencimento (4) + valor em centavos (10)
 *
 * Conta de consumo (48 dígitos, começa com 8: água, luz, tributo) não tem
 * fator de vencimento — devolvemos só o valor.
 */

export type LinhaLida = {
  digitos: string;
  tipo: "COBRANCA" | "CONCESSIONARIA";
  /** Os dígitos verificadores dos campos fecham. */
  valida: boolean;
  vencimento: string | null;
  valor: number | null;
};

/** Módulo 10 dos campos da linha digitável (peso 2,1,2,1… da direita). */
function modulo10(bloco: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = bloco.length - 1; i >= 0; i--) {
    let n = Number(bloco[i]) * peso;
    if (n > 9) n -= 9;
    soma += n;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

/** 03/07/2000 = fator 1000; em 22/02/2025 o contador voltou a 1000. */
function dataDoFator(fator: number): string | null {
  if (!Number.isInteger(fator) || fator < 1000 || fator > 9999) return null;
  const candidatos = [Date.UTC(2000, 6, 3), Date.UTC(2025, 1, 22)].map((base) => new Date(base + (fator - 1000) * 86_400_000));
  const hoje = Date.now();
  // Vale a data que faz sentido para uma conta de hoje: do ano passado até 5 anos à frente.
  const plausivel = candidatos.filter((d) => d.getTime() > hoje - 400 * 86_400_000 && d.getTime() < hoje + 1800 * 86_400_000);
  const escolhida = plausivel[0] ?? candidatos[candidatos.length - 1];
  return escolhida.toISOString().slice(0, 10);
}

export function lerLinhaDigitavel(texto: string | null | undefined): LinhaLida | null {
  const digitos = String(texto ?? "").replace(/\D/g, "");
  if (digitos.length !== 47 && digitos.length !== 48) return null;

  if (digitos.length === 48) {
    // Concessionária: valor nas posições 4 a 14 (11 dígitos, centavos).
    const valor = Number(digitos.slice(4, 15)) / 100;
    return { digitos, tipo: "CONCESSIONARIA", valida: digitos.startsWith("8"), vencimento: null, valor: valor > 0 ? valor : null };
  }

  const campos = [
    { bloco: digitos.slice(0, 9), dv: Number(digitos[9]) },
    { bloco: digitos.slice(10, 20), dv: Number(digitos[20]) },
    { bloco: digitos.slice(21, 31), dv: Number(digitos[31]) },
  ];
  const valida = campos.every((c) => modulo10(c.bloco) === c.dv);

  const fator = Number(digitos.slice(33, 37));
  const centavos = Number(digitos.slice(37, 47));
  return {
    digitos,
    tipo: "COBRANCA",
    valida,
    vencimento: dataDoFator(fator),
    valor: centavos > 0 ? centavos / 100 : null,
  };
}
