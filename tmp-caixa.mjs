import fs from "node:fs";
const rep = (p, a, b) => { const s = fs.readFileSync(p, "utf8"); if (!s.includes(a)) { console.error("NAO ACHEI em", p, "::", a.slice(0,80)); process.exit(1); } fs.writeFileSync(p, s.replace(a, b)); };

const F = "lib/dados/financeiro.ts";
rep(F, `  /** Quando mais de um sócio pagou, o que cada um colocou. */
  pagadores: { socio_id: string; apelido: string; valor: number }[];`,
`  /** Quando mais de um pagou, o que cada um colocou (socio_id nulo = caixa da sociedade). */
  pagadores: { socio_id: string | null; apelido: string; valor: number }[];`);
rep(F, `  despesa_pagadores?: { socio_id: string; valor: string; socios: { apelido: string } | null }[] | null;`,
`  despesa_pagadores?: { socio_id: string | null; valor: string; socios: { apelido: string } | null }[] | null;`);
rep(F, `      ((d.despesa_pagadores ?? []).length > 0 ? "VÁRIOS SÓCIOS" : d.pago_pelos_socios ? "CADA SÓCIO (direto)" : "CAIXA"),`,
`      ((d.despesa_pagadores ?? []).length > 0
        ? ((d.despesa_pagadores ?? []).some((p) => !p.socio_id) ? "SÓCIOS + CAIXA" : "VÁRIOS SÓCIOS")
        : d.pago_pelos_socios
          ? "CADA SÓCIO (direto)"
          : "CAIXA"),`);
rep(F, `    pagadores: (d.despesa_pagadores ?? []).map((p) => ({ socio_id: p.socio_id, apelido: p.socios?.apelido ?? "", valor: Number(p.valor) })).sort((a, b) => b.valor - a.valor),`,
`    pagadores: (d.despesa_pagadores ?? [])
      .map((p) => ({ socio_id: p.socio_id ?? null, apelido: p.socio_id ? (p.socios?.apelido ?? "") : "CAIXA", valor: Number(p.valor) }))
      .sort((a, b) => b.valor - a.valor),`);

// ação: a linha do caixa vai com socio_id "CAIXA"
const A = "app/(app)/despesas/acoes.ts";
rep(A, `  return socios
    .map((socio_id, i) => ({ socio_id, valor: lerNumero(valores[i]) ?? 0 }))
    .filter((p) => UUID.test(p.socio_id) && p.valor > 0);`,
`  return socios
    .map((socio_id, i) => ({ socio_id, valor: lerNumero(valores[i]) ?? 0 }))
    .filter((p) => (UUID.test(p.socio_id) || p.socio_id === "CAIXA") && p.valor > 0);`);

// formulário: opção do caixa em cada linha
const T = "app/(app)/despesas/formulario-despesa.tsx";
rep(T, `    despesa?.pagadores?.length ? despesa.pagadores.map((p) => ({ socio_id: p.socio_id, valor: p.valor.toFixed(2).replace(".", ",") })) : [{ socio_id: "", valor: "" }],`,
`    despesa?.pagadores?.length
      ? despesa.pagadores.map((p) => ({ socio_id: p.socio_id ?? "CAIXA", valor: p.valor.toFixed(2).replace(".", ",") }))
      : [{ socio_id: "", valor: "" }],`);
rep(T, `                <Select name="pagador_socio" value={p.socio_id} onChange={(e) => mudarPagador(i, "socio_id", e.target.value)} className="h-11">
                  <option value="">Escolha o sócio…</option>
                  {socios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.apelido}
                    </option>
                  ))}
                </Select>`,
`                <Select name="pagador_socio" value={p.socio_id} onChange={(e) => mudarPagador(i, "socio_id", e.target.value)} className="h-11">
                  <option value="">Escolha quem pagou…</option>
                  {socios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.apelido}
                    </option>
                  ))}
                  <option value="CAIXA">Caixa da sociedade</option>
                </Select>`);
rep(T, `              <p className="text-xs text-marinho-300">Cada um entra com crédito do que colocou; o rateio continua dividindo o custo pela regra escolhida ao lado.</p>`,
`              <p className="text-xs text-marinho-300">
                Cada sócio entra com crédito do que colocou e a parte do caixa sai do saldo da sociedade; o rateio continua dividindo o custo pela regra escolhida ao
                lado.
              </p>`);
rep(T, `                Cada sócio pagou a parte dele (direto ao fornecedor)`, `                Cada sócio pagou a parte dele (direto ao fornecedor)`);
console.log("ok");
