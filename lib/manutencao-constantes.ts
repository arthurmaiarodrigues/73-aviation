/** Tipos e rótulos da manutenção — sem server-only: usados nos dois lados. */

export type Gatilho = "POR_HORAS" | "POR_TEMPO" | "AMBOS";
export type TipoCusto = "POR_USO" | "POR_TEMPO" | "IGUAL";
export type StatusManutencao = "PROGRAMADA" | "EM_OFICINA" | "CONCLUIDA";
export type Situacao = "OK" | "AVISO" | "VENCIDO" | "SEM_REGISTRO";

export const ROTULO_GATILHO: Record<Gatilho, string> = { POR_HORAS: "Por horas", POR_TEMPO: "Por tempo", AMBOS: "Horas ou tempo" };
export const ROTULO_TIPO_CUSTO: Record<TipoCusto, string> = { POR_USO: "Por uso (horas desde a última)", POR_TEMPO: "Por tempo (igual)", IGUAL: "Igual" };
export const ROTULO_STATUS: Record<StatusManutencao, string> = { PROGRAMADA: "Programada", EM_OFICINA: "Na oficina", CONCLUIDA: "Concluída" };
export const TIPOS_DOCUMENTO = ["CA / CVA", "SEGURO RETA", "IAM", "LICENÇA DE ESTAÇÃO", "APÓLICE CASCO", "OUTRO"];
