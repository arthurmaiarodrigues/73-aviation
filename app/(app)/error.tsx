"use client";

import { Alerta } from "@/components/ui/alerta";
import { Button } from "@/components/ui/button";

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Alerta tom="erro">
        <p className="font-semibold">Algo deu errado nesta tela.</p>
        <p className="mt-1 text-xs">{error.message}</p>
      </Alerta>
      <Button variant="secundario" onClick={reset}>
        Tentar de novo
      </Button>
    </div>
  );
}
