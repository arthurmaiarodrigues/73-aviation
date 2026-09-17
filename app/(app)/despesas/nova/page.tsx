import type { Metadata } from "next";

import { exigirValores } from "@/lib/perfil";
import { aeronaveAtiva, listarCategorias, listarFornecedores, listarSocios } from "@/lib/dados/cadastros";
import { listarVoos } from "@/lib/dados/voos";
import { hoje } from "@/lib/formato";
import { FormularioDespesa } from "../formulario-despesa";

export const metadata: Metadata = { title: "Nova despesa" };

export default async function PaginaNovaDespesa() {
  const usuario = await exigirValores();
  const aeronave = await aeronaveAtiva();
  const [socios, categorias, fornecedores, voos] = await Promise.all([
    listarSocios({ somenteAtivos: true }),
    listarCategorias(),
    listarFornecedores(),
    listarVoos(aeronave.id, {}, 120),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Nova despesa</h1>
      <p className="mt-1 text-sm text-marinho-300">Comprovante, valor, quem pagou e como divide. Custo de pouso cruza com o voo do dia.</p>
      <div className="mt-6">
        <FormularioDespesa
          socios={socios.map((s) => ({ id: s.id, apelido: s.apelido, cota: s.cota }))}
          categorias={categorias}
          fornecedores={fornecedores}
          voosRecentes={voos.map((v) => ({ id: v.id, data: v.data, socio_id: v.socio_id, socio: v.socio, origem: v.origem, destino: v.destino }))}
          hoje={hoje()}
          socioLogadoId={usuario.socioId}
          podeApagar={false}
        />
      </div>
    </div>
  );
}
