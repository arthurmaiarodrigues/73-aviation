/**
 * Leitor de OFX — o extrato que Sicoob e Banco do Brasil exportam.
 *
 * OFX 1.x é SGML sem tag de fechamento ("<MEMO>PIX RECEBIDO" e pronto);
 * OFX 2.x é XML. Um leitor por tag, tolerante aos dois, é mais seguro que
 * um parser de verdade: o que interessa são poucas tags em blocos
 * <STMTTRN>, e é assim que os bancos as escrevem.
 *
 * Puro de propósito: roda no servidor (a importação) e no teste
 * (scripts/testar-ofx.mjs), sem banco.
 */

export type TransacaoOfx = {
  fitid: string;
  data: string; // AAAA-MM-DD
  valor: number; // negativo = saiu
  tipo: "DEBITO" | "CREDITO";
  memo: string | null;
  referencia: string | null;
};

export type ExtratoOfx = {
  banco_codigo: string;
  banco: string;
  agencia: string | null;
  conta: string;
  data_inicio: string | null;
  data_fim: string | null;
  saldo_final: number | null;
  transacoes: TransacaoOfx[];
};

/** Código COMPE → nome. O que não estiver aqui usa o <ORG> do arquivo. */
const BANCOS: Record<string, string> = {
  "001": "BANCO DO BRASIL",
  "033": "SANTANDER",
  "077": "INTER",
  "104": "CAIXA ECONÔMICA FEDERAL",
  "237": "BRADESCO",
  "260": "NUBANK",
  "341": "ITAÚ",
  "748": "SICREDI",
  "756": "SICOOB",
};

/** O valor de uma tag: até a próxima tag ou o fim da linha. */
function tag(bloco: string, nome: string): string | null {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"));
  if (!m) return null;
  const v = m[1].trim();
  return v === "" ? null : v;
}

/** "20260831120000[-3:BRT]" → "2026-08-31". */
export function dataOfx(v: string | null): string | null {
  const d = (v ?? "").match(/^(\d{4})(\d{2})(\d{2})/);
  return d ? `${d[1]}-${d[2]}-${d[3]}` : null;
}

/** "-1234.56", "-1234,56", "1.234,56" → número. */
export function valorOfx(v: string | null): number | null {
  if (!v) return null;
  let s = v.trim().replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Sem acento, sem espaço duplo, CAIXA ALTA — como o resto do app. */
function limparMemo(v: string | null): string | null {
  if (!v) return null;
  const s = v.replace(/\s+/g, " ").trim().toUpperCase();
  return s || null;
}

export function lerOfx(texto: string): ExtratoOfx {
  // Alguns arquivos vêm com o cabeçalho e o corpo colados; outros com
  // quebras de linha CRLF. Normalizar é barato.
  const t = texto.replace(/\r\n?/g, "\n");

  const bankId = tag(t, "BANKID") ?? "";
  const bancoCodigo = bankId.replace(/\D/g, "").padStart(3, "0").slice(-3) || "000";
  const org = tag(t, "ORG");
  const banco = BANCOS[bancoCodigo] ?? (org ? org.toUpperCase() : `BANCO ${bancoCodigo}`);

  const conta = (tag(t, "ACCTID") ?? "").trim();
  if (!conta) throw new Error("Não achei o número da conta (<ACCTID>) no arquivo. É um OFX de extrato?");
  const agencia = tag(t, "BRANCHID");

  const blocos = t.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<LEDGERBAL>|$)/gi) ?? [];
  const transacoes: TransacaoOfx[] = [];
  for (const b of blocos) {
    const valor = valorOfx(tag(b, "TRNAMT"));
    const data = dataOfx(tag(b, "DTPOSTED"));
    const fitid = tag(b, "FITID");
    if (valor === null || !data || !fitid || valor === 0) continue;
    const memo = limparMemo([tag(b, "NAME"), tag(b, "MEMO")].filter(Boolean).join(" · "));
    transacoes.push({
      fitid,
      data,
      valor,
      tipo: valor < 0 ? "DEBITO" : "CREDITO",
      memo,
      referencia: tag(b, "CHECKNUM") ?? tag(b, "REFNUM"),
    });
  }
  if (!transacoes.length) throw new Error("O arquivo não tem nenhuma transação (<STMTTRN>).");

  // O período: o que o arquivo declara, senão o das próprias transações.
  const datas = transacoes.map((x) => x.data).sort();
  const ledger = t.match(/<LEDGERBAL>[\s\S]*?(?=<\/LEDGERBAL>|<AVAILBAL>|$)/i)?.[0] ?? "";

  return {
    banco_codigo: bancoCodigo,
    banco,
    agencia,
    conta,
    data_inicio: dataOfx(tag(t, "DTSTART")) ?? datas[0] ?? null,
    data_fim: dataOfx(tag(t, "DTEND")) ?? datas[datas.length - 1] ?? null,
    saldo_final: valorOfx(tag(ledger, "BALAMT")),
    transacoes,
  };
}

/** Lê o cabeçalho para saber como decodificar os bytes (CHARSET:1252 é comum). */
export function charsetDoOfx(inicio: string): "windows-1252" | "utf-8" {
  const m = inicio.match(/CHARSET\s*:\s*(\S+)/i);
  if (m && /1252|latin|iso-8859/i.test(m[1])) return "windows-1252";
  if (/ENCODING\s*:\s*USASCII/i.test(inicio) && !/CHARSET\s*:\s*UTF/i.test(inicio)) return "windows-1252";
  return "utf-8";
}
