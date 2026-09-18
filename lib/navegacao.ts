import type { Perfil } from "@/lib/tipos";

export type ItemMenu = { rotulo: string; href: string; icone: string; emBreve?: boolean };

const SOCIO: ItemMenu[] = [
  { rotulo: "Início", href: "/inicio", icone: "inicio" },
  { rotulo: "Registrar voo", href: "/voos/novo", icone: "camera" },
  { rotulo: "Voos", href: "/voos", icone: "voos" },
  { rotulo: "Abastecer", href: "/abastecimentos/novo", icone: "combustivel" },
  { rotulo: "Despesas", href: "/despesas", icone: "despesas" },
  { rotulo: "Aportes", href: "/aportes", icone: "aportes" },
  { rotulo: "Extratos", href: "/extratos", icone: "extratos" },
  { rotulo: "Agenda", href: "/agenda", icone: "agenda" },
  { rotulo: "Manutenção", href: "/manutencao", icone: "manutencao" },
  { rotulo: "Cadastros", href: "/cadastros", icone: "cadastros" },
];

const PILOTO: ItemMenu[] = [
  { rotulo: "Início", href: "/inicio", icone: "inicio" },
  { rotulo: "Registrar voo", href: "/voos/novo", icone: "camera" },
  { rotulo: "Voos", href: "/voos", icone: "voos" },
  { rotulo: "Agenda", href: "/agenda", icone: "agenda" },
];

export function menuDoPerfil(perfil: Perfil): ItemMenu[] {
  return perfil === "piloto" ? PILOTO : SOCIO;
}
