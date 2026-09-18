#!/usr/bin/env node
/**
 * Carrega os aeródromos civis brasileiros (ANAC, dados abertos) em `aerodromos`.
 *
 *   npm run importar-aerodromos
 *
 * Lê dados/aerodromos/AerodromosPublicos.csv e AerodromosPrivados.csv
 * (ISO-8859-1, separador ";", primeira linha "Atualizado em: AAAA-MM-DD").
 * Para baixar de novo: pasta "Aerodromos" em https://sistemas.anac.gov.br/dadosabertos/
 * Idempotente: upsert por ICAO. Aeródromo cadastrado à mão (sem tipo) é
 * preservado no que a ANAC não traz.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secreta = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secreta) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}
const db = createClient(url, secreta, { auth: { persistSession: false } });
const pasta = resolve(import.meta.dirname, "..", "dados", "aerodromos");

const UF = { ACRE: "AC", ALAGOAS: "AL", AMAPA: "AP", AMAZONAS: "AM", BAHIA: "BA", CEARA: "CE", "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", GOIAS: "GO", MARANHAO: "MA", "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG", PARA: "PA", PARAIBA: "PB", PARANA: "PR", PERNAMBUCO: "PE", PIAUI: "PI", "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS", RONDONIA: "RO", RORAIMA: "RR", "SANTA CATARINA": "SC", "SAO PAULO": "SP", SERGIPE: "SE", TOCANTINS: "TO" };
const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
// "BAHIA" (lista pública) e "BA" (lista privada) viram a sigla.
const uf = (t) => { const v = semAcento(caixaAlta(t) ?? ""); return UF[v] ?? (v.length === 2 ? v : null); };
const caixaAlta = (t) => String(t ?? "").trim().replace(/\s+/g, " ").toUpperCase() || null;
const num = (t) => {
  const s = String(t ?? "").trim().replace(",", ".");
  const n = Number(s);
  return s && Number.isFinite(n) ? n : null;
};
// 09°52'06"S → -9.868333
function gms(t) {
  const m = /(\d+)[°º]\s*(\d+)'\s*(\d+(?:[.,]\d+)?)"?\s*([NSEWO])/i.exec(String(t ?? ""));
  if (!m) return num(t);
  const v = Number(m[1]) + Number(m[2]) / 60 + Number(m[3].replace(",", ".")) / 3600;
  return /[SWO]/i.test(m[4]) ? -v : v;
}

function lerCsv(nome) {
  const bruto = readFileSync(resolve(pasta, nome)).toString("latin1");
  const linhas = bruto.split(/\r?\n/).filter((l) => l.trim());
  const atualizado = /Atualizado em:\s*(\d{4}-\d{2}-\d{2})/.exec(linhas[0])?.[1] ?? null;
  const cab = linhas[1].split(";").map((c) => c.trim());
  const idx = (prefixo) => cab.findIndex((c) => c.toLowerCase().startsWith(prefixo.toLowerCase()));
  const registros = [];
  for (const linha of linhas.slice(2)) {
    const c = linha.split(";");
    const icao = caixaAlta(c[idx("Código OACI")]);
    if (!icao || !/^[A-Z0-9]{4}$/.test(icao)) continue;
    registros.push({ icao, c, idx });
  }
  return { atualizado, registros };
}

const publicos = lerCsv("AerodromosPublicos.csv");
const privados = lerCsv("AerodromosPrivados.csv");

const porIcao = new Map();
for (const { icao, c, idx } of publicos.registros) {
  porIcao.set(icao, {
    icao,
    nome: caixaAlta(c[idx("Nome")]),
    cidade: caixaAlta(c[idx("Município")]),
    uf: uf(c[idx("UF")]),
    tipo: "PUBLICO",
    latitude: num(c[idx("LATGEOPOINT")]) ?? gms(c[idx("Latitude")]),
    longitude: num(c[idx("LONGEOPOINT")]) ?? gms(c[idx("Longitude")]),
    altitude_m: num(c[idx("Altitude")]),
    noturno: /VFR|IFR/i.test(c[idx("Operação Noturna")] ?? ""),
    pista_m: null,
    superficie: null,
    fonte: "ANAC PUBLICOS",
    atualizado_em: publicos.atualizado,
  });
}
for (const { icao, c, idx } of privados.registros) {
  if (porIcao.has(icao)) continue; // público prevalece
  porIcao.set(icao, {
    icao,
    nome: caixaAlta(c[idx("Nome")]),
    cidade: caixaAlta(c[idx("Município")]),
    uf: uf(c[idx("UF")]),
    tipo: "PRIVADO",
    latitude: num(c[idx("LATGEOPOINT")]) ?? gms(c[idx("Latitude")]),
    longitude: num(c[idx("LONGEOPOINT")]) ?? gms(c[idx("Longitude")]),
    altitude_m: num(c[idx("Altitude")]),
    noturno: /VFR|IFR/i.test(c[idx("Operação Noturna")] ?? ""),
    pista_m: Math.round(num(c[idx("Comprimento 1")]) ?? 0) || null,
    superficie: caixaAlta(c[idx("Superfície 1")]),
    fonte: "ANAC PRIVADOS",
    atualizado_em: privados.atualizado,
  });
}

const lista = [...porIcao.values()];
console.log(`\n  ${publicos.registros.length} públicos (${publicos.atualizado}) + ${privados.registros.length} privados (${privados.atualizado}) → ${lista.length} aeródromos\n`);

let gravados = 0;
for (let i = 0; i < lista.length; i += 500) {
  const lote = lista.slice(i, i + 500);
  const { error } = await db.from("aerodromos").upsert(lote, { onConflict: "icao" });
  if (error) {
    console.error(`  ✗ lote ${i / 500 + 1}: ${error.message}`);
    process.exit(1);
  }
  gravados += lote.length;
  process.stdout.write(`\r  ${gravados}/${lista.length}`);
}
const { count } = await db.from("aerodromos").select("*", { count: "exact", head: true });
console.log(`\n\n  ✓ ${gravados} gravados · ${count} aeródromos na tabela\n`);
const { data: ex } = await db.from("aerodromos").select("icao, nome, cidade, uf, tipo").in("icao", ["SNTF", "SBSV", "SDC4", "SIVV", "SNGI"]);
console.table(ex);
