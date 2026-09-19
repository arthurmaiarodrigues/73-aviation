import type { Perfil } from "@/lib/tipos";

export type ItemMenu = { rotulo: string; href: string; icone: string; emBreve?: boolean };

const SOCIO: ItemMenu[] = [
  { rotulo: "Início", href: "/inicio", icone: "inicio" },
  { rotulo: "Registrar voo", href: "/voos/novo", icone: "camera" },
  { rotulo: "Voos", href: "/voos", icone: "voos" },
  { rotulo: "Combustível", href: "/combustivel", icone: "combustivel" },
  { rotulo: "Despesas", href: "/despesas", icone: "despesas" },
  { rotulo: "Aportes", href: "/aportes", icone: "aportes" },
  { rotulo: "Extratos", href: "/extratos", icone: "extratos" },
  { rotulo: "Fechamento", href: "/fechamento", icone: "fechamento" },
  { rotulo: "Conciliação", href: "/conciliacao", icone: "banco" },
  { rotulo: "Agenda", href: "/agenda", icone: "agenda" },
  { rotulo: "Manutenção", href: "/manutencao", icone: "manutencao" },
  { rotulo: "Cadastros", href: "/cadastros", icone: "cadastros" },
];

// Piloto contratado: só o que precisa para lançar o voo (sem valores, sem agenda).
const PILOTO: ItemMenu[] = [
  { rotulo: "Início", href: "/inicio", icone: "inicio" },
  { rotulo: "Registrar voo", href: "/voos/novo", icone: "camera" },
  { rotulo: "Voos", href: "/voos", icone: "voos" },
];

export function menuDoPerfil(perfil: Perfil): ItemMenu[] {
  return perfil === "piloto" ? PILOTO : SOCIO;
}
