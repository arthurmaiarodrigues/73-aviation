import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { usuarioDaSessao } from "@/lib/perfil";
import { aeronaveAtiva, listarSocios } from "@/lib/dados/cadastros";
import { listarDespesas } from "@/lib/dados/financeiro";
import { DATA_BR, MOEDA, adicionarTotal, cabecalhosXlsx, dataExcel, formatarCabecalho, nomeArquivo } from "@/lib/dados/exportacao";
import { ROTULO_CRITERIO, veValores } from "@/lib/tipos";

export const runtime = "nodejs";

/** Uma coluna por sócio com a parte de cada um — o formato que os sócios já conhecem. */
export async function GET(request: Request) {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !veValores(usuario.perfil)) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });

  const url = new URL(request.url);
  const p = (k: string) => url.searchParams.get(k) || undefined;
  const aeronave = await aeronaveAtiva();
  const [despesas, socios] = await Promise.all([
    listarDespesas(aeronave.id, { de: p("de"), ate: p("ate"), categoria: p("categoria"), socio: p("socio"), criterio: p("criterio"), status: p("status") }, 5000),
    listarSocios(),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "73 Aviation";
  const ws = wb.addWorksheet("DESPESAS");

  const colunas = [
    { header: "DATA", key: "data", width: 12, style: { numFmt: DATA_BR } },
    { header: "DESCRIÇÃO", key: "descricao", width: 40 },
    { header: "CATEGORIA", key: "categoria", width: 26 },
    { header: "FORNECEDOR", key: "fornecedor", width: 24 },
    { header: "PAGOU", key: "pagador", width: 14 },
    { header: "RATEIO", key: "criterio", width: 20 },
    { header: "VALOR", key: "valor", width: 14, style: { numFmt: MOEDA } },
    ...socios.map((s) => ({ header: s.apelido, key: `s_${s.id}`, width: 14, style: { numFmt: MOEDA } })),
    { header: "SITUAÇÃO", key: "status", width: 12 },
    { header: "OBSERVAÇÃO", key: "obs", width: 30 },
  ];
  ws.columns = colunas;
  formatarCabecalho(ws, colunas.length);

  for (const d of [...despesas].reverse()) {
    const linha: Record<string, unknown> = {
      data: dataExcel(d.data),
      descricao: d.descricao,
      categoria: d.categoria,
      fornecedor: d.fornecedor ?? "",
      pagador: d.pagador,
      criterio: ROTULO_CRITERIO[d.criterio].toUpperCase() + (d.socio_direto ? ` → ${d.socio_direto}` : ""),
      valor: d.valor,
      status: d.status,
      obs: d.observacao ?? "",
    };
    for (const r of d.rateios) linha[`s_${r.socio_id}`] = r.valor;
    ws.addRow(linha);
  }

  const totais: (string | number | null)[] = ["TOTAL", null, null, null, null, null, despesas.reduce((s, d) => s + d.valor, 0)];
  for (const s of socios) totais.push(despesas.reduce((acc, d) => acc + (d.rateios.find((r) => r.socio_id === s.id)?.valor ?? 0), 0));
  adicionarTotal(ws, totais);

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, { headers: cabecalhosXlsx(nomeArquivo("DESPESAS PP-ZNM")) });
}
