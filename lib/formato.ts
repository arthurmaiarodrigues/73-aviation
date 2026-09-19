/** Formatação pt-BR — usar sempre estas funções, nunca toLocaleString solto. */

const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DECIMAL_1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const MES = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

function numero(valor: number | string | null | undefined): number | null {
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return n;
}

/** R$ 1.234,56 — negativos com sinal, nunca com parênteses. */
export function reais(valor: number | string | null | undefined): string {
  const n = numero(valor);
  return n === null ? "—" : MOEDA.format(n);
}

/** Horímetro: 1.131,7 (sempre um décimo). */
export function horimetro(valor: number | string | null | undefined): string {
  const n = numero(valor);
  return n === null ? "—" : DECIMAL_1.format(n);
}

/** Horas: 4,4 h */
export function horas(valor: number | string | null | undefined): string {
  const n = numero(valor);
  return n === null ? "—" : `${DECIMAL_1.format(n)} h`;
}

/** Litros: 115 L (inteiro quando é inteiro, senão um décimo). */
export function litros(valor: number | string | null | undefined): string {
  const n = numero(valor);
  if (n === null) return "—";
  return `${Number.isInteger(n) ? INTEIRO.format(n) : DECIMAL_1.format(n)} L`;
}

/** 12,5 % */
export function percentual(valor: number | string | null | undefined, casas = 1): string {
  const n = numero(valor);
  return n === null
    ? "—"
    : `${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })} %`;
}

/** DD/MM/AAAA a partir de "AAAA-MM-DD" ou Date. */
export function data(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const d = typeof valor === "string" ? new Date(`${valor.slice(0, 10)}T00:00:00Z`) : valor;
  if (Number.isNaN(d.getTime())) return "—";
  return DATA.format(d);
}

/** "setembro de 2026" a partir de "AAAA-MM-01". */
export function mesPorExtenso(valor: string | null | undefined): string {
  const t = mesBruto(valor);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function mesBruto(valor: string | null | undefined): string {
  if (!valor) return "—";
  const d = new Date(`${valor.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return MES.format(d);
}

/** Hoje em "AAAA-MM-DD" no fuso da Bahia. */
export function hoje(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bahia" });
}

/** Primeiro dia do mês de uma data "AAAA-MM-DD". */
export function inicioDoMes(dataIso: string): string {
  return `${dataIso.slice(0, 7)}-01`;
}

/** Todo cadastro de texto é salvo em CAIXA ALTA e sem espaços duplos. */
export function caixaAlta(texto: string): string {
  return texto.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

/** "1:30" → 1.5; "1,5" → 1.5. Horas de perna aceitam h:mm ou decimal. */
export function lerHorasHm(texto: FormDataEntryValue | string | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  const t = String(texto).trim();
  const m = t.match(/^(\d{1,3})[:h](\d{1,2})$/i);
  if (m) {
    const min = Number(m[2]);
    if (min >= 60) return null;
    return Math.round((Number(m[1]) + min / 60) * 10) / 10;
  }
  return lerNumero(t);
}

/** 1.5 → "1h30". */
export function horasHm(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—";
  const total = Math.round(valor * 60);
  return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, "0")}`;
}

/** "1.131,7" ou "1131.7" → 1131.7. Aceita vírgula e ponto. */
export function lerNumero(texto: FormDataEntryValue | string | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  const t = String(texto).trim();
  if (!t) return null;
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}
