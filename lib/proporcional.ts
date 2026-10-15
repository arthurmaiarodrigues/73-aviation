/**
 * Divide um total entre partes proporcionalmente ao peso de cada uma, em
 * centavos fechados: arredonda cada parte e joga a sobra (ou a falta) na
 * maior delas — a soma bate exatamente com o total.
 *
 * Usado para espalhar o desconto da nota pelos itens.
 */
export function ratearProporcional(pesos: number[], total: number): number[] {
  const soma = pesos.reduce((s, p) => s + p, 0);
  if (pesos.length === 0) return [];
  if (soma <= 0) return pesos.map(() => 0);

  const partes = pesos.map((p) => Math.round((p / soma) * total * 100) / 100);
  const diferenca = Math.round((total - partes.reduce((s, p) => s + p, 0)) * 100) / 100;
  if (diferenca !== 0) {
    let maior = 0;
    for (let i = 1; i < partes.length; i++) if (partes[i] > partes[maior]) maior = i;
    partes[maior] = Math.round((partes[maior] + diferenca) * 100) / 100;
  }
  return partes;
}
