import type { Perfil } from "@/lib/tipos";

export type ItemMenu = { rotulo: string; href: string; icone: string; emBreve?: boolean };

const SOCIO: ItemMenu[] = [
  { rotulo: "Início", href: "/inicio", icone: "inicio" },
  { rotulo: "Registrar voo", href: "/voos/novo", icone: "camera" },
  { rotulo: "Voos", href: "/voos", icone: "voos" },
  { rotulo: "Combustível", href: "/combustivel", icone: "combustivel" },
  { rotulo: "Despesas", href: "/despesas", icone: "despesas" },
  { rotulo: "Reembolsos", href: "/reembolsos", icone: "despesas" },
  { rotulo: "Aportes", href: "/aportes", icone: "aportes" },
  { rotulo: "Extratos", href: "/extratos", icone: "extratos" },
  { rotulo: "Fechamento", href: "/fechamento", icone: "fechamento" },
  { rotulo: "Conciliação", href: "/conciliacao", icone: "banco" },
  { rotulo: "Agenda", href: "/agenda", icone: "agenda" },
  { rotulo: "Manutenção", href: "/manutencao", icone: "manutencao" },
  { rotulo: "Cadastros", href: "/cadastros", icone: "cadastros" },
  { rotulo: "Instalar o app", href: "/instalar", icone: "instalar" },
];

// Piloto contratado: opera sem ver valores — voo, abastecimento pelo tanque,
// agenda (só leitura) e dados da manutenção.
const PILOTO: ItemMenu[] = [
  { rotulo: "Início", href: "/inicio", icone: "inicio" },
  { rotulo: "Registrar voo", href: "/voos/novo", icone: "camera" },
  { rotulo: "Voos", href: "/voos", icone: "voos" },
  { rotulo: "Combustível", href: "/combustivel", icone: "combustivel" },
  { rotulo: "Reembolsos", href: "/reembolsos", icone: "despesas" },
  { rotulo: "Agenda", href: "/agenda", icone: "agenda" },
  { rotulo: "Manutenção", href: "/manutencao", icone: "manutencao" },
  { rotulo: "Instalar o app", href: "/instalar", icone: "instalar" },
];

export function menuDoPerfil(perfil: Perfil): ItemMenu[] {
  return perfil === "piloto" ? PILOTO : SOCIO;
}
