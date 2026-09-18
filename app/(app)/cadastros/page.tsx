import type { Metadata } from "next";

import { exigirSessao } from "@/lib/perfil";
import { criarClienteServidor } from "@/lib/supabase/server";
import { aeronaveAtiva, listarAerodromos, listarFornecedores, listarSocios } from "@/lib/dados/cadastros";
import { ROTULO_PERFIL, type Perfil } from "@/lib/tipos";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FormularioAcao } from "@/components/formulario-acao";
import { BotoesPiloto } from "./botoes-piloto";
import { salvarAerodromo, salvarAeronave, salvarFornecedor, salvarPiloto, salvarSocio, salvarUsuario } from "./acoes";

export const metadata: Metadata = { title: "Cadastros" };

const dec = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

export default async function PaginaCadastros() {
  const usuario = await exigirSessao();
  const admin = usuario.perfil === "admin";
  const supabase = await criarClienteServidor();

  const [aeronave, socios, fornecedores, aerodromos, { data: usuarios }, { data: pilotos }] = await Promise.all([
    aeronaveAtiva(),
    listarSocios(),
    listarFornecedores(),
    listarAerodromos(),
    admin ? supabase.from("usuarios").select("id, nome, perfil, ativo").order("nome") : Promise.resolve({ data: [] as { id: string; nome: string; perfil: Perfil; ativo: boolean }[] }),
    supabase.from("pilotos").select("id, nome, socio_id, licenca, validade_licenca, ativo").order("nome"),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Cadastros</h1>
        <p className="mt-1 text-sm text-marinho-300">
          {admin ? "Aeronave, sócios, usuários, pilotos, fornecedores e aeródromos." : "Só o administrador altera sócios e aeronave. Você pode cadastrar fornecedor e aeródromo."}
        </p>
      </div>

      {/* Aeronave */}
      <Card>
        <CardHeader>
          <CardTitle>Aeronave</CardTitle>
          <CardDescription>Consumo médio é o que estima o combustível quando o piloto não lê o tanque. O fundo de reserva por hora vale deste mês em diante.</CardDescription>
        </CardHeader>
        <CardContent>
          {admin ? (
            <FormularioAcao acao={salvarAeronave} className="grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={aeronave.id} />
              <Campo nome="matricula" rotulo="Matrícula" valor={aeronave.matricula} />
              <Campo nome="modelo" rotulo="Modelo" valor={aeronave.modelo} />
              <Campo nome="base_icao" rotulo="Base (ICAO)" valor={aeronave.base_icao ?? ""} />
              <Campo nome="fundo_reserva_por_hora" rotulo="Fundo de reserva (R$/h)" valor={dec(aeronave.fundo_reserva_por_hora)} />
              <Campo nome="capacidade_combustivel_l" rotulo="Tanque (L)" valor={dec(aeronave.capacidade_combustivel_l)} />
              <Campo nome="consumo_medio_lh" rotulo="Consumo médio (L/h)" valor={dec(aeronave.consumo_medio_lh)} />
              <Campo nome="tbo_motor_horas" rotulo="TBO motor (h)" valor={dec(aeronave.tbo_motor_horas)} />
            </FormularioAcao>
          ) : (
            <p className="text-sm">
              {aeronave.matricula} · {aeronave.modelo} · base {aeronave.base_icao} · fundo de reserva R$ {dec(aeronave.fundo_reserva_por_hora)}/h · consumo médio {dec(aeronave.consumo_medio_lh)} L/h
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sócios */}
      <Card>
        <CardHeader>
          <CardTitle>Sócios</CardTitle>
          <CardDescription>Cotas somam 100 %. Vincule cada sócio ao usuário de login para o app saber quem está voando.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {socios.map((s) => (
            <details key={s.id} className="rounded border border-marinho-100 p-3 dark:border-marinho-300">
              <summary className="flex cursor-pointer items-center gap-3">
                <span className="size-3 rounded-full" style={{ background: s.cor }} />
                <span className="font-semibold">{s.apelido}</span>
                <span className="text-sm text-marinho-300">
                  {s.nome} · {String(s.cota).replace(".", ",")} %
                </span>
                {s.ativo_ate && <Badge variant="neutro">saiu em {s.ativo_ate.split("-").reverse().join("/")}</Badge>}
                {!s.usuario_id && admin && <Badge variant="atencao">sem login vinculado</Badge>}
              </summary>
              {admin && (
                <div className="mt-3">
                  <FormularioAcao acao={salvarSocio} className="grid gap-3 sm:grid-cols-4">
                    <input type="hidden" name="id" value={s.id} />
                    <Campo nome="nome" rotulo="Nome" valor={s.nome} />
                    <Campo nome="apelido" rotulo="Apelido" valor={s.apelido} />
                    <Campo nome="cpf" rotulo="CPF" valor="" />
                    <Campo nome="cota" rotulo="Cota (%)" valor={dec(s.cota)} />
                    <div className="space-y-1">
                      <Label htmlFor={`cor-${s.id}`} className="text-xs">
                        Cor
                      </Label>
                      <Input id={`cor-${s.id}`} name="cor" type="color" defaultValue={s.cor} className="h-10 p-1" />
                    </div>
                    <Campo nome="ativo_desde" rotulo="Sócio desde" valor={s.ativo_desde} tipo="date" />
                    <Campo nome="ativo_ate" rotulo="Saiu em" valor={s.ativo_ate ?? ""} tipo="date" />
                    <div className="space-y-1">
                      <Label htmlFor={`usr-${s.id}`} className="text-xs">
                        Usuário de login
                      </Label>
                      <Select id={`usr-${s.id}`} name="usuario_id" defaultValue={s.usuario_id ?? ""}>
                        <option value="">—</option>
                        {(usuarios ?? []).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nome}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </FormularioAcao>
                </div>
              )}
            </details>
          ))}
          {admin && (
            <details className="rounded border border-dashed border-marinho-300 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-laranja-700">+ Novo sócio</summary>
              <div className="mt-3">
                <FormularioAcao acao={salvarSocio} className="grid gap-3 sm:grid-cols-4" rotulo="Cadastrar">
                  <Campo nome="nome" rotulo="Nome" valor="" />
                  <Campo nome="apelido" rotulo="Apelido" valor="" />
                  <Campo nome="cota" rotulo="Cota (%)" valor="25" />
                  <Campo nome="ativo_desde" rotulo="Sócio desde" valor="" tipo="date" />
                </FormularioAcao>
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* Usuários */}
      {admin && (
        <Card>
          <CardHeader>
            <CardTitle>Usuários</CardTitle>
            <CardDescription>
              Login novo: <code className="rounded bg-areia-200 px-1 dark:bg-marinho-700">npm run criar-usuario -- email senha &quot;NOME&quot; socio</code> no computador, ou convite pelo painel do Supabase.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(usuarios ?? []).map((u) => (
              <FormularioAcao key={u.id} acao={salvarUsuario} className="grid items-end gap-3 sm:grid-cols-5">
                <input type="hidden" name="id" value={u.id} />
                <Campo nome="nome" rotulo="Nome" valor={u.nome} />
                <div className="space-y-1">
                  <Label className="text-xs">Perfil</Label>
                  <Select name="perfil" defaultValue={u.perfil}>
                    {(Object.keys(ROTULO_PERFIL) as Perfil[]).map((p) => (
                      <option key={p} value={p}>
                        {ROTULO_PERFIL[p]}
                      </option>
                    ))}
                  </Select>
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input type="checkbox" name="ativo" defaultChecked={u.ativo} /> ativo
                </label>
                <p className="pb-2 text-xs text-marinho-300">{socios.find((s) => s.usuario_id === u.id)?.apelido ?? "não é sócio"}</p>
              </FormularioAcao>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pilotos */}
      <Card>
        <CardHeader>
          <CardTitle>Pilotos</CardTitle>
          <CardDescription>Os pilotos que voam o avião. Remover apaga o cadastro; os voos antigos dele ficam sem piloto.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="grid gap-2 sm:grid-cols-2">
            {(pilotos ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className="font-semibold">{p.nome}</span>
                {p.licenca && <span className="text-marinho-300">{p.licenca}</span>}
                {!p.ativo && <Badge variant="erro">inativo</Badge>}
                {admin && <BotoesPiloto id={p.id} ativo={p.ativo} nome={p.nome} />}
              </li>
            ))}
          </ul>
          {admin && (
            <details className="rounded border border-dashed border-marinho-300 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-laranja-700">+ Piloto</summary>
              <div className="mt-3">
                <FormularioAcao acao={salvarPiloto} className="grid gap-3 sm:grid-cols-4" rotulo="Cadastrar">
                  <Campo nome="nome" rotulo="Nome" valor="" />
                  <Campo nome="licenca" rotulo="Licença (CANAC)" valor="" />
                  <Campo nome="validade_licenca" rotulo="Validade" valor="" tipo="date" />
                </FormularioAcao>
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* Fornecedores */}
      {usuario.perfil !== "piloto" && (
        <Card>
          <CardHeader>
            <CardTitle>Fornecedores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="grid gap-1 text-sm sm:grid-cols-3">
              {fornecedores.map((f) => (
                <li key={f.id}>
                  {f.nome} <span className="text-marinho-300">{f.tipo}</span>
                </li>
              ))}
              {fornecedores.length === 0 && <li className="text-marinho-300">Nenhum ainda — o primeiro entra pela despesa ou aqui.</li>}
            </ul>
            <details className="rounded border border-dashed border-marinho-300 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-laranja-700">+ Fornecedor</summary>
              <div className="mt-3">
                <FormularioAcao acao={salvarFornecedor} className="grid gap-3 sm:grid-cols-4" rotulo="Cadastrar">
                  <Campo nome="nome" rotulo="Nome" valor="" />
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select name="tipo" defaultValue="PJ">
                      <option value="PJ">PJ</option>
                      <option value="PF">PF</option>
                    </Select>
                  </div>
                  <Campo nome="cpf_cnpj" rotulo="CPF/CNPJ" valor="" />
                  <Campo nome="cidade" rotulo="Cidade" valor="" />
                </FormularioAcao>
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      {/* Aeródromos */}
      <Card>
        <CardHeader>
          <CardTitle>Aeródromos</CardTitle>
          <CardDescription>Entram sozinhos a partir dos voos; aqui dá para pôr nome e cidade.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="grid gap-1 text-sm sm:grid-cols-4">
            {aerodromos.map((a) => (
              <li key={a.icao}>
                <span className="font-semibold tracking-wider">{a.icao}</span> <span className="text-marinho-300">{a.nome ?? ""}</span>
              </li>
            ))}
          </ul>
          <details className="rounded border border-dashed border-marinho-300 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-laranja-700">+ Aeródromo</summary>
            <div className="mt-3">
              <FormularioAcao acao={salvarAerodromo} className="grid gap-3 sm:grid-cols-4" rotulo="Salvar">
                <Campo nome="icao" rotulo="ICAO" valor="" />
                <Campo nome="nome" rotulo="Nome" valor="" />
                <Campo nome="cidade" rotulo="Cidade" valor="" />
              </FormularioAcao>
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}

function Campo({ nome, rotulo, valor, tipo = "text" }: { nome: string; rotulo: string; valor: string; tipo?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`${nome}-${valor}`} className="text-xs">
        {rotulo}
      </Label>
      <Input id={`${nome}-${valor}`} name={nome} type={tipo} defaultValue={valor} className={tipo === "text" ? "uppercase" : undefined} />
    </div>
  );
}
