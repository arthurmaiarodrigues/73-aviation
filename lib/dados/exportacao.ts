import ExcelJS from "exceljs";

export const MOEDA = "R$ #,##0.00;[Red]-R$ #,##0.00";
export const DATA_BR = "dd/mm/yyyy";
export const DECIMAL_1 = "#,##0.0";

/** Cabeçalho no padrão da marca: areia sobre marinho, negrito, congelado. */
export function formatarCabecalho(ws: ExcelJS.Worksheet, colunas: number) {
  const linha = ws.getRow(1);
  linha.font = { bold: true, color: { argb: "FFF3EFE8" } };
  linha.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E2846" } };
  linha.alignment = { vertical: "middle" };
  linha.height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas } };
}

export function adicionarTotal(ws: ExcelJS.Worksheet, valores: (string | number | null)[]) {
  const linha = ws.addRow(valores);
  linha.font = { bold: true };
  linha.eachCell((celula) => {
    celula.border = { top: { style: "thin", color: { argb: "FF6C7A8C" } } };
  });
  return linha;
}

/** Nome de arquivo no padrão AAAA-MM-DD - ASSUNTO.xlsx */
export function nomeArquivo(assunto: string): string {
  return `${new Date().toISOString().slice(0, 10)} - ${assunto}.xlsx`;
}

export function cabecalhosXlsx(nome: string): Record<string, string> {
  return {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
    "Cache-Control": "no-store",
  };
}

export const dataExcel = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`) : null);
