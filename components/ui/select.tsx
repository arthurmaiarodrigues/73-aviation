import * as React from "react";
import { cn } from "@/lib/utils";

const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded border border-marinho-100 bg-areia-200 px-3 py-2 text-sm text-marinho",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "dark:border-marinho-300 dark:bg-marinho-700 dark:text-areia",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-20 w-full rounded border border-marinho-100 bg-areia-200 px-3 py-2 text-sm text-marinho",
        "placeholder:text-marinho-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laranja focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "dark:border-marinho-300 dark:bg-marinho-700 dark:text-areia",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Select, Textarea };
