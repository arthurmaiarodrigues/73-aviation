import Link from "next/link";
import { Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type OpcaoFiltro = { valor: string; rotulo: string };

export type CampoFiltro =
  | { nome: string; rotulo: string; tipo: "select"; opcoes: OpcaoFiltro[]; valor?: string }
  | { nome: string; rotulo: string; tipo: "date" | "text"; valor?: string };

/** Barra de filtros GET: a URL é o estado — dá para mandar o link por WhatsApp. */
export function Filtros({ campos, hrefExportar, hrefLimpar }: { campos: CampoFiltro[]; hrefExportar: string; hrefLimpar: string }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-marinho-100 bg-areia-200 p-4 dark:border-marinho-300 dark:bg-marinho-700">
      {campos.map((c) => (
        <div key={c.nome} className="min-w-36 flex-1 space-y-1">
          <Label htmlFor={`f-${c.nome}`} className="text-xs">
            {c.rotulo}
          </Label>
          {c.tipo === "select" ? (
            <Select id={`f-${c.nome}`} name={c.nome} defaultValue={c.valor ?? ""}>
              <option value="">Todos</option>
              {c.opcoes.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </Select>
          ) : (
            <Input id={`f-${c.nome}`} name={c.nome} type={c.tipo} defaultValue={c.valor ?? ""} />
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="submit" variant="secundario">
          <Search /> Filtrar
        </Button>
        <Button asChild variant="fantasma">
          <Link href={hrefLimpar}>Limpar</Link>
        </Button>
        <Button asChild variant="secundario">
          <a href={hrefExportar}>
            <Download /> Excel
          </a>
        </Button>
      </div>
    </form>
  );
}
