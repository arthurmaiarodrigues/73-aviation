#!/usr/bin/env node
/**
 * Gera public/icones/ (PWA, favicon, apple-touch) a partir de
 * marca/icone-app.png. Sem o PNG, desenha um provisório no estilo do selo:
 * quadrado laranja com o avião em areia.
 *
 *   npm run gerar-icones
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const raiz = resolve(import.meta.dirname, "..");
const origem = resolve(raiz, "marca", "icone-app.png");
const destino = resolve(raiz, "public", "icones");
mkdirSync(destino, { recursive: true });

const PROVISORIO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
  <rect width="640" height="640" rx="120" fill="#E4782A"/>
  <g transform="translate(170 100) scale(3)" fill="#F3EFE8">
    <rect x="28" y="8" width="44" height="3" rx="1.5"/>
    <circle cx="50" cy="9.5" r="3.5" fill="#0E2846"/>
    <path d="M50 12c-7 0-11 8-11 20v48c0 6 3 12 11 12s11-6 11-12V32c0-12-4-20-11-20z"/>
    <path d="M50 20c-4 0-6 5-6 11v10h12V31c0-6-2-11-6-11z" fill="#0E2846"/>
    <path d="M4 52c0-2 2-4 4-4h84c2 0 4 2 4 4v4c0 2-2 4-4 4H8c-2 0-4-2-4-4z"/>
    <path d="M24 94c0-2 1-3 3-3h46c2 0 3 1 3 3v3c0 2-1 3-3 3H27c-2 0-3-1-3-3z"/>
    <rect x="47" y="98" width="6" height="8" rx="1"/>
  </g>
  <text x="320" y="560" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="150" fill="#F3EFE8">73</text>
</svg>`;

const base = existsSync(origem) ? sharp(origem) : sharp(Buffer.from(PROVISORIO));
console.log(existsSync(origem) ? `  · usando ${origem}` : "  · marca/icone-app.png não existe: gerando provisório");

const entrada = await base.png().toBuffer();

const tamanhos = [16, 32, 180, 192, 512];
for (const t of tamanhos) {
  await sharp(entrada).resize(t, t).png().toFile(resolve(destino, `icon-${t}.png`));
}

// Maskable: o Android recorta em círculo; o símbolo fica na área segura (80%).
const interno = await sharp(entrada).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#E4782A" } })
  .composite([{ input: interno, left: 51, top: 51 }])
  .png()
  .toFile(resolve(destino, "icon-512-maskable.png"));

// favicon.ico: os navegadores modernos aceitam PNG dentro do .ico; o mais
// simples e compatível é servir o PNG de 32 com esse nome.
const png32 = await sharp(entrada).resize(32, 32).png().toBuffer();
writeFileSync(resolve(destino, "favicon.ico"), png32);

console.log(`  ✓ ${tamanhos.length + 2} ícones em public/icones/`);
