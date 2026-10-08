import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { usuarioDaSessao } from "@/lib/perfil";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { listarContas } from "@/lib/dados/contas";
import { DATA_BR, MOEDA, adicionarTotal, formatarCabecalho, nomeArquivo } from "@/lib/dados/exportacao";
import { veValores } from "@/lib/tipos";

export const runtime = "nodejs";

const SITUACAO: Record<string, string> = { PAGA: "PAGA", VENCIDA: "VENCIDA", VENCE_EM_BREVE: "VENCE EM BREVE", ABERTA: "EM ABERTO" };

/** As contas a pagar com o vencimento, a nota ligada e o pagamento. */
export async function GET() {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo || !veValores(usuario.perfil)) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });

  const aeronave = await aeronaveAtiva();
  const contas = await listarContas(aeronave.id);

  const wb = new ExcelJS.Workbook();
  wb.creator = "73 Aviation";
  const ws = wb.addWorksheet("CONTAS A PAGAR");

  const colunas = [
    { header: "VENCIMENTO", key: "vencimento", width: 14, style: { numFmt: DATA_BR } },
    { header: "CONTA", key: "descricao", width: 40 },
    { header: "FORNECEDOR", key: "fornecedor", width: 24 },
    { header: "CATEGORIA", key: "categoria", width: 24 },
    { header: "DOCUMENTO", key: "documento", width: 18 },
    { header: "VALOR", key: "valor", width: 14, style: { numFmt: MOEDA } },
    { header: "SITUAÇÃO", key: "situacao", width: 16 },
    { header: "PAGA EM", key: "pago_em", width: 14, style: { numFmt: DATA_BR } },
    { header: "QUEM PAGOU", key: "pagador", width: 14 },
    { header: "NOTA LANÇADA", key: "nota", width: 40 },
    { header: "OBSERVAÇÃO", key: "observacao", width: 30 },
  ];
  ws.columns = colunas;
  formatarCabecalho(ws, colunas.length);

  for (const c of contas) {
    ws.addRow({
      vencimento: new Date(`${c.vencimento}T12:00:00`),
      descricao: c.descricao,
      fornecedor: c.fornecedor ?? "",
      categoria: c.categoria ?? "",
      documento: c.documento ?? "",
      valor: c.valor,
      situacao: SITUACAO[c.situacao] ?? c.situacao,
      pago_em: c.pago_em ? new Date(`${c.pago_em}T12:00:00`) : null,
      pagador: c.pago_em ? (c.pagador ?? "CAIXA") : "",
      nota: c.nota_descricao ?? "",
      observacao: c.observacao ?? "",
    });
  }
  adicionarTotal(ws, ["TOTAL", null, null, null, null, contas.reduce((s, c) => s + c.valor, 0)]);

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo("CONTAS A PAGAR")}"`,
    },
  });
}
