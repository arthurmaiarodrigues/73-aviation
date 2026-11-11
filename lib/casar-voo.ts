/**
 * Acha o voo de uma linha da nota — "03/09 SNTF-SBSV PAN", "TAXA POUSO SBSV 21/09".
 * Casa pela data (dia/mês; sem ano, o mais recente até a data da nota) e,
 * quando a linha traz aeródromos, pelos aeródromos do voo (origem, destino,
 * escalas). Só devolve quando há um candidato claro — na dúvida, nenhum, e a
 * pessoa escolhe na tela.
 */
export type VooParaCasar = {
  id: string;
  data: string;
  data_volta?: string | null;
  origem: string | null;
  destino: string | null;
  escalas?: string[];
  /** Para desempatar: dois voos do mesmo sócio no dia cobram igual. */
  socio_id?: string | null;
  dividido?: boolean;
};

const dois = (n: number) => String(n).padStart(2, "0");

export function casarVoo(descricao: string, voos: VooParaCasar[], dataNota: string): string | null {
  const texto = descricao.toUpperCase();
  const m = texto.match(/(?:^|[^\d])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  const anoNota = Number(dataNota.slice(0, 4)) || new Date().getFullYear();
  let ano = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : anoNota;
  // sem ano e dia/mês depois da nota: é do ano anterior (fatura de janeiro cobrando dezembro)
  if (!m[3] && `${anoNota}-${dois(mes)}-${dois(dia)}` > dataNota) ano = anoNota - 1;
  const alvo = `${ano}-${dois(mes)}-${dois(dia)}`;

  const candidatos = voos.filter((v) => v.data === alvo || v.data_volta === alvo);
  if (candidatos.length === 0) return null;

  // aeródromos citados na linha (ICAO brasileiro começa com S)
  const icaos = new Set(texto.match(/\bS[A-Z][A-Z0-9]{2}\b/g) ?? []);
  if (icaos.size === 0) return candidatos.length === 1 ? candidatos[0].id : mesmoDono(candidatos);

  // trecho com direção ("SNTF-SBGV"): vale mais quando bate origem e destino nessa ordem
  const trecho = texto.match(/\b(S[A-Z][A-Z0-9]{2})\s*(?:-|>|\/|\u2013|\u2192)+\s*(S[A-Z][A-Z0-9]{2})\b/);

  const pontos = candidatos
    .map((v) => {
      const doVoo = new Set([v.origem, v.destino, ...(v.escalas ?? [])].filter(Boolean) as string[]);
      let p = [...icaos].filter((i) => doVoo.has(i)).length;
      if (trecho && v.origem === trecho[1] && v.destino === trecho[2]) p += 2;
      return { v, pontos: p };
    })
    .sort((a, b) => b.pontos - a.pontos);
  const melhor = pontos[0];
  if (melhor.pontos === 0) return null;
  const empatados = pontos.filter((p) => p.pontos === melhor.pontos).map((p) => p.v);
  if (empatados.length === 1) return melhor.v.id;
  return mesmoDono(empatados);
}

/** Empate entre voos do mesmo sócio (ida e volta no dia): a cobrança é a mesma, vale o primeiro. */
function mesmoDono(voos: VooParaCasar[]): string | null {
  const dono = voos[0]?.socio_id;
  return dono && voos.every((v) => v.socio_id === dono && !v.dividido) ? voos[0].id : null;
}
