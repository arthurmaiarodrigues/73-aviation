#!/usr/bin/env node
/**
 * Importa a aba HORIMETRO de HORAS E COMBUSTÍVEL.xlsx para `voos`.
 *
 *   npm run importar-horimetro -- "C:\caminho\HORAS E COMBUSTÍVEL.xlsx" [--gravar]
 *
 * Sem --gravar só mostra o que faria (e a conferência). Idempotente: cada
 * linha guarda `fonte = HORIMETRO:<linha>`; rodar de novo não duplica.
 *
 * Regras (CLAUDE.md §7):
 *   - SÓCIOS → natureza SOCIEDADE (sem sócio).
 *   - "TRANSLADO DA AERONAVE, VOO TESTE PILOTO" → TRANSLADO_MANUTENCAO.
 *   - "ROBINHO (EXTRA)" → piloto externo, sócio responsável SOCIEDADE.
 *   - Linha sem horímetro entra com as horas digitadas e pendente_horimetro.
 *   - Combustível inicial/final vira o saldo de tanque do voo.
 */
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

const [arquivo, ...flags] = process.argv.slice(2);
const gravar = flags.includes("--gravar");

if (!arquivo) {
  console.error('\n  Uso: npm run importar-horimetro -- "<caminho da planilha>" [--gravar]\n');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secreta = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secreta) {
  console.error("\n  Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env.local\n");
  process.exit(1);
}
const db = createClient(url, secreta, { auth: { autoRefreshToken: false, persistSession: false } });

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(arquivo);
const ws = wb.getWorksheet("HORIMETRO") ?? wb.worksheets[0];

const valor = (c) => {
  const v = c?.value;
  if (v && typeof v === "object") {
    if ("result" in v) return v.result;
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
  }
  return v;
};
const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const dataIso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : null);
// "HORAS DIÁRIO" é hora do Excel (fração do dia) → décimos de hora.
const horasDeExcel = (v) => {
  if (v instanceof Date) {
    const h = v.getUTCHours() + v.getUTCMinutes() / 60;
    return Math.round(h * 10) / 10;
  }
  const n = num(v);
  return n === null ? null : n < 1 ? Math.round(n * 24 * 10) / 10 : Math.round(n * 10) / 10;
};
const caixaAlta = (t) => String(t ?? "").trim().replace(/\s+/g, " ").toUpperCase();

const { data: aeronave } = await db.from("aeronaves").select("id, matricula").eq("ativo", true).limit(1).single();
const { data: socios } = await db.from("socios").select("id, apelido");
const { data: pilotos } = await db.from("pilotos").select("id, nome, socio_id");
const porApelido = new Map(socios.map((s) => [s.apelido, s]));

const linhas = [];
const pendencias = [];
const pilotosExternos = new Set();

ws.eachRow((row, n) => {
  if (n < 5) return; // cabeçalhos nas linhas 1–4
  const data = dataIso(valor(row.getCell(1)));
  if (!data) return;

  const socioTexto = caixaAlta(valor(row.getCell(2)));
  const origemBruta = caixaAlta(valor(row.getCell(3)));
  const destinoBruto = caixaAlta(valor(row.getCell(4)));
  const hi = num(valor(row.getCell(5)));
  const hf = num(valor(row.getCell(6)));
  const horasDiario = horasDeExcel(valor(row.getCell(8)));
  const ci = num(valor(row.getCell(9)));
  const cf = num(valor(row.getCell(10)));

  const ehTranslado = /TRANSLADO|VOO TESTE/.test(origemBruta);
  const origem = /^[A-Z0-9]{4}$/.test(origemBruta) ? origemBruta : null;
  const destino = /^[A-Z0-9]{4}$/.test(destinoBruto) ? destinoBruto : null;

  let socio = null;
  let natureza = "PARTICULAR";
  let pilotoExterno = null;
  const observacoes = [];

  if (socioTexto === "SÓCIOS" || socioTexto === "SOCIOS") {
    natureza = ehTranslado ? "TRANSLADO_MANUTENCAO" : "SOCIEDADE";
  } else if (/\(EXTRA\)/.test(socioTexto)) {
    natureza = "SOCIEDADE";
    pilotoExterno = socioTexto.replace(/\s*\(EXTRA\)\s*/, "").trim();
    pilotosExternos.add(pilotoExterno);
    observacoes.push(`PILOTO EXTERNO ${pilotoExterno} — USO COMUM`);
  } else {
    socio = porApelido.get(socioTexto) ?? null;
    if (!socio) pendencias.push(`linha ${n}: sócio "${socioTexto}" não cadastrado — importado como SOCIEDADE`);
    if (!socio) natureza = "SOCIEDADE";
  }
  if (ehTranslado) observacoes.push(origemBruta);

  const temHorimetro = hi !== null && hf !== null;
  const horas = temHorimetro ? Math.round((hf - hi) * 10) / 10 : horasDiario;
  if (!temHorimetro && (horas === null || horas === 0)) pendencias.push(`linha ${n}: sem horímetro e sem horas — importado com 0 h`);

  linhas.push({
    linha: n,
    fonte: `HORIMETRO:${n}`,
    aeronave_id: aeronave.id,
    data,
    socio_id: socio?.id ?? null,
    piloto_id: socio ? (pilotos.find((p) => p.socio_id === socio.id)?.id ?? null) : null,
    piloto_externo: pilotoExterno,
    origem,
    destino,
    horimetro_inicial: temHorimetro ? hi : null,
    horimetro_final: temHorimetro ? hf : null,
    horas_informadas: temHorimetro ? null : (horas ?? 0),
    combustivel_inicial_l: ci,
    combustivel_final_l: cf,
    pousos: 1,
    natureza,
    observacao: observacoes.length ? observacoes.join(" · ") : null,
    status: "CONFIRMADO",
    pendente_horimetro: !temHorimetro,
    socio_texto: socioTexto,
    horas,
  });
});

// ---- conferência: horas e saldo de combustível por sócio, como o resumo da planilha
const resumo = new Map();
for (const l of linhas) {
  const chave = l.socio_id ? l.socio_texto : "SÓCIOS";
  const r = resumo.get(chave) ?? { horas: 0, litros: 0, voos: 0 };
  r.horas += l.horas ?? 0;
  r.litros += (l.combustivel_final_l ?? 0) - (l.combustivel_inicial_l ?? 0);
  r.voos += 1;
  resumo.set(chave, r);
}

console.log(`\n  ${aeronave.matricula} · ${linhas.length} voos na planilha\n`);
for (const l of linhas) {
  console.log(
    `  L${String(l.linha).padStart(2)}  ${l.data}  ${(l.socio_texto || "").padEnd(16)} ${(l.origem ?? "????")}→${(l.destino ?? "????")}  ` +
      `${l.horimetro_inicial ?? "   -  "}→${l.horimetro_final ?? "   -  "}  ${String(l.horas ?? 0).padStart(4)} h  ` +
      `comb ${l.combustivel_inicial_l ?? "-"}→${l.combustivel_final_l ?? "-"}  ${l.natureza}${l.pendente_horimetro ? "  [PENDENTE HORÍMETRO]" : ""}`,
  );
}
console.log("\n  Conferência (bater com o resumo da aba HORIMETRO):");
for (const [k, r] of resumo) console.log(`    ${k.padEnd(12)} ${r.voos} voos  ${r.horas.toFixed(1)} h  combustível ${r.litros >= 0 ? "+" : ""}${r.litros} L`);
if (pendencias.length) {
  console.log("\n  Pendências:");
  for (const p of pendencias) console.log(`    - ${p}`);
}

if (!gravar) {
  console.log("\n  (simulação — rode com --gravar para importar)\n");
  process.exit(0);
}

// ---- gravação
for (const nome of pilotosExternos) {
  const existe = pilotos.find((p) => p.nome === nome);
  if (!existe) {
    const { data } = await db.from("pilotos").insert({ nome, socio_id: null }).select("id, nome, socio_id").single();
    if (data) pilotos.push(data);
  }
}

const { data: existentes } = await db.from("voos").select("id, fonte").like("fonte", "HORIMETRO:%");
const fontes = new Map((existentes ?? []).map((v) => [v.fonte, v.id]));

let inseridos = 0;
let atualizados = 0;
for (const l of linhas) {
  const { linha, socio_texto, horas, piloto_externo, ...campos } = l;
  if (piloto_externo) campos.piloto_id = pilotos.find((p) => p.nome === piloto_externo)?.id ?? null;
  const id = fontes.get(l.fonte);
  const { error } = id ? await db.from("voos").update(campos).eq("id", id) : await db.from("voos").insert(campos);
  if (error) {
    console.error(`  ✗ linha ${linha}: ${error.message}`);
    continue;
  }
  id ? atualizados++ : inseridos++;
}
console.log(`\n  ✓ ${inseridos} voos inseridos, ${atualizados} atualizados.\n`);
