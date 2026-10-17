import fs from "node:fs";
const rep = (p, a, b) => { const s = fs.readFileSync(p, "utf8"); if (!s.includes(a)) { console.error("NAO ACHEI em", p, "::", a.slice(0, 80)); process.exit(1); } fs.writeFileSync(p, s.replace(a, b)); };

// helper único em lib/formato
fs.appendFileSync("lib/formato.ts", `
/** Tempo da decolagem ao pouso em décimos de hora ("09:15"→"13:06" = 3,9). Pouso "antes" = virou o dia. */
export function tempoDeVoo(decolagem: string | null, pouso: string | null): number | null {
  if (!decolagem || !pouso) return null;
  const hhmm = /^\d{2}:\d{2}/;
  if (!hhmm.test(decolagem) || !hhmm.test(pouso)) return null;
  const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  let diferenca = min(pouso) - min(decolagem);
  if (diferenca < 0) diferenca += 24 * 60;
  return Math.round((diferenca / 60) * 10) / 10;
}
`);

// formulário novo voo: usa o helper compartilhado
rep("app/(app)/voos/novo/formulario-voo.tsx",
`/** Tempo da decolagem ao pouso em décimos; pouso "antes" = virou o dia. */
function tempoDeVoo(decolagem: string, pouso: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(decolagem) || !/^\d{2}:\d{2}$/.test(pouso)) return null;
  const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  let diferenca = min(pouso) - min(decolagem);
  if (diferenca < 0) diferenca += 24 * 60;
  return Math.round((diferenca / 60) * 10) / 10;
}

`, "");

// ações: idem
rep("app/(app)/voos/acoes.ts",
`/** Tempo da decolagem ao pouso, em décimos de hora (vira o dia se o pouso for "antes"). */
function tempoDeVoo(decolagem: string | null, pouso: string | null): number | null {
  if (!decolagem || !pouso) return null;
  const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  let diferenca = min(pouso) - min(decolagem);
  if (diferenca < 0) diferenca += 24 * 60;
  return Math.round((diferenca / 60) * 10) / 10;
}

`, "");
console.log("ok");
