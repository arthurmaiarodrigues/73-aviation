#!/usr/bin/env node
/**
 * Conjunto de teste da leitura do horímetro (CLAUDE.md §6). Rodar a cada
 * mudança no prompt.
 *
 *   npm run testar-horimetro
 *
 * Fotos reais em dados/horimetro-teste/<valor esperado>.jpg (ex.: 1131.7.jpg,
 * ou 1131.7-reflexo.jpg). Sem fotos reais, gera três contadores sintéticos
 * (rolos mecânicos, mostrador digital, e um borrado que deve dar ilegível).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

import { lerHorimetro } from "../lib/horimetro/ler.ts";

const raiz = resolve(import.meta.dirname, "..");
const pasta = resolve(raiz, "dados", "horimetro-teste");
mkdirSync(pasta, { recursive: true });

function contadorMecanico(valor, { borrado = false } = {}) {
  const digitos = valor.toFixed(1).replace(".", "").padStart(6, "0").split("");
  const rolos = digitos
    .map((d, i) => {
      const x = 40 + i * 62;
      const ultimo = i === digitos.length - 1;
      return `<rect x="${x}" y="40" width="54" height="80" rx="4" fill="${ultimo ? "#f4f4f4" : "#111"}"/>
        <text x="${x + 27}" y="102" text-anchor="middle" font-family="Courier New, monospace" font-weight="bold" font-size="64" fill="${ultimo ? "#111" : "#f4f4f4"}">${d}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="200">
    <rect width="460" height="200" fill="#2a2a2a"/>
    <rect x="20" y="20" width="420" height="120" rx="8" fill="#000" stroke="#777" stroke-width="3"/>
    ${rolos}
    <text x="230" y="180" text-anchor="middle" font-family="Arial" font-size="22" fill="#ccc">HOBBS  HOURS 1/10</text>
    ${borrado ? '<rect x="0" y="0" width="460" height="200" fill="#fff" opacity="0.15"/>' : ""}
  </svg>`;
}

function mostradorDigital(valor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="220">
    <rect width="520" height="220" fill="#0a0f1a"/>
    <text x="30" y="60" font-family="Arial" font-size="26" fill="#9ad">FLT TIMER</text>
    <text x="490" y="60" text-anchor="end" font-family="Courier New" font-size="30" fill="#fff">01:24</text>
    <text x="30" y="130" font-family="Arial" font-size="26" fill="#9ad">HOBBS</text>
    <text x="490" y="132" text-anchor="end" font-family="Courier New" font-weight="bold" font-size="40" fill="#fff">${valor.toFixed(1)}</text>
    <text x="30" y="195" font-family="Arial" font-size="26" fill="#9ad">TACH</text>
    <text x="490" y="197" text-anchor="end" font-family="Courier New" font-size="30" fill="#fff">${(valor * 0.93).toFixed(1)}</text>
  </svg>`;
}

const casos = [];
const reais = existsSync(pasta) ? readdirSync(pasta).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)) : [];
for (const f of reais) {
  const m = /^(\d+(?:\.\d)?)/.exec(f);
  if (!m) continue;
  casos.push({ nome: f, esperado: Number(m[1]), bytes: readFileSync(resolve(pasta, f)), ilegivel: /ilegivel/i.test(f) });
}

if (casos.length === 0) {
  console.log("  Sem fotos reais em dados/horimetro-teste — usando 3 sintéticas.\n");
  casos.push(
    { nome: "sintetico-mecanico-1131.7", esperado: 1131.7, bytes: await sharp(Buffer.from(contadorMecanico(1131.7))).jpeg().toBuffer() },
    { nome: "sintetico-digital-2047.3", esperado: 2047.3, bytes: await sharp(Buffer.from(mostradorDigital(2047.3))).jpeg().toBuffer() },
    { nome: "sintetico-borrado-0988.2", esperado: 988.2, bytes: await sharp(Buffer.from(contadorMecanico(988.2, { borrado: true }))).blur(6).jpeg().toBuffer(), ilegivel: true },
  );
}

let acertos = 0;
let custoTokens = 0;
for (const c of casos) {
  const r = await lerHorimetro(c.bytes, { esperadoPerto: c.esperado - 2.5 });
  custoTokens += r.tokens_entrada + r.tokens_saida;
  const ok = c.ilegivel ? !r.legivel || r.confianca < 0.8 || r.leitura === c.esperado : r.legivel && r.leitura === c.esperado;
  if (ok) acertos++;
  console.log(
    `  ${ok ? "✓" : "✗"} ${c.nome.padEnd(32)} esperado ${String(c.esperado).padStart(7)}  lido ${String(r.leitura ?? "—").padStart(7)}  ` +
      `${r.legivel ? "legível" : "ILEGÍVEL"}  conf ${Math.round(r.confianca * 100)}%  ${r.duracao_ms} ms${r.observacao ? `  · ${r.observacao}` : ""}`,
  );
}
console.log(`\n  ${acertos}/${casos.length} acertos · ${custoTokens} tokens\n`);
process.exit(acertos === casos.length ? 0 : 1);
