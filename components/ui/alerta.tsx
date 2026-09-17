import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Tom = "erro" | "atencao" | "ok" | "info";

const ICONE = { erro: AlertCircle, atencao: AlertTriangle, ok: CheckCircle2, info: Info } as const;
const CLASSE: Record<Tom, string> = {
  erro: "border-erro/30 bg-erro/10 text-erro",
  atencao: "border-atencao/30 bg-atencao/10 text-atencao",
  ok: "border-ok/30 bg-ok/10 text-ok",
  info: "border-info/30 bg-info/10 text-info",
};

/** Estado nunca é comunicado só por cor: sempre ícone + texto (MARCA.md). */
export function Alerta({
  tom = "info",
  children,
  className,
}: {
  tom?: Tom;
  children: React.ReactNode;
  className?: string;
}) {
  const Icone = ICONE[tom];
  return (
    <div
      role="alert"
      className={cn("flex items-start gap-2 rounded border p-3 text-sm", CLASSE[tom], className)}
    >
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
