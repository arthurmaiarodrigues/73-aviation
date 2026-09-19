import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { usuarioDaSessao } from "@/lib/perfil";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { ROTULO_MOVIMENTO, movimentosDoTanque, tanquePorSocio } from "@/lib/dados/tanque";
import { DATA_BR, DECIMAL_1, MOEDA, adicionarTotal, cabecalhosXlsx, dataExcel, formatarCabecalho, nomeArquivo } from "@/lib/dados/exportacao";
import { veValores } from "@/lib/tipos";

export const runtime = "nodejs";

/** Excel do tanque: movimentos com saldo e uso por sócio e mês. */
export async function GET() {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !veValores(usuario.perfil)) return NextResponse.json({ erro: "Sem acesso." }, { status: 401 });

  const aeronave = await aeronaveAtiva();
  const [movimentos, porSocio] = await Promise.all([movimentosDoTanque(aeronave.id, 5000), tanquePorSocio(aeronave.id)]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "73 Aviation";

  const ws = wb.addWorksheet("TANQUE");
  const colunas = [
    { header: "DATA", key: "data", width: 12, style: { numFmt: DATA_BR } },
    { header: "MOVIMENTO", key: "tipo", width: 26 },
    { header: "QUEM", key: "quem", width: 16 },
    { header: "LITROS", key: "litros", width: 10, style: { numFmt: DECIMAL_1 } },
    { header: "R$/L", key: "preco", width: 10, style: { numFmt: MOEDA } },
    { header: "VALOR", key: "valor", width: 14, style: { numFmt: MOEDA } },
    { header: "SALDO (L)", key: "saldo", width: 11, style: { numFmt: DECIMAL_1 } },
    { header: "FORNECEDOR", key: "fornecedor", width: 22 },
    { header: "OBSERVAÇÃO", key: "obs", width: 40 },
  ];
  ws.columns = colunas;
  formatarCabecalho(ws, colunas.length);
  for (const m of [...movimentos].reverse()) {
    ws.addRow({
      data: dataExcel(m.data),
      tipo: ROTULO_MOVIMENTO[m.tipo].toUpperCase(),
      quem: m.tipo === "COMPRA" ? (m.socio ? `${m.socio} PAGOU` : "CAIXA") : m.tipo === "RETIRADA" ? (m.socio ?? "SOCIEDADE") : "",
      litros: m.tipo === "RETIRADA" ? -m.litros : m.litros,
      preco: m.tipo === "COMPRA" ? m.preco_litro : null,
      valor: m.tipo === "COMPRA" ? m.valor : null,
      saldo: m.saldo_litros,
      fornecedor: m.fornecedor ?? "",
      obs: m.observacao ?? "",
    });
  }
  adicionarTotal(ws, ["SALDO", null, null, movimentos[0]?.saldo_litros ?? 0]);

  const ws2 = wb.addWorksheet("USO POR SÓCIO");
  const colunas2 = [
    { header: "MÊS", key: "mes", width: 12, style: { numFmt: "mm/yyyy" } },
    { header: "SÓCIO", key: "socio", width: 16 },
    { header: "LITROS", key: "litros", width: 10, style: { numFmt: DECIMAL_1 } },
    { header: "VALOR", key: "valor", width: 14, style: { numFmt: MOEDA } },
  ];
  ws2.columns = colunas2;
  formatarCabecalho(ws2, colunas2.length);
  for (const l of [...porSocio].sort((a, b) => a.mes.localeCompare(b.mes) || a.apelido.localeCompare(b.apelido))) {
    ws2.addRow({ mes: dataExcel(l.mes), socio: l.apelido, litros: l.litros, valor: l.valor });
  }
  adicionarTotal(ws2, ["TOTAL", null, porSocio.reduce((s, l) => s + l.litros, 0), porSocio.reduce((s, l) => s + l.valor, 0)]);

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, { headers: cabecalhosXlsx(nomeArquivo("TANQUE PP-ZNM")) });
}
