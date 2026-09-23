import { horasPorSocio, horasPorSocioNoMes } from "@/lib/dados/voos";
import { ciclosRevisao, listarPlano } from "@/lib/dados/manutencao";
import { data as fmtData, hoje, mesPorExtenso, trimestreDe } from "@/lib/formato";
import { HorasPorSocio, type AbaHoras } from "@/components/horas-por-socio";

type Socio = { id: string; apelido: string; cor: string };

/**
 * Abas de horas por sócio (mês, trimestre e o ciclo de cada revisão). Fica
 * num componente à parte porque são várias contas no banco: o Início mostra
 * o resto na hora e estas abas entram logo em seguida.
 */
export async function AbasHoras({
  aeronaveId,
  socios,
  mes,
  valores,
  meuSocioId,
}: {
  aeronaveId: string;
  socios: Socio[];
  mes: string;
  /** piloto não vê custo */
  valores: boolean;
  meuSocioId: string | null;
}) {
  const trimestre = trimestreDe(hoje());
  const [horasMes, plano, ciclos] = await Promise.all([
    horasPorSocioNoMes(aeronaveId, mes),
    listarPlano(aeronaveId),
    ciclosRevisao(aeronaveId),
  ]);
  const revisoes = plano.filter((p) => /^REVIS[ÃA]O \d+ ?H$/.test(p.descricao)).sort((a, b) => (a.intervalo_horas ?? 0) - (b.intervalo_horas ?? 0));
  const anteriores = revisoes.map((r) => ciclos.find((c) => c.plano_item_id === r.id)?.anterior ?? null);
  const [horasTrimestre, ...resto] = await Promise.all([
    horasPorSocio(aeronaveId, trimestre.inicio, trimestre.fim),
    ...revisoes.map((r) => horasPorSocio(aeronaveId, r.ultima_data ?? "2000-01-01", "2099-12-31")),
    ...anteriores.map((c) => (c ? horasPorSocio(aeronaveId, c.inicio, c.fim) : Promise.resolve([]))),
  ]);
  const horasRevisoes = resto.slice(0, revisoes.length);
  const horasAnteriores = resto.slice(revisoes.length);

  const linhas = (h: { socio_id: string; horas: number; custo?: number }[], comCusto: boolean) =>
    socios.map((s) => {
      const x = h.find((l) => l.socio_id === s.id);
      return { socio_id: s.id, apelido: s.apelido, cor: s.cor, horas: x?.horas ?? 0, custo: comCusto && valores ? (x?.custo ?? 0) : null };
    });

  const abas: AbaHoras[] = [
    { chave: "mes", rotulo: "Mês", subtitulo: mesPorExtenso(mes), meta: null, linhas: linhas(horasMes, true) },
    { chave: "trimestre", rotulo: "Trimestre", subtitulo: trimestre.rotulo, meta: null, linhas: linhas(horasTrimestre, false) },
    ...revisoes.map((r, i) => ({
      chave: r.id,
      rotulo: r.descricao.replace("REVISÃO", "Revisão").replace(/(\d+) ?H$/, "$1 h"),
      subtitulo: r.ultima_data ? `desde a última revisão, em ${fmtData(r.ultima_data)}` : "desde o início (última execução não informada no plano)",
      meta: r.intervalo_horas,
      linhas: linhas(horasRevisoes[i], false),
      anterior: anteriores[i]
        ? {
            subtitulo: `Última revisão: voos de ${fmtData(anteriores[i]!.inicio)} a ${fmtData(anteriores[i]!.fim)} — é essa divisão que a nota da oficina usa nos itens por uso`,
            linhas: linhas(horasAnteriores[i], false),
          }
        : null,
    })),
  ];

  return <HorasPorSocio abas={abas} meuSocioId={meuSocioId} />;
}

/** Espaço reservado enquanto as contas rodam — a tela não “pula”. */
export function AbasHorasVazio() {
  return (
    <div className="h-48 animate-pulse rounded-lg border border-marinho-100 bg-areia-200/60 dark:border-marinho-300 dark:bg-marinho-700/40" />
  );
}
