import { valorOfx } from "@/lib/ofx";

/**
 * Leitor do CSV que o internet banking exporta (Sicoob e afins): uma linha
 * por lançamento, cabeçalho com DATA / HISTÓRICO (ou DESCRIÇÃO) / VALOR, e
 * às vezes DOCUMENTO e "C"/"D" separando crédito de débito. Tolerante ao
 * separador (; , ou tab) e ao formato do valor.
 *
 * Sem FITID no CSV, a chave é data + valor + histórico + posição no dia —
 * importar o mesmo arquivo duas vezes não duplica; dois lançamentos
 * idênticos no mesmo dia continuam sendo dois.
 */
export type TransacaoCsv = { fitid: string; data: string; valor: number; memo: string | null; referencia: string | null };

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

function separador(linha: string): string {
  const c = { ";": (linha.match(/;/g) ?? []).length, ",": (linha.match(/,/g) ?? []).length, "\t": (linha.match(/\t/g) ?? []).length };
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

function campos(linha: string, sep: string): string[] {
  const saida: string[] = [];
  let atual = "";
  let aspas = false;
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas;
    else if (ch === sep && !aspas) {
      saida.push(atual);
      atual = "";
    } else atual += ch;
  }
  saida.push(atual);
  return saida.map((c) => c.trim());
}

/** "31/08/2026" ou "2026-08-31" → "2026-08-31". */
function dataBr(v: string): string | null {
  const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const i = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  return i ? i[0] : null;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export function lerCsvExtrato(texto: string): TransacaoCsv[] {
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  const iCab = linhas.findIndex((l) => /DATA/i.test(semAcento(l)) && /VALOR|CREDITO|DEBITO/i.test(semAcento(l)));
  if (iCab < 0) throw new Error("Não achei o cabeçalho (DATA … VALOR) no CSV.");
  const sep = separador(linhas[iCab]);
  const cab = campos(linhas[iCab], sep).map(semAcento);
  const col = (...nomes: string[]) => cab.findIndex((c) => nomes.some((n) => c.includes(n)));
  const iData = col("DATA");
  const iValor = col("VALOR");
  const iCred = col("CREDITO");
  const iDeb = col("DEBITO");
  const iMemo = col("HISTORICO", "DESCRICAO", "LANCAMENTO", "MEMO");
  const iDoc = col("DOCUMENTO", "DOC");
  const iTipo = col("TIPO", "C/D", "D/C", "NATUREZA");

  const saida: TransacaoCsv[] = [];
  const vistos = new Map<string, number>();
  for (const linha of linhas.slice(iCab + 1)) {
    const c = campos(linha, sep);
    const data = iData >= 0 ? dataBr(c[iData] ?? "") : null;
    if (!data) continue;
    let valor: number | null = null;
    if (iValor >= 0) {
      const bruto = c[iValor] ?? "";
      valor = valorOfx(bruto.replace(/[CD]\s*$/i, "").replace(/R\$/i, ""));
      // "1.234,56 D" ou coluna TIPO = D → saída
      const debito = /D\s*$/i.test(bruto.trim()) || (iTipo >= 0 && /^D/i.test(c[iTipo] ?? ""));
      if (valor !== null && debito && valor > 0) valor = -valor;
    } else {
      const cr = iCred >= 0 ? valorOfx((c[iCred] ?? "").replace(/R\$/i, "")) : null;
      const db = iDeb >= 0 ? valorOfx((c[iDeb] ?? "").replace(/R\$/i, "")) : null;
      valor = cr && cr !== 0 ? Math.abs(cr) : db && db !== 0 ? -Math.abs(db) : null;
    }
    if (valor === null || valor === 0) continue;
    const memo = iMemo >= 0 ? (c[iMemo] ?? "").replace(/\s+/g, " ").trim().toUpperCase() || null : null;
    const referencia = iDoc >= 0 ? (c[iDoc] ?? "").trim() || null : null;
    const base = `${data}|${valor.toFixed(2)}|${memo ?? ""}|${referencia ?? ""}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    saida.push({ fitid: `CSV-${hash(base)}-${n}`, data, valor, memo, referencia });
  }
  if (!saida.length) throw new Error("O CSV não tem nenhum lançamento com data e valor.");
  return saida;
}
