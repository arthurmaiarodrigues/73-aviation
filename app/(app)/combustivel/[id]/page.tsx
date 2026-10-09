import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { exigirValores } from "@/lib/perfil";
import { listarFornecedores, listarSocios } from "@/lib/dados/cadastros";
import { buscarMovimentoTanque } from "@/lib/dados/tanque";
import { urlDoComprovante } from "@/lib/dados/financeiro";
import { data as fmtData, litros as fmtLitros, reais } from "@/lib/formato";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditarMovimento } from "./editar-movimento";

export const metadata: Metadata = { title: "Movimento do tanque" };

const ROTULO = { COMPRA: "Compra para o tanque", RETIRADA: "Abastecimento do avião", AJUSTE: "Medição do tanque" } as const;

export default async function PaginaMovimentoTanque({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirValores();
  const movimento = await buscarMovimentoTanque(id);
  if (!movimento) notFound();
  const [socios, fornecedores, comprovante] = await Promise.all([
    listarSocios({ somenteAtivos: true }),
    listarFornecedores(),
    urlDoComprovante(movimento.comprovante_path),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/combustivel" className="inline-flex items-center gap-1 text-sm text-marinho-300 hover:text-laranja-700">
        <ArrowLeft className="size-4" /> Combustível
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{ROTULO[movimento.tipo]}</h1>
        <p className="mt-1 text-sm text-marinho-300">
          {fmtData(movimento.data)} · {fmtLitros(Math.abs(movimento.litros))}
          {movimento.valor !== null ? ` · ${reais(movimento.valor)}` : ""}
        </p>
        {comprovante && (
          <a href={comprovante} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-laranja-700 hover:underline">
            ver o comprovante
          </a>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Corrigir o lançamento</CardTitle>
        </CardHeader>
        <CardContent>
          <EditarMovimento
            movimento={{
              id: movimento.id,
              data: movimento.data,
              tipo: movimento.tipo,
              litros: movimento.litros,
              valor: movimento.valor,
              socio_id: movimento.socio_id,
              fornecedor_id: movimento.fornecedor_id,
              observacao: movimento.observacao,
            }}
            socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))}
            fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nome }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
