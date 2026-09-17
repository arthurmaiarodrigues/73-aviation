/** Perfis do CLAUDE.md — espelham o enum perfil_usuario do banco. */
export type Perfil = "admin" | "socio" | "piloto";

export const ROTULO_PERFIL: Record<Perfil, string> = {
  admin: "Administrador",
  socio: "Sócio",
  piloto: "Piloto",
};

/** Quem enxerga valores: sócio e admin. Piloto de fora, nunca. */
export function veValores(perfil: Perfil | null | undefined): boolean {
  return perfil === "admin" || perfil === "socio";
}

export type NaturezaVoo = "PARTICULAR" | "SOCIEDADE" | "TRANSLADO_MANUTENCAO" | "VOO_TESTE" | "INSTRUCAO";

export const ROTULO_NATUREZA: Record<NaturezaVoo, string> = {
  PARTICULAR: "Particular",
  SOCIEDADE: "Uso comum",
  TRANSLADO_MANUTENCAO: "Translado p/ manutenção",
  VOO_TESTE: "Voo de teste",
  INSTRUCAO: "Instrução",
};

export const NATUREZAS: NaturezaVoo[] = ["PARTICULAR", "SOCIEDADE", "TRANSLADO_MANUTENCAO", "VOO_TESTE", "INSTRUCAO"];

/** Naturezas em que o voo é da sociedade e as horas se dividem entre todos. */
export const NATUREZAS_COMUNS: NaturezaVoo[] = ["SOCIEDADE", "TRANSLADO_MANUTENCAO", "VOO_TESTE"];

export function ehUsoComum(natureza: NaturezaVoo): boolean {
  return NATUREZAS_COMUNS.includes(natureza);
}

export type CriterioRateio = "IGUAL" | "POR_HORAS" | "DIRETO" | "MANUAL";

export const ROTULO_CRITERIO: Record<CriterioRateio, string> = {
  IGUAL: "Igual (pela cota)",
  POR_HORAS: "Por horas voadas",
  DIRETO: "Direto a um sócio",
  MANUAL: "Manual (%)",
};

export const CRITERIOS: CriterioRateio[] = ["IGUAL", "POR_HORAS", "DIRETO", "MANUAL"];

export type StatusDespesa = "PENDENTE" | "APROVADA" | "RATEADA";

export type Socio = {
  id: string;
  nome: string;
  apelido: string;
  cota: number;
  cor: string;
  ativo_desde: string;
  ativo_ate: string | null;
  usuario_id: string | null;
};

export type Aeronave = {
  id: string;
  matricula: string;
  modelo: string;
  base_icao: string | null;
  capacidade_combustivel_l: number | null;
  consumo_medio_lh: number | null;
  tbo_motor_horas: number | null;
  fundo_reserva_por_hora: number;
};

export type Categoria = { id: number; nome: string; ordem: number };

export type Fornecedor = { id: string; nome: string; cpf_cnpj: string | null; tipo: "PJ" | "PF"; cidade: string | null };
