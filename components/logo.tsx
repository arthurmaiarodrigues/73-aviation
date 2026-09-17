import { cn } from "@/lib/utils";

/**
 * Avião visto de cima, no traço do selo da 73 Aviation. Vetor, para não
 * depender do PNG na barra lateral e nos ícones.
 */
export function Aviao({ className, cor = "currentColor", cabine = "#E4782A" }: { className?: string; cor?: string; cabine?: string }) {
  return (
    <svg viewBox="0 0 100 120" className={className} aria-hidden fill={cor}>
      {/* hélice */}
      <rect x="28" y="8" width="44" height="3" rx="1.5" />
      <circle cx="50" cy="9.5" r="3.5" fill={cabine} />
      {/* fuselagem */}
      <path d="M50 12c-7 0-11 8-11 20v48c0 6 3 12 11 12s11-6 11-12V32c0-12-4-20-11-20z" />
      {/* cabine */}
      <path d="M50 20c-4 0-6 5-6 11v10h12V31c0-6-2-11-6-11z" fill={cabine} />
      {/* asas */}
      <path d="M4 52c0-2 2-4 4-4h84c2 0 4 2 4 4v4c0 2-2 4-4 4H8c-2 0-4-2-4-4z" />
      {/* empenagem */}
      <path d="M24 94c0-2 1-3 3-3h46c2 0 3 1 3 3v3c0 2-1 3-3 3H27c-2 0-3-1-3-3z" />
      <rect x="47" y="98" width="6" height="8" rx="1" />
    </svg>
  );
}

/** Marca para fundo marinho (barra lateral) ou areia (login). */
export function Logo({ className, fundo = "escuro" }: { className?: string; fundo?: "escuro" | "claro" }) {
  const texto = fundo === "escuro" ? "text-areia" : "text-marinho";
  return (
    <div className={cn("flex items-center gap-3", texto, className)}>
      <Aviao className="h-9 w-auto" />
      <div className="border-l border-laranja pl-3 leading-none">
        <div className="text-xl font-bold tracking-tight">
          73 <span className="text-sm font-semibold tracking-[0.3em]">AVIATION</span>
        </div>
        <div className="mt-1 text-[10px] font-semibold tracking-[0.25em] text-laranja">PP-ZNM · RV-10</div>
      </div>
    </div>
  );
}

/** Só o símbolo, para a barra recolhida. */
export function Simbolo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center rounded bg-laranja p-1", className)}>
      <Aviao className="h-full w-auto" cor="#F3EFE8" cabine="#0E2846" />
    </div>
  );
}
