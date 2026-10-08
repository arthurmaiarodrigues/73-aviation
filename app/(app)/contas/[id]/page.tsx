import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { exigirValores } from "@/lib/perfil";
import { listarCategorias, listarFornecedores } from "@/lib/dados/cadastros";
import { buscarConta } from "@/lib/dados/contas";
import { urlDoComprovante } from "@/lib/dados/financeiro";
import { data as fmtData, hoje, reais } from "@/lib/formato";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioConta } from "../formulario-conta";

export const metadata: Metadata = { title: "Conta a pagar" };

export default async function PaginaConta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirValores();
  const conta = await buscarConta(id);
  if (!conta) notFound();
  const [fornecedores, categorias, boleto, comprovante] = await Promise.all([
    listarFornecedores(),
    listarCategorias(),
    urlDoComprovante(conta.boleto_path),
    urlDoComprovante(conta.comprovante_path),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/contas" className="inline-flex items-center gap-1 text-sm text-marinho-300 hover:text-laranja-700">
        <ArrowLeft className="size-4" /> Contas a pagar
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{conta.descricao}</h1>
        <p className="mt-1 text-sm text-marinho-300">
          {reais(conta.valor)} · vence {fmtData(conta.vencimento)}
          {conta.pago_em ? ` · paga em ${fmtData(conta.pago_em)}${conta.pagador ? ` por ${conta.pagador}` : ""}` : ""}
          {conta.nota_descricao ? ` · nota: ${conta.nota_descricao}` : " · sem nota ligada"}
        </p>
        <p className="mt-1 flex gap-4 text-sm">
          {boleto && (
            <a href={boleto} target="_blank" rel="noreferrer" className="text-laranja-700 hover:underline">
              ver o boleto
            </a>
          )}
          {comprovante && (
            <a href={comprovante} target="_blank" rel="noreferrer" className="text-laranja-700 hover:underline">
              ver o comprovante do pagamento
            </a>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Editar a conta</CardTitle>
        </CardHeader>
        <CardContent>
          <FormularioConta
            fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nome }))}
            categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))}
            hoje={hoje()}
            conta={{
              id: conta.id,
              descricao: conta.descricao,
              valor: conta.valor,
              vencimento: conta.vencimento,
              documento: conta.documento,
              observacao: conta.observacao,
              fornecedor_id: conta.fornecedor_id,
              categoria_id: conta.categoria_id,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
