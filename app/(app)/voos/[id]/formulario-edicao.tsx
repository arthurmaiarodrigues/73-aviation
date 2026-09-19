"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Alerta } from "@/components/ui/alerta";
import { SeletorAerodromo } from "@/components/seletor-aerodromo";
import { ListaEscalas } from "@/components/lista-escalas";
import { NATUREZAS, ROTULO_NATUREZA, ehUsoComum, type NaturezaVoo } from "@/lib/tipos";
import type { VooLinha } from "@/lib/dados/voos";
import { apagarVoo, editarVoo, type Resultado } from "../acoes";

const INICIAL: Resultado = { ok: true, mensagem: "" };

function Botao() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Save />}
      Salvar alterações
    </Button>
  );
}

const dec = (n: number | null) => (n === null ? "" : n.toFixed(1).replace(".", ","));

export function FormularioEdicao({
  voo,
  socios,
  pilotos,
  aerodromos,
  podeApagar,
}: {
  voo: VooLinha;
  socios: { id: string; apelido: string }[];
  pilotos: { id: string; nome: string }[];
  aerodromos: string[];
  podeApagar: boolean;
}) {
  const [estado, acao] = useActionState(editarVoo, INICIAL);
  const [natureza, setNatureza] = useState<NaturezaVoo>(voo.natureza);
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const usoComum = ehUsoComum(natureza);

  return (
    <div className="space-y-6">
      <form action={acao} className="space-y-4">
        <input type="hidden" name="id" value={voo.id} />
        {estado.mensagem && <Alerta tom={estado.ok ? "ok" : "erro"}>{estado.mensagem}</Alerta>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="data">Data</Label>
            <Input id="data" name="data" type="date" defaultValue={voo.data} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="natureza">Natureza</Label>
            <Select id="natureza" name="natureza" value={natureza} onChange={(e) => setNatureza(e.target.value as NaturezaVoo)}>
              {NATUREZAS.map((n) => (
                <option key={n} value={n}>
                  {ROTULO_NATUREZA[n]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="socio_id">Sócio responsável</Label>
            <Select id="socio_id" name="socio_id" defaultValue={voo.socio_id ?? ""} disabled={usoComum}>
              <option value="">{usoComum ? "Sociedade" : "Escolha…"}</option>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.apelido}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="piloto_id">Piloto</Label>
            <Select id="piloto_id" name="piloto_id" defaultValue={pilotos.find((p) => p.nome === voo.piloto)?.id ?? ""}>
              <option value="">—</option>
              {pilotos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </div>
          <SeletorAerodromo nome="origem" rotulo="Origem" opcoes={aerodromos} valorInicial={voo.origem ?? ""} />
          <SeletorAerodromo nome="destino" rotulo="Destino" opcoes={aerodromos} valorInicial={voo.destino ?? ""} />
          <ListaEscalas opcoes={aerodromos} iniciais={voo.escalas} horasIniciais={voo.horas_pernas} combustivelIniciais={voo.combustivel_pernas} />
          <div className="space-y-1.5">
            <Label htmlFor="horimetro_inicial">Horímetro inicial</Label>
            <Input id="horimetro_inicial" name="horimetro_inicial" inputMode="decimal" defaultValue={dec(voo.horimetro_inicial)} className="tabular" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="horimetro_final">Horímetro final</Label>
            <Input id="horimetro_final" name="horimetro_final" inputMode="decimal" defaultValue={dec(voo.horimetro_final)} className="tabular" />
          </div>
          {voo.horimetro_inicial === null && (
            <div className="space-y-1.5">
              <Label htmlFor="horas_informadas">Horas (sem horímetro)</Label>
              <Input id="horas_informadas" name="horas_informadas" inputMode="decimal" defaultValue={dec(voo.horas)} className="tabular" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="combustivel_inicial_l">Combustível decolagem (L)</Label>
            <Input id="combustivel_inicial_l" name="combustivel_inicial_l" inputMode="decimal" defaultValue={dec(voo.combustivel_inicial_l)} className="tabular" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="combustivel_final_l">Combustível pouso (L)</Label>
            <Input id="combustivel_final_l" name="combustivel_final_l" inputMode="decimal" defaultValue={dec(voo.combustivel_final_l)} className="tabular" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pousos">Pousos</Label>
            <Input id="pousos" name="pousos" type="number" min={0} defaultValue={voo.pousos} className="tabular" />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="pendente_horimetro" defaultChecked={voo.pendente_horimetro} />
            Pendente de conferência do horímetro
          </label>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="observacao">Observação</Label>
          <Textarea id="observacao" name="observacao" defaultValue={voo.observacao ?? ""} />
        </div>

        <Botao />
      </form>

      {podeApagar && (
        <div className="border-t border-marinho-100 pt-4 dark:border-marinho-300">
          {!confirmarApagar ? (
            <Button type="button" variant="fantasma" size="pequeno" onClick={() => setConfirmarApagar(true)}>
              <Trash2 /> Apagar este voo
            </Button>
          ) : (
            <form action={async () => { await apagarVoo(voo.id); }} className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-erro">O voo sai das listas e das horas (fica guardado com quem apagou e quando).</span>
              <Button type="submit" variant="destrutivo" size="pequeno">
                Confirmar
              </Button>
              <Button type="button" variant="secundario" size="pequeno" onClick={() => setConfirmarApagar(false)}>
                Cancelar
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
