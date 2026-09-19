"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, Loader2, PlaneLanding, PlaneTakeoff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { FotoHorimetro, type EstadoFoto } from "@/components/foto-horimetro";
import { SeletorAerodromo } from "@/components/seletor-aerodromo";
import { ListaEscalas } from "@/components/lista-escalas";
import { NATUREZAS, ROTULO_NATUREZA, ehUsoComum, type NaturezaVoo, type Perfil } from "@/lib/tipos";
import { horasHm, horimetro as fmtHorimetro } from "@/lib/formato";
import { salvarVoo, type Resultado } from "../acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao({ pousou, antigo }: { pousou: boolean; antigo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : pousou ? <PlaneLanding /> : <PlaneTakeoff />}
      {pending ? "Salvando…" : antigo ? "Registrar voo antigo" : pousou ? "Registrar voo completo" : "Decolei"}
    </Button>
  );
}

/**
 * Decolagem em três toques: foto do horímetro, para onde (ida e volta por
 * padrão) e por conta de quem. O resto fica em "mais detalhes". O pouso é
 * registrado perna a perna na ficha do voo.
 */
export function FormularioVoo({
  perfil,
  socioLogadoId,
  socios,
  pilotos,
  pilotoLogadoId,
  aerodromos,
  base,
  ultimoHorimetro,
  hoje,
  dataInicial,
  destinoInicial,
  leituraAutomatica,
}: {
  perfil: Perfil;
  socioLogadoId: string | null;
  socios: { id: string; apelido: string }[];
  pilotos: { id: string; nome: string; socio_id: string | null }[];
  pilotoLogadoId: string | null;
  aerodromos: string[];
  base: string;
  ultimoHorimetro: number | null;
  hoje: string;
  /** Vindo de uma reserva sem voo: data e destino já preenchidos. */
  dataInicial?: string;
  destinoInicial?: string;
  leituraAutomatica: boolean;
}) {
  const [estado, acao] = useActionState(salvarVoo, INICIAL);
  const [natureza, setNatureza] = useState<NaturezaVoo>("PARTICULAR");
  const [pousou, setPousou] = useState(false);
  const [semHorimetro, setSemHorimetro] = useState(false);
  const [fotoInicial, setFotoInicial] = useState<EstadoFoto>({ caminho: null, leitura: null, valor: "" });
  const [fotoFinal, setFotoFinal] = useState<EstadoFoto>({ caminho: null, leitura: null, valor: "" });
  const [idaVolta, setIdaVolta] = useState(true);
  const [origem, setOrigem] = useState(base);
  const [destino, setDestino] = useState(destinoInicial ?? "");
  const [pousos, setPousos] = useState("2");
  const [horasDigitadas, setHorasDigitadas] = useState("");
  const [somaPernas, setSomaPernas] = useState<number | null>(null);
  const [qtdEscalas, setQtdEscalas] = useState(0);
  const [detalhes, setDetalhes] = useState(false);

  const usoComum = ehUsoComum(natureza);
  const inicialNumero = Number(fotoInicial.valor.replace(/\./g, "").replace(",", "."));
  const esperadoFinal = fotoInicial.valor && Number.isFinite(inicialNumero) ? inicialNumero : ultimoHorimetro;
  const trecho = [origem || "?", ...(idaVolta && destino ? [destino] : []), ...(idaVolta ? [origem || "?"] : [destino || "?"])].join(" → ");
  const totalPousos = (idaVolta ? 1 : 0) + qtdEscalas + 1;

  return (
    <form action={acao} className="space-y-6">
      {!estado.ok && estado.mensagem && <Alerta tom="erro">{estado.mensagem}</Alerta>}
      <input type="hidden" name="ida_volta" value={idaVolta ? "on" : ""} />
      <input type="hidden" name="pousos" value={detalhes ? pousos : String(totalPousos)} />

      {/* 1. Foto do horímetro */}
      {!semHorimetro ? (
        <FotoHorimetro
          nome="inicial"
          rotulo="1. Foto do horímetro antes de decolar"
          esperado={ultimoHorimetro}
          rotuloArquivo="HORIMETRO - INICIAL"
          estado={fotoInicial}
          aoMudar={setFotoInicial}
          leituraAutomatica={leituraAutomatica}
        />
      ) : (
        <div className="space-y-1.5 rounded-lg border border-atencao/40 bg-atencao/10 p-4">
          <Label htmlFor="horas_informadas">Horas voadas (sem horímetro)</Label>
          <Input
            id="horas_informadas"
            name="horas_informadas"
            inputMode="decimal"
            placeholder="1,5"
            value={somaPernas !== null ? String(somaPernas).replace(".", ",") : horasDigitadas}
            onChange={(e) => setHorasDigitadas(e.target.value)}
            readOnly={somaPernas !== null}
            className="h-12 text-lg tabular"
            required
          />
          <p className="text-xs text-atencao">
            {somaPernas !== null ? `Soma das pernas: ${horasHm(somaPernas)} (edite as horas de cada perna em "mais detalhes"). ` : ""}O voo fica marcado como pendente de horímetro até o administrador conferir.
          </p>
        </div>
      )}
      {ultimoHorimetro !== null && !semHorimetro && (
        <p className="-mt-3 text-xs text-marinho-300">
          Último registrado: <strong className="tabular">{fmtHorimetro(ultimoHorimetro)}</strong>
        </p>
      )}

      {/* 2. Para onde e por conta de quem */}
      <div className="space-y-4 rounded-lg border border-marinho-100 p-4 dark:border-marinho-300">
        <p className="text-sm font-semibold">2. Para onde?</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <SeletorAerodromo nome="destino" rotulo={idaVolta ? "Destino (vai e volta)" : "Destino"} opcoes={aerodromos} valorInicial={destinoInicial ?? ""} aoMudar={setDestino} />
          <div className="space-y-1.5">
            <Label htmlFor="socio_id">Por conta de</Label>
            {usoComum ? (
              <p className="flex h-12 items-center rounded border border-marinho-100 bg-areia-200 px-3 text-sm text-marinho-300 dark:border-marinho-300 dark:bg-marinho-700">
                Sociedade — horas divididas entre os sócios
              </p>
            ) : (
              <Select id="socio_id" name="socio_id" defaultValue={socioLogadoId ?? ""} required className="h-12">
                <option value="" disabled>
                  Escolha…
                </option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.apelido}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={idaVolta} onChange={(e) => setIdaVolta(e.target.checked)} className="size-5" />
          Ida e volta — termina em {origem || base}
        </label>
        <p className="text-sm text-marinho-300">
          Voo: <strong className="text-marinho dark:text-areia">{trecho}</strong> · {totalPousos} pouso{totalPousos === 1 ? "" : "s"}. Cada pouso você registra na hora, com a foto do horímetro; o último fecha o voo.
        </p>
      </div>

      {/* 3. Mais detalhes (recolhido) */}
      <button type="button" onClick={() => setDetalhes((d) => !d)} className="flex items-center gap-1 text-sm font-semibold text-laranja-700">
        <ChevronDown className={`size-4 transition-transform ${detalhes ? "rotate-180" : ""}`} /> {detalhes ? "menos detalhes" : "mais detalhes (data, piloto, escalas, combustível…)"}
      </button>

      <div className={detalhes ? "space-y-4" : "hidden"}>
        {perfil === "admin" && (
          <label className="flex items-center gap-2 text-sm text-marinho-300">
            <input
              type="checkbox"
              checked={semHorimetro}
              onChange={(e) => {
                setSemHorimetro(e.target.checked);
                if (e.target.checked) setPousou(true);
              }}
            />
            Voo antigo, sem foto do horímetro (digitar só as horas)
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="data">Data</Label>
            <Input id="data" name="data" type="date" defaultValue={dataInicial ?? hoje} required className="h-12" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="natureza">Natureza do voo</Label>
            <Select id="natureza" name="natureza" value={natureza} onChange={(e) => setNatureza(e.target.value as NaturezaVoo)} className="h-12">
              {NATUREZAS.map((n) => (
                <option key={n} value={n}>
                  {ROTULO_NATUREZA[n]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="piloto_id">Piloto</Label>
            <Select id="piloto_id" name="piloto_id" defaultValue={pilotoLogadoId ?? ""} className="h-12">
              <option value="">—</option>
              {pilotos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </div>
          <SeletorAerodromo nome="origem" rotulo="Origem" opcoes={aerodromos} valorInicial={base} aoMudar={setOrigem} />
          <ListaEscalas
            opcoes={aerodromos}
            aoMudar={(n, total) => {
              setQtdEscalas(n);
              setPousos(String((idaVolta ? 1 : 0) + n + 1));
              setSomaPernas(total);
            }}
          />
          <div className="space-y-1.5">
            <Label htmlFor="combustivel_inicial_l">Combustível na decolagem (L)</Label>
            <Input id="combustivel_inicial_l" name="combustivel_inicial_l" inputMode="decimal" placeholder="ex.: 195" className="h-12 tabular" />
            <p className="text-xs text-marinho-300">Sem a leitura, o consumo é estimado pelo consumo médio.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pousos_edit">Pousos</Label>
            <Input id="pousos_edit" type="number" min={0} value={pousos} onChange={(e) => setPousos(e.target.value)} className="h-12 tabular" />
            <p className="text-xs text-marinho-300">Ajuste se fez toque-e-arremetida.</p>
          </div>
        </div>

        {!semHorimetro && (
          <label className="flex items-center gap-3 rounded-lg border border-marinho-100 bg-areia-200 p-4 text-sm font-semibold dark:border-marinho-300 dark:bg-marinho-700">
            <input type="checkbox" checked={pousou} onChange={(e) => setPousou(e.target.checked)} className="size-5" />
            Já pousei — registrar o horímetro final agora (voo inteiro de uma vez)
          </label>
        )}
        {pousou && (
          <>
            {semHorimetro ? (
              <p className="text-xs text-marinho-300">Voo antigo: sem horímetro final — as horas digitadas fecham o voo.</p>
            ) : (
              <FotoHorimetro
                nome="final"
                rotulo="Horímetro depois do pouso"
                esperado={esperadoFinal}
                rotuloArquivo="HORIMETRO - FINAL"
                estado={fotoFinal}
                aoMudar={setFotoFinal}
                leituraAutomatica={leituraAutomatica}
              />
            )}
            <div className="space-y-1.5">
              <Label htmlFor="combustivel_final_l">Combustível no pouso (L)</Label>
              <Input id="combustivel_final_l" name="combustivel_final_l" inputMode="decimal" placeholder="ex.: 125" className="h-12 tabular" />
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="observacao">Observação</Label>
          <Textarea id="observacao" name="observacao" placeholder="Opcional" />
        </div>
      </div>

      <Botao pousou={pousou} antigo={semHorimetro} />
    </form>
  );
}
