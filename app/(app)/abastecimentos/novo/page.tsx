import type { Metadata } from "next";
import Link from "next/link";

import { exigirValores } from "@/lib/perfil";
import { aeronaveAtiva, aerodromosRecentes, listarSocios } from "@/lib/dados/cadastros";
import { listarAbastecimentos } from "@/lib/dados/financeiro";
import { listarVoos } from "@/lib/dados/voos";
import { data as fmtData, hoje, litros as fmtLitros, reais } from "@/lib/formato";
import { Cabecalho, Celula, Tabela, TabelaCabecalho, TabelaCorpo, TabelaLinha } from "@/components/ui/tabela";
import { FormularioAbastecimento } from "./formulario-abastecimento";

export const metadata: Metadata = { title: "Abastecimento fora da base" };

export default async function PaginaAbastecer() {
  const usuario = await exigirValores();
  const aeronave = await aeronaveAtiva();
  const [socios, aerodromos, voos, ultimos] = await Promise.all([
    listarSocios({ somenteAtivos: true }),
    aerodromosRecentes(aeronave.id),
    listarVoos(aeronave.id, {}, 20),
    listarAbastecimentos(aeronave.id, 10),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Abastecimento fora da base</h1>
        <p className="mt-1 text-sm text-marinho-300">
          Posto de outro aeroporto, pago na hora. Quem usa abastece o que consumiu; os litros entram no seu saldo de combustível. Na base, use o{" "}
          <Link href="/combustivel" className="text-laranja-700 hover:underline">tanque do hangar</Link>.
        </p>
      </div>

      <FormularioAbastecimento
        socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))}
        aerodromos={aerodromos}
        voos={voos.map((v) => ({ id: v.id, data: v.data, socio: v.socio, origem: v.origem, destino: v.destino }))}
        hoje={hoje()}
        socioLogadoId={usuario.socioId}
        base={aeronave.base_icao ?? "SNTF"}
      />

      {ultimos.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Últimos abastecimentos</h2>
          <Tabela>
            <TabelaCabecalho>
              <tr>
                <Cabecalho>Data</Cabecalho>
                <Cabecalho>Onde</Cabecalho>
                <Cabecalho numerico>Litros</Cabecalho>
                <Cabecalho numerico>Valor</Cabecalho>
                <Cabecalho numerico>R$/L</Cabecalho>
                <Cabecalho>Pagou</Cabecalho>
              </tr>
            </TabelaCabecalho>
            <TabelaCorpo>
              {ultimos.map((a) => (
                <TabelaLinha key={a.id}>
                  <Celula>{fmtData(a.data)}</Celula>
                  <Celula>{a.aerodromo ?? ""}</Celula>
                  <Celula numerico>{fmtLitros(a.litros)}</Celula>
                  <Celula numerico>{reais(a.valor)}</Celula>
                  <Celula numerico>{a.litros > 0 ? reais(a.valor / a.litros) : "—"}</Celula>
                  <Celula>{a.pagador}</Celula>
                </TabelaLinha>
              ))}
            </TabelaCorpo>
          </Tabela>
        </div>
      )}
    </div>
  );
}
