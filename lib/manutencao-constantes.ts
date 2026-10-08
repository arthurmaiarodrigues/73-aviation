/** Tipos e rótulos da manutenção — sem server-only: usados nos dois lados. */

export type Gatilho = "POR_HORAS" | "POR_TEMPO" | "AMBOS";
export type TipoCusto = "POR_USO" | "POR_TEMPO" | "IGUAL";
export type StatusManutencao = "PROGRAMADA" | "EM_OFICINA" | "CONCLUIDA";
export type Situacao = "OK" | "AVISO" | "VENCIDO" | "SEM_REGISTRO";

export const ROTULO_GATILHO: Record<Gatilho, string> = { POR_HORAS: "Por horas", POR_TEMPO: "Por tempo", AMBOS: "Horas ou tempo" };
export const ROTULO_TIPO_CUSTO: Record<TipoCusto, string> = { POR_USO: "Por uso (horas desde a última)", POR_TEMPO: "Por tempo (igual)", IGUAL: "Igual" };
export const ROTULO_STATUS: Record<StatusManutencao, string> = { PROGRAMADA: "Programada", EM_OFICINA: "Na oficina", CONCLUIDA: "Concluída" };
export const TIPOS_DOCUMENTO = ["CA / CVA", "SEGURO RETA", "IAM", "LICENÇA DE ESTAÇÃO", "APÓLICE CASCO", "OUTRO"];

// --------------------------------------------------------------- sugestões
/** Sem acento e em caixa alta, para comparar o que está escrito na nota. */
const simples = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Peça e fluido que gastam com hora voada: a conta divide pelas horas. */
const PALAVRAS_POR_USO = [
  "OLEO", "FILTRO", "VELA", "PNEU", "CAMARA DE AR", "PASTILHA", "DISCO DE FREIO", "FREIO", "FLUIDO",
  "GRAXA", "LUBRIF", "ARRUELA", "PARAFUSO", "PORCA", "CONTRAPINO", "ANEL", "JUNTA", "RETENTOR",
  "ORING", "O-RING", "VEDACAO", "MANGUEIRA", "CORREIA", "ESCOVA", "CILINDRO", "COMPRESSAO",
  "MAGNETO", "ALTERNADOR", "MOTOR DE PARTIDA", "HELICE", "ADITIVO", "ABRACADEIRA", "TERMINAL",
];

/** O que vale por tempo (ou é da aeronave, não de quem voou): divide igual. */
const PALAVRAS_POR_TEMPO = [
  "AFERIC", "CERTIFIC", "HOMOLOG", "IFR", "ANUAL", "IAM", "VISTORIA", "INSPECAO ANUAL",
  "ELT", "TRANSPONDER", "ALTIMETRO", "PITOT", "ESTATIC", "EXTINTOR", "PRIMEIROS SOCORROS",
  "BATERIA", "BANCO DE DADOS", "CORROSAO", "LAVAGEM", "POLIMENTO", "SEGURO", "DOCUMENT", "ASSINATURA",
];

/**
 * Chuta como o item da nota divide, pelo que está escrito nele. É só uma
 * sugestão: quem lança confere linha a linha antes de gravar.
 */
export function sugerirTipoCusto(descricao: string): TipoCusto {
  const d = simples(descricao);
  if (PALAVRAS_POR_TEMPO.some((p) => d.includes(p))) return "POR_TEMPO";
  if (PALAVRAS_POR_USO.some((p) => d.includes(p))) return "POR_USO";
  return "IGUAL";
}

const IRRELEVANTES = new Set(["DE", "DO", "DA", "E", "COM", "PARA", "EM", "UN", "LT", "KG", "PCS", "AERONAVE", "AVIAO", "SERVICO", "TOTAL"]);

/**
 * Liga o item da nota a um item do plano quando as palavras batem
 * ("FILTRO DE OLEO LYCOMING" → "TROCA DE ÓLEO E FILTRO"). Sem palpite
 * fraco: exige pelo menos duas palavras em comum, ou uma bem específica.
 */
export function sugerirItemDoPlano<T extends { id: string; descricao: string }>(descricao: string, plano: T[]): string {
  // "PASTILHAS" e "PASTILHA" são a mesma coisa para a comparação.
  const raiz = (p: string) => (p.endsWith("S") && p.length > 4 ? p.slice(0, -1) : p);
  const palavras = (t: string) => simples(t).split(/[^A-Z0-9]+/).filter((p) => p.length >= 3 && !IRRELEVANTES.has(p)).map(raiz);
  const doItem = new Set(palavras(descricao));
  if (doItem.size === 0) return "";
  let melhor = ""; let pontos = 0;
  for (const p of plano) {
    const doPlano = palavras(p.descricao);
    const comuns = doPlano.filter((w) => doItem.has(w));
    // "VELAS MASSA (8 UN)" → "VELAS": o item do plano cabe inteiro na linha.
    const inteiro = doPlano.length > 0 && comuns.length === doPlano.length;
    const forte = inteiro || comuns.some((w) => w.length >= 6);
    const nota = comuns.length + (forte ? 1 : 0);
    if (comuns.length >= 2 || forte) {
      if (nota > pontos) { pontos = nota; melhor = p.id; }
    }
  }
  return melhor;
}
