import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tabela do MARCA.md: cabeçalho areia-200, linhas marinho-100, hover areia-200,
 * coluna de valor à direita e tabular. Rola na horizontal dentro do próprio
 * contêiner — a página nunca rola de lado.
 */
export function Tabela({
  className,
  fixa,
  ...props
}: React.ComponentProps<"table"> & { fixa?: boolean }) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-marinho-100 dark:border-marinho-300">
      {/* `fixa` faz o navegador respeitar as larguras declaradas nos <th> em
          vez de esticar a coluna com o texto mais longo. Sem isso, um nome de
          fornecedor grande engole a coluna de descrição. */}
      <table
        className={cn("w-full border-collapse text-sm", fixa && "table-fixed", className)}
        {...props}
      />
    </div>
  );
}

export function TabelaCabecalho({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn("bg-areia-200 dark:bg-marinho-700", className)}
      {...props}
    />
  );
}

export function TabelaCorpo(props: React.ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

export function TabelaRodape({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      className={cn(
        "border-t-2 border-marinho-100 bg-areia-200 font-semibold dark:border-marinho-300 dark:bg-marinho-700",
        className,
      )}
      {...props}
    />
  );
}

export function TabelaLinha({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-marinho-100 last:border-0 hover:bg-areia-200 dark:border-marinho-300 dark:hover:bg-marinho-700",
        className,
      )}
      {...props}
    />
  );
}

export function Cabecalho({
  className,
  numerico,
  ...props
}: React.ComponentProps<"th"> & { numerico?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-marinho-300",
        numerico && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function Celula({
  className,
  numerico,
  ...props
}: React.ComponentProps<"td"> & { numerico?: boolean }) {
  return (
    <td
      className={cn("px-3 py-2.5", numerico && "text-right tabular whitespace-nowrap", className)}
      {...props}
    />
  );
}
