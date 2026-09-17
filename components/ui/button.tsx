import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // MARCA.md: primário laranja, hover laranja-700; texto areia >= 14px bold.
        primario: "bg-laranja text-marinho hover:bg-laranja-700 hover:text-areia",
        secundario:
          "border border-marinho-100 bg-transparent text-marinho hover:bg-areia-200 dark:text-areia dark:border-marinho-300 dark:hover:bg-marinho-700",
        destrutivo: "bg-erro text-areia hover:bg-erro/90",
        fantasma:
          "text-marinho hover:bg-areia-200 dark:text-areia dark:hover:bg-marinho-700",
        link: "text-laranja underline-offset-4 hover:underline",
      },
      size: {
        // 48px mínimo no celular (MARCA.md); h-10 no notebook.
        padrao: "h-10 px-4 text-sm",
        campo: "h-12 px-5 text-base w-full",
        pequeno: "h-8 px-3 text-xs",
        icone: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primario", size: "padrao" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
