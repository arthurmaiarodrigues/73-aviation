import type { Metadata } from "next";
import { Paperclip } from "lucide-react";

import { exigirValores } from "@/lib/perfil";
import { listarSocios } from "@/lib/dados/cadastros";
import { listarAportes, saldoDoCaixa, urlDoComprovante } from "@/lib/dados/financeiro";
import { data as fmtData, hoje, reais } from "@/lib/formato";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha, TabelaRodape } from "@/components/ui/tabela";
import { BotaoApagarAporte, FormularioAporte } from "./formulario-aporte";

export const metadata: Metadata = { title: "Aportes" };

export default async function PaginaAportes() {
  const usuario = await exigirValores();
  const [socios, aportes, caixa] = await Promise.all([listarSocios({ somenteAtivos: true }), listarAportes(), saldoDoCaixa()]);
  const urls = await Promise.all(aportes.map((a) => urlDoComprovante(a.comprovante_path)));

  const porSocio = socios.map((s) => ({ apelido: s.apelido, total: aportes.filter((a) => a.socio_id === s.id).reduce((t, a) => t + a.valor, 0) }));
  const total = aportes.reduce((t, a) => t + a.valor, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Aportes</h1>
        <p className="mt-1 text-sm text-marinho-300">Dinheiro que cada sócio colocou no caixa da sociedade. Vira crédito no extrato dele.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-5">
        {porSocio.map((s) => (
          <Card key={s.apelido}>
            <CardHeader className="p-4">
              <p className="text-xs uppercase tracking-wide text-marinho-300">{s.apelido}</p>
              <CardTitle className="tabular text-lg">{reais(s.total)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
        <Card className="border-laranja">
          <CardHeader className="p-4">
            <p className="text-xs uppercase tracking-wide text-marinho-300">Caixa hoje</p>
            <CardTitle className="tabular text-lg">{reais(caixa.saldo)}</CardTitle>
            <p className="text-xs text-marinho-300">
              {reais(caixa.entradas)} entrou · {reais(caixa.saidas)} saiu
            </p>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novo aporte</CardTitle>
        </CardHeader>
        <CardContent>
          <FormularioAporte socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))} hoje={hoje()} socioLogadoId={usuario.socioId} />
        </CardContent>
      </Card>

      <Tabela>
        <TabelaCabecalho>
          <tr>
            <Cabecalho>Data</Cabecalho>
            <Cabecalho>Sócio</Cabecalho>
            <Cabecalho>Descrição</Cabecalho>
            <Cabecalho numerico>Valor</Cabecalho>
            <Cabecalho></Cabecalho>
          </tr>
        </TabelaCabecalho>
        <TabelaCorpo>
          {aportes.length === 0 && (
            <TabelaLinha>
              <Celula colSpan={5} className="py-10 text-center text-marinho-300">
                Nenhum aporte ainda.
              </Celula>
            </TabelaLinha>
          )}
          {aportes.map((a, i) => (
            <TabelaLinha key={a.id}>
              <Celula>{fmtData(a.data)}</Celula>
              <Celula className="font-semibold">{a.socio}</Celula>
              <Celula>{a.descricao ?? ""}</Celula>
              <Celula numerico className="font-semibold">{reais(a.valor)}</Celula>
              <Celula className="whitespace-nowrap">
                <div className="flex items-center justify-end gap-3">
                  {urls[i] && (
                    <a href={urls[i]!} target="_blank" rel="noreferrer" title="Comprovante" className="text-marinho-300 hover:text-laranja-700">
                      <Paperclip className="size-4" />
                    </a>
                  )}
                  {usuario.perfil === "admin" && <BotaoApagarAporte id={a.id} />}
                </div>
              </Celula>
            </TabelaLinha>
          ))}
        </TabelaCorpo>
        {aportes.length > 0 && (
          <TabelaRodape>
            <tr>
              <Celula colSpan={3}>Total</Celula>
              <Celula numerico>{reais(total)}</Celula>
              <Celula />
            </tr>
          </TabelaRodape>
        )}
      </Tabela>
    </div>
  );
}
