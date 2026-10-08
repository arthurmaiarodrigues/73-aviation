import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { exigirValores } from "@/lib/perfil";
import { aeronaveAtiva, listarCategorias, listarFornecedores, listarSocios } from "@/lib/dados/cadastros";
import { listarContas } from "@/lib/dados/contas";
import { hoje, reais } from "@/lib/formato";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioConta } from "./formulario-conta";
import { TabelaContas } from "./tabela-contas";

export const metadata: Metadata = { title: "Contas a pagar" };

export default async function PaginaContas() {
  const usuario = await exigirValores();
  const aeronave = await aeronaveAtiva();
  const [contas, fornecedores, categorias, socios] = await Promise.all([
    listarContas(aeronave.id),
    listarFornecedores(),
    listarCategorias(),
    listarSocios({ somenteAtivos: true }),
  ]);

  const abertas = contas.filter((c) => !c.pago_em);
  const vencidas = abertas.filter((c) => c.situacao === "VENCIDA");
  const logo = abertas.filter((c) => c.situacao === "VENCE_EM_BREVE");
  const semNota = abertas.filter((c) => !c.despesa_id);
  const soma = (lista: typeof contas) => lista.reduce((s, c) => s + c.valor, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Contas a pagar</h1>
          <p className="mt-1 text-sm text-marinho-300">
            Boletos e vencimentos. Não entra em rateio nem no extrato: o custo vem da nota lançada em Despesas, e aqui você liga uma coisa na outra.
          </p>
        </div>
        <a href="/contas/exportar" className="rounded border border-marinho-300 px-3 py-2 text-sm font-semibold hover:border-laranja">
          Exportar Excel
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className={vencidas.length > 0 ? "border-erro" : undefined}>
          <CardHeader className="p-4">
            <p className="text-xs uppercase tracking-wide text-marinho-300">Vencidas</p>
            <CardTitle className="tabular text-lg">{reais(soma(vencidas))}</CardTitle>
            <p className="text-xs text-marinho-300">{vencidas.length} conta(s)</p>
          </CardHeader>
        </Card>
        <Card className={logo.length > 0 ? "border-atencao" : undefined}>
          <CardHeader className="p-4">
            <p className="text-xs uppercase tracking-wide text-marinho-300">Vencem em 7 dias</p>
            <CardTitle className="tabular text-lg">{reais(soma(logo))}</CardTitle>
            <p className="text-xs text-marinho-300">{logo.length} conta(s)</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4">
            <p className="text-xs uppercase tracking-wide text-marinho-300">Total em aberto</p>
            <CardTitle className="tabular text-lg">{reais(soma(abertas))}</CardTitle>
            <p className="text-xs text-marinho-300">{abertas.length} conta(s)</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4">
            <p className="text-xs uppercase tracking-wide text-marinho-300">Sem nota ligada</p>
            <CardTitle className="tabular text-lg">{semNota.length}</CardTitle>
            <p className="text-xs text-marinho-300">de {abertas.length} em aberto</p>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-laranja">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="size-4" /> Lançar uma conta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FormularioConta
            fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nome }))}
            categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))}
            hoje={hoje()}
          />
        </CardContent>
      </Card>

      <TabelaContas
        contas={contas}
        socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))}
        admin={usuario.perfil === "admin"}
        hoje={hoje()}
      />
    </div>
  );
}
