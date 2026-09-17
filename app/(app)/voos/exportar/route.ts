import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { usuarioDaSessao } from "@/lib/perfil";
import { aeronaveAtiva } from "@/lib/dados/cadastros";
import { listarVoos } from "@/lib/dados/voos";
import { DATA_BR, DECIMAL_1, adicionarTotal, cabecalhosXlsx, dataExcel, formatarCabecalho, nomeArquivo } from "@/lib/dados/exportacao";
import { ROTULO_NATUREZA } from "@/lib/tipos";

export const runtime = "nodejs";

/**
 * Excel no layout da aba HORIMETRO da planilha (DATA, SÓCIO, ORIGEM, DESTINO,
 * horímetro inicial/final/saldo, combustível inicial/final/saldo), com as
 * colunas novas no fim.
 */
export async function GET(request: Request) {
  const { user, usuario } = await usuarioDaSessao();
  if (!user || !usuario?.ativo) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  const url = new URL(request.url);
  const p = (k: string) => url.searchParams.get(k) || undefined;
  const aeronave = await aeronaveAtiva();
  const voos = await listarVoos(
    aeronave.id,
    { socio: p("socio"), de: p("de"), ate: p("ate"), natureza: p("natureza"), aerodromo: p("aerodromo")?.toUpperCase(), pendentes: p("pendentes") === "1" },
    5000,
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = "73 Aviation";
  const ws = wb.addWorksheet("HORIMETRO");

  const colunas = [
    { header: "DATA", key: "data", width: 12, style: { numFmt: DATA_BR } },
    { header: "SÓCIO", key: "socio", width: 16 },
    { header: "ORIGEM", key: "origem", width: 9 },
    { header: "DESTINO", key: "destino", width: 9 },
    { header: "HORÍMETRO INICIAL", key: "hi", width: 18, style: { numFmt: DECIMAL_1 } },
    { header: "HORÍMETRO FINAL", key: "hf", width: 17, style: { numFmt: DECIMAL_1 } },
    { header: "HORAS", key: "horas", width: 9, style: { numFmt: DECIMAL_1 } },
    { header: "COMBUSTÍVEL INICIAL (L)", key: "ci", width: 22, style: { numFmt: DECIMAL_1 } },
    { header: "COMBUSTÍVEL FINAL (L)", key: "cf", width: 21, style: { numFmt: DECIMAL_1 } },
    { header: "SALDO (L)", key: "cs", width: 11, style: { numFmt: DECIMAL_1 } },
    { header: "POUSOS", key: "pousos", width: 9 },
    { header: "NATUREZA", key: "natureza", width: 22 },
    { header: "PILOTO", key: "piloto", width: 18 },
    { header: "SITUAÇÃO", key: "situacao", width: 18 },
    { header: "OBSERVAÇÃO", key: "obs", width: 40 },
  ];
  ws.columns = colunas;
  formatarCabecalho(ws, colunas.length);

  for (const v of [...voos].reverse()) {
    ws.addRow({
      data: dataExcel(v.data),
      socio: v.socio ?? "SOCIEDADE",
      origem: v.origem ?? "",
      destino: v.destino ?? "",
      hi: v.horimetro_inicial,
      hf: v.horimetro_final,
      horas: v.horas,
      ci: v.combustivel_inicial_l,
      cf: v.combustivel_final_l,
      cs: v.combustivel_inicial_l !== null && v.combustivel_final_l !== null ? v.combustivel_final_l - v.combustivel_inicial_l : null,
      pousos: v.pousos,
      natureza: ROTULO_NATUREZA[v.natureza].toUpperCase(),
      piloto: v.piloto ?? "",
      situacao: v.horimetro_final === null && v.horimetro_inicial !== null ? "EM VOO" : v.pendente_horimetro ? "HORÍMETRO PENDENTE" : v.status,
      obs: v.observacao ?? "",
    });
  }
  adicionarTotal(ws, ["TOTAL", null, null, null, null, null, voos.reduce((s, v) => s + v.horas, 0)]);

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, { headers: cabecalhosXlsx(nomeArquivo("VOOS PP-ZNM")) });
}
