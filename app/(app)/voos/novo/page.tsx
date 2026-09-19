import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { exigirSessao } from "@/lib/perfil";
import { aeronaveAtiva, aerodromosRecentes, listarPilotos, listarSocios } from "@/lib/dados/cadastros";
import { ultimoHorimetro, vooEmAberto } from "@/lib/dados/voos";
import { temChave } from "@/lib/horimetro/ler";
import { hoje } from "@/lib/formato";
import { FormularioVoo } from "./formulario-voo";

export const metadata: Metadata = { title: "Registrar voo" };

export default async function PaginaNovoVoo({ searchParams }: { searchParams: Promise<{ data?: string; socio?: string; destino?: string }> }) {
  const busca = await searchParams;
  const usuario = await exigirSessao();
  const aeronave = await aeronaveAtiva();

  // Já tem um voo aberto (decolou e não registrou o pouso): fecha ele primeiro.
  const aberto = await vooEmAberto(aeronave.id);
  if (aberto && aberto.autor_id === usuario.id) redirect(`/voos/${aberto.id}?aberto=1`);

  const [socios, pilotos, aerodromos, ultimo] = await Promise.all([
    listarSocios({ somenteAtivos: true }),
    listarPilotos(),
    aerodromosRecentes(aeronave.id),
    ultimoHorimetro(aeronave.id),
  ]);


  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Registrar voo</h1>
      <p className="mt-1 text-sm text-marinho-300">
        {aeronave.matricula} · foto do horímetro antes de decolar e depois do pouso.
      </p>
      {aberto && aberto.autor_id !== usuario.id && (
        <p className="mt-3 rounded border border-atencao/40 bg-atencao/10 p-3 text-sm text-atencao">
          Há um voo em aberto registrado por outra pessoa ({aberto.socio ?? "sociedade"}, {aberto.data.split("-").reverse().join("/")}). Se for o seu, peça para fechar antes.
        </p>
      )}
      <div className="mt-6">
        <FormularioVoo
          perfil={usuario.perfil}
          socioLogadoId={busca.socio && /^[0-9a-f-]{36}$/i.test(busca.socio) ? busca.socio : usuario.socioId}
          dataInicial={busca.data && /^\d{4}-\d{2}-\d{2}$/.test(busca.data) ? busca.data : undefined}
          destinoInicial={busca.destino && /^[A-Z0-9]{4}$/i.test(busca.destino) ? busca.destino.toUpperCase() : undefined}
          socios={socios.map((s) => ({ id: s.id, apelido: s.apelido }))}
          pilotos={pilotos}
          pilotoLogadoId={usuario.pilotoId ?? (pilotos.length === 1 ? pilotos[0].id : null)}
          aerodromos={aerodromos}
          base={aeronave.base_icao ?? "SNTF"}
          ultimoHorimetro={ultimo}
          hoje={hoje()}
          leituraAutomatica={temChave()}
        />
      </div>
    </div>
  );
}
