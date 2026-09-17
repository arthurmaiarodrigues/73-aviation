import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Cores semânticas do MARCA.md. Erro nunca usa o vermelho da marca. */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold [&_svg]:size-3",
  {
    variants: {
      variant: {
        ok: "bg-ok/10 text-ok",
        atencao: "bg-atencao/10 text-atencao",
        erro: "bg-erro/10 text-erro",
        info: "bg-info/10 text-info",
        classificar: "bg-laranja-100 text-laranja",
        neutro: "bg-areia-200 text-marinho-300 dark:bg-marinho-700",
      },
    },
    defaultVariants: { variant: "neutro" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
