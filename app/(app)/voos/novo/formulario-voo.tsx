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
import { cn } from "@/lib/utils";
import { salvarVoo, type Resultado } from "../acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };
const VAZIA: EstadoFoto = { caminho: null, leitura: null, valor: "" };

function lerHorimetro(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function Botao({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="campo" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : rotulo.startsWith("Decolei") ? <PlaneTakeoff /> : <PlaneLanding />}
      {pending ? "Salvando…" : rotulo}
    </Button>
  );
}

/**
 * Registro do voo no formato do diário de bordo: ida (data, origem, destino,
 * horímetro inicial e final) e volta (idem), juntas ou separadas. Cada
 * trecho vira um voo com a própria data. Horímetro final vazio = "ainda
 * estou voando": o voo fica aberto e o pouso é registrado pelo Início.
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
  origemInicial,
  naturezaInicial,
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
  /** Onde o avião está (destino do último voo); fora da base é de lá que decola. */
  origemInicial?: string;
  naturezaInicial?: NaturezaVoo;
  leituraAutomatica: boolean;
}) {
  const [estado, acao] = useActionState(salvarVoo, INICIAL);
  const [natureza, setNatureza] = useState<NaturezaVoo>(naturezaInicial ?? "PARTICULAR");
  const foraDaBase = Boolean(origemInicial && origemInicial !== base);
  // Fora da base o trecho pendente é só a volta; na base, ida e volta juntas por padrão.
  const [comVolta, setComVolta] = useState(!foraDaBase);
  const [semHorimetro, setSemHorimetro] = useState(false);
  const [fotoInicial, setFotoInicial] = useState<EstadoFoto>(VAZIA);
  const [horimetroFimIda, setHorimetroFimIda] = useState("");
  const [horimetroIniVolta, setHorimetroIniVolta] = useState("");
  const [fotoFinalVolta, setFotoFinalVolta] = useState<EstadoFoto>(VAZIA);
  const [origem, setOrigem] = useState(origemInicial ?? base);
  const [destino, setDestino] = useState(destinoInicial ?? "");
  const [dataIda, setDataIda] = useState(dataInicial ?? hoje);
  const [pousos, setPousos] = useState("1");
  const [horasDigitadas, setHorasDigitadas] = useState("");
  const [somaPernas, setSomaPernas] = useState<number | null>(null);
  const [qtdEscalas, setQtdEscalas] = useState(0);
  const [detalhes, setDetalhes] = useState(false);

  const usoComum = ehUsoComum(natureza);
  const hIni = lerHorimetro(fotoInicial.valor);
  const hFimIda = lerHorimetro(horimetroFimIda);
  const hIniVolta = lerHorimetro(horimetroIniVolta) ?? hFimIda;
  const hFimVolta = lerHorimetro(fotoFinalVolta.valor);
  const horasIda = hIni !== null && hFimIda !== null && hFimIda >= hIni ? Math.round((hFimIda - hIni) * 10) / 10 : null;
  const horasVolta = hIniVolta !== null && hFimVolta !== null && hFimVolta >= hIniVolta ? Math.round((hFimVolta - hIniVolta) * 10) / 10 : null;

  const aberto = comVolta ? hFimVolta === null : hFimIda === null;
  const rotuloBotao = semHorimetro ? "Registrar voo antigo" : aberto ? (comVolta ? "Registrar ida e decolei na volta" : "Decolei") : comVolta ? "Registrar ida e volta" : "Registrar voo";

  return (
    <form action={acao} className="space-y-6">
      {!estado.ok && estado.mensagem && <Alerta tom="erro">{estado.mensagem}</Alerta>}
      <input type="hidden" name="volta" value={comVolta && !semHorimetro ? "on" : ""} />
      <input type="hidden" name="pousos" value={detalhes ? pousos : String(qtdEscalas + 1)} />

      {/* Junto ou separado */}
      {!semHorimetro && (
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-areia-200 p-1 dark:bg-marinho-700">
          {(
            [
              [true, "Ida e volta"],
              [false, "Só um trecho"],
            ] as const
          ).map(([v, r]) => (
            <button
              key={r}
              type="button"
              onClick={() => setComVolta(v)}
              className={cn("h-11 rounded-md text-sm font-semibold transition", comVolta === v ? "bg-laranja text-marinho shadow" : "text-marinho-300 hover:text-marinho dark:hover:text-areia")}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* IDA */}
      <fieldset className="space-y-4 rounded-lg border border-marinho-100 p-4 dark:border-marinho-300">
        <legend className="px-1 text-sm font-semibold">{comVolta ? "Ida" : "Voo"}</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="data">Data</Label>
            <Input id="data" name="data" type="date" value={dataIda} onChange={(e) => setDataIda(e.target.value)} required className="h-12" />
          </div>
          <SeletorAerodromo nome="origem" rotulo="Origem" opcoes={aerodromos} valorInicial={origemInicial ?? base} aoMudar={setOrigem} obrigatorio />
          <SeletorAerodromo nome="destino" rotulo="Destino" opcoes={aerodromos} valorInicial={destinoInicial ?? ""} aoMudar={setDestino} obrigatorio />
        </div>

        {!semHorimetro ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FotoHorimetro
              nome="inicial"
              rotulo="Horímetro na decolagem"
              esperado={ultimoHorimetro}
              rotuloArquivo="HORIMETRO - INICIAL"
              estado={fotoInicial}
              aoMudar={setFotoInicial}
              leituraAutomatica={leituraAutomatica}
            />
            <div className="space-y-1.5">
              <Label htmlFor="horimetro_final">Horímetro no pouso{comVolta ? ` em ${destino || "…"}` : ""}</Label>
              <Input
                id="horimetro_final"
                name="horimetro_final"
                inputMode="decimal"
                placeholder={hIni !== null ? fmtHorimetro(hIni) : "0000,0"}
                value={horimetroFimIda}
                onChange={(e) => setHorimetroFimIda(e.target.value)}
                required={comVolta}
                className="h-12 text-lg font-semibold tabular"
              />
              <p className={cn("text-xs", hFimIda !== null && hIni !== null && hFimIda < hIni ? "text-erro" : "text-marinho-300")}>
                {horasIda !== null ? `${horasHm(horasIda)} de voo` : hFimIda !== null && hIni !== null ? "Tem de ser maior que o da decolagem." : comVolta ? "Anote o horímetro ao pousar." : "Vazio = ainda estou voando; o pouso é registrado depois pelo Início."}
              </p>
            </div>
          </div>
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
              {somaPernas !== null ? `Soma das pernas: ${horasHm(somaPernas)}. ` : ""}O voo fica marcado como pendente de horímetro até o administrador conferir.
            </p>
          </div>
        )}
        {ultimoHorimetro !== null && !semHorimetro && (
          <p className="text-xs text-marinho-300">
            Último registrado: <strong className="tabular">{fmtHorimetro(ultimoHorimetro)}</strong>
          </p>
        )}
      </fieldset>

      {/* VOLTA */}
      {comVolta && !semHorimetro && (
        <fieldset className="space-y-4 rounded-lg border border-marinho-100 p-4 dark:border-marinho-300">
          <legend className="px-1 text-sm font-semibold">Volta</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="data_volta">Data</Label>
              <Input id="data_volta" name="data_volta" type="date" defaultValue={dataInicial ?? hoje} min={dataIda || undefined} required className="h-12" />
            </div>
            <SeletorAerodromo key={`ov-${destino}`} nome="origem_volta" rotulo="Origem" opcoes={aerodromos} valorInicial={destino} obrigatorio />
            <SeletorAerodromo key={`dv-${origem}`} nome="destino_volta" rotulo="Destino" opcoes={aerodromos} valorInicial={origem} obrigatorio />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="horimetro_inicial_volta">Horímetro na decolagem</Label>
              <Input
                id="horimetro_inicial_volta"
                name="horimetro_inicial_volta"
                inputMode="decimal"
                placeholder={hFimIda !== null ? fmtHorimetro(hFimIda) : "0000,0"}
                value={horimetroIniVolta}
                onChange={(e) => setHorimetroIniVolta(e.target.value)}
                className="h-12 text-lg font-semibold tabular"
              />
              <p className="text-xs text-marinho-300">Vazio = o mesmo do pouso da ida{hFimIda !== null ? ` (${fmtHorimetro(hFimIda)})` : ""}.</p>
            </div>
            <div>
              <FotoHorimetro
                nome="final"
                campo="final_volta"
                rotulo="Horímetro no pouso"
                esperado={hIniVolta}
                rotuloArquivo="HORIMETRO - FINAL"
                estado={fotoFinalVolta}
                aoMudar={setFotoFinalVolta}
                obrigatoria={false}
                leituraAutomatica={leituraAutomatica}
              />
              <p className="mt-1 text-xs text-marinho-300">{horasVolta !== null ? `${horasHm(horasVolta)} de voo · total ${horasHm(Math.round(((horasIda ?? 0) + horasVolta) * 10) / 10)}` : "Vazio = ainda vou voltar; o pouso é registrado depois pelo Início."}</p>
            </div>
          </div>
        </fieldset>
      )}

      {/* Por conta de */}
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

      {/* Mais detalhes */}
      <button type="button" onClick={() => setDetalhes((d) => !d)} className="flex items-center gap-1 text-sm font-semibold text-laranja-700">
        <ChevronDown className={`size-4 transition-transform ${detalhes ? "rotate-180" : ""}`} /> {detalhes ? "menos detalhes" : "mais detalhes (natureza, piloto, escalas, combustível…)"}
      </button>

      <div className={detalhes ? "space-y-4" : "hidden"}>
        {perfil === "admin" && (
          <label className="flex items-center gap-2 text-sm text-marinho-300">
            <input type="checkbox" checked={semHorimetro} onChange={(e) => setSemHorimetro(e.target.checked)} />
            Voo antigo, sem foto do horímetro (digitar só as horas)
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
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
          <ListaEscalas
            opcoes={aerodromos}
            aoMudar={(n, total) => {
              setQtdEscalas(n);
              setPousos(String(n + 1));
              setSomaPernas(total);
            }}
          />
          <div className="space-y-1.5">
            <Label htmlFor="combustivel_inicial_l">Combustível na decolagem (L)</Label>
            <Input id="combustivel_inicial_l" name="combustivel_inicial_l" inputMode="decimal" placeholder="ex.: 195" className="h-12 tabular" />
            <p className="text-xs text-marinho-300">Sem a leitura, o consumo é estimado pelo consumo médio.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="combustivel_final_l">Combustível no pouso (L)</Label>
            <Input id="combustivel_final_l" name="combustivel_final_l" inputMode="decimal" placeholder="ex.: 125" className="h-12 tabular" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pousos_edit">Pousos {comVolta ? "(na ida)" : ""}</Label>
            <Input id="pousos_edit" type="number" min={0} value={pousos} onChange={(e) => setPousos(e.target.value)} className="h-12 tabular" />
            <p className="text-xs text-marinho-300">Ajuste se fez toque-e-arremetida.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="observacao">Observação</Label>
          <Textarea id="observacao" name="observacao" placeholder="Opcional" />
        </div>
      </div>

      <Botao rotulo={rotuloBotao} />
    </form>
  );
}
