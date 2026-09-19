# Especificação — App da Sociedade do RV-10 PP-ZNM

Documento de partida para o Claude Code. Fica na raiz do projeto como `CLAUDE.md`. Peça: "leia a especificação e implemente a Fase 1".

---

## 1. Contexto e objetivo

Sociedade nova de **4 sócios** — **ARTHUR, MARCELINO, CAETANO e WANDERSON**, cotas iguais de 25% — dona de um Van's RV-10, matrícula **PP-ZNM**, baseado em Teixeira de Freitas/BA (**SNTF**). **Nenhum sócio pilota**: quem voa é piloto contratado (cadastro `pilotos`), por conta do sócio que está usando o avião ou da sociedade (decisão do Arthur em 18/09/2026). O controle **começa do zero** com esta sociedade; nada de gestões anteriores entra no app.

Hoje o controle é a planilha `HORAS E COMBUSTÍVEL.xlsx`, aba HORIMETRO: data, sócio, origem, destino, horímetro inicial/final, horas, combustível inicial/final em litros e saldo, mais um resumo de saldo de horas e de combustível por sócio. É simples e já tem furos: voos sem horímetro, horas digitadas à mão, "SÓCIOS" como sócio genérico para uso comum, voo de piloto de fora ("ROBINHO (EXTRA)"), fórmulas quebrando.

Decisões já tomadas pelo Arthur (17/09/2026):

- Cobrança pelo **custo real rateado + fundo de reserva por hora voada** (não há valor fixo por hora).
- **Combustível:** cada um paga o que consome e a regra é **devolver o avião com tanque cheio**. Se não deu para abastecer, o piloto lança combustível inicial e final; a diferença vira débito (usou mais do que abasteceu) ou crédito (deixou mais do que pegou).
- **Agenda:** cada sócio tem direito a uma semana por mês; ordem de escolha por **menos uso**.
- **Uso comum** (translado para revisão, voo de teste, voo de piloto de fora): rateio entre os sócios.
- **Revisão:** itens de troca **por tempo** divididos igualmente; itens **por uso** divididos conforme as horas voadas.

O app substitui a planilha com:

1. **Diário de bordo** — o piloto tira foto do horímetro no início e no fim; o app lê, calcula as horas e já sabe quem estava com o avião.
2. **Agenda** — uma semana por mês por sócio; a ordem de escolha alterna conforme o histórico de uso; o restante do mês é livre.
3. **Despesas e aportes** — todo gasto entra com comprovante e critério de rateio (igual, por horas, direto a um sócio); custo de pouso cruza com quem estava voando naquele dia.
4. **Manutenção** — plano de revisões por horas e por tempo; itens por tempo rateados em partes iguais, itens por uso rateados pelas horas voadas desde a última troca.
5. **Disponibilidade** — quem está com o avião hoje, se ele pode voar (revisão, documentos, seguro) e as próximas semanas.
6. **Fechamento mensal** — extrato por sócio (créditos − débitos = saldo), acerto entre sócios, PDF.

## 2. Usuários e perfis

| Perfil | Quem | Onde usa | Acesso |
|---|---|---|---|
| `admin` | Arthur | notebook e celular | tudo: cadastros, plano de manutenção, fechamento, aprovar despesas, reabrir mês |
| `socio` | os 4 sócios | celular (principal) | vê **tudo** (transparência entre sócios): voos, despesas, extratos de todos, agenda; lança os próprios voos, despesas e aportes; reserva semanas |
| `piloto` | piloto externo, mecânico que faz voo de teste | celular | lança voo e foto de horímetro por conta da sociedade; **não vê valores** |

Regra de ouro: `piloto` nunca enxerga valor, extrato ou aporte. RLS no Supabase, não só filtro na tela. Entre sócios não há segredo: todo sócio vê o extrato dos outros.

## 3. Stack

Mesma do app AMR OBRAS, para reaproveitar código e hábitos:

- **Front:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui. **PWA instalável** — o uso principal é no celular, no hangar, com rede fraca: fila offline para fotos e voos.
- **Back:** Supabase — Postgres (schema em `schema.sql`), Auth (e-mail/senha + link mágico), Storage (buckets `horimetro`, `comprovantes`, `documentos-aeronave`), RLS por perfil, route handlers para leitura de imagem.
- **Leitura de imagem:** API do Claude (visão) para ler o horímetro na foto e os comprovantes (nota de combustível, taxa de pouso, boleto de hangar). Reaproveitar o pipeline de "Lançar nota" do AMR OBRAS (`lib/extracao`, regras de duplicidade, tela de confirmação com imagem à esquerda e campos à direita). A chave da API fica só no servidor.
- **Hospedagem:** Vercel + Supabase. Domínio depois.
- **Idioma/formato:** português do Brasil, `R$ 1.234,56`, datas `DD/MM/AAAA`, horas em **décimos** (`4,4 h`), cadastros em CAIXA ALTA.

## 4. Modelo de dados (resumo — detalhe em `schema.sql`)

### Cadastros
- `aeronaves` — uma só hoje, mas a tabela existe: matrícula, modelo, horímetro atual (calculado do último voo), TBO do motor, capacidade de combustível (L), consumo médio (L/h), **fundo de reserva por hora** (R$/h, com histórico `vigente_desde`).
- `socios` — nome, apelido, CPF, cota (%), ativo desde/até, usuário do Auth. Cotas somam 100%. Sócio que sair um dia fica com `ativo_ate` e histórico preservado.
- `pilotos` — os pilotos contratados (nome, licença, validade). Sócio não é piloto. Remover apaga de vez; voos antigos ficam com `piloto_id` nulo.
- `aerodromos` — ICAO, nome, cidade (SNTF, SDC4, SIVV, SNGI, SNGT, SBSU…). Cadastro cresce sozinho a partir dos voos.
- `fornecedores` — oficinas, hangares, postos, seguradora, despachante: nome, CNPJ/CPF, tipo.
- `categorias_despesa` — fixas: COMBUSTÍVEL, ÓLEO, HANGAR, SEGURO, MANUTENÇÃO, PEÇAS, TAXAS DE POUSO E NAVEGAÇÃO, DOCUMENTAÇÃO, ASSINATURAS E AVIÔNICOS, PILOTO, VIAGEM E DIÁRIAS, OUTROS.

### Diário de bordo
- `voos` — aeronave, data, **sócio responsável** (quem paga: um dos 4 ou `SOCIEDADE`), piloto (quem voou), origem, destino, **horímetro inicial** e **final** (numeric(8,1)), `horas` (calculado: final − inicial), combustível inicial e final (L), pousos (nº, default 1), natureza (`PARTICULAR` | `SOCIEDADE` | `TRANSLADO_MANUTENCAO` | `VOO_TESTE` | `INSTRUCAO`), observação, `foto_horimetro_inicial`, `foto_horimetro_final` (Storage), `leitura_ia` (JSON bruto da leitura), status (`RASCUNHO` | `CONFIRMADO`), autor.
  - **Horímetro inicial = horímetro final do voo anterior.** Se o piloto fotografa um valor diferente, o app avisa "há 0,4 h sem voo registrado entre X e Y" e cria um voo pendente `SOCIEDADE` para o admin resolver. Nada se perde.
  - Voo de natureza `SOCIEDADE`, `TRANSLADO_MANUTENCAO` e `VOO_TESTE` tem as horas divididas em partes iguais entre os sócios ativos para o % de uso, para o fundo de reserva e para o rateio de combustível.
  - Voo de piloto de fora é sempre sócio responsável `SOCIEDADE`.
  - Um voo pode ter **várias pernas** no mesmo dia: cada perna é um `voo`; a foto do horímetro só é obrigatória na primeira inicial e na última final do dia. A leitura de horímetro intermediária pode ser digitada.
- `abastecimentos` — data, aeródromo, litros, valor, quem pagou (sócio ou caixa), comprovante, voo relacionado (opcional). Gera `despesa` da categoria COMBUSTÍVEL automaticamente.

### Financeiro
- `despesas` — data, descrição, fornecedor, categoria, valor, comprovante (Storage), **pagador** (`socio_id` ou `CAIXA`), **critério de rateio**: `IGUAL` (cotas), `POR_HORAS` (proporção das horas do período de referência), `DIRETO` (um sócio só), `MANUAL` (% digitados que fecham 100%), período de referência (para POR_HORAS: mês, trimestre ou "desde a última execução do item de manutenção"), status (`PENDENTE` | `APROVADA` | `RATEADA`), voo relacionado (opcional), manutenção relacionada (opcional), autor. Regras:
  - **Custo de pouso, taxa de navegação, hangar de pernoite:** ao lançar, o app procura o voo daquele aeródromo naquela data (± 1 dia) e sugere `DIRETO` ao sócio responsável. Se não acha, fica `PENDENTE` na fila "a classificar".
  - **Combustível — regra do tanque cheio.** Quem usa o avião abastece o que consumiu e devolve com tanque cheio; nesse caso o abastecimento é despesa `DIRETO` de quem pagou e não entra em rateio. Quando não dá para abastecer, o piloto lança o combustível inicial e final do voo (litros); a diferença entre o que pegou e o que deixou vira o **saldo de combustível** do sócio (negativo = usou mais do que abasteceu; positivo = deixou crédito). No fechamento, o saldo em litros é valorado pelo **preço médio dos abastecimentos do mês** e vira débito ou crédito no extrato. Voo de natureza `SOCIEDADE` divide o consumo em partes iguais. É o "saldo de combustível" da planilha, só que em reais e sem digitação.
  - **Seguro, hangar mensal, assinaturas, despachante, piloto contratado pela sociedade:** `IGUAL`.
  - **Manutenção:** vem de `manutencao_itens` (abaixo), nunca digitada solta.
  - Despesa paga por sócio vira **crédito** no extrato dele pelo valor inteiro e **débito** em cada um (inclusive ele) pela parte rateada.
- `rateios` — despesa, sócio, percentual, valor, horas de base (quando POR_HORAS). Gerado pelo app; recalculado enquanto o mês está aberto; congelado no fechamento.
- `aportes` — sócio, data, valor, comprovante, descrição. Crédito no extrato do sócio; entrada no caixa da sociedade.
- `caixa_movimentos` — entradas (aportes) e saídas (despesas pagas pelo caixa), saldo. Conciliação com extrato bancário (CSV/OFX) na fase 4.
- `fundo_reserva_movimentos` — **obrigatório**: `aeronaves.fundo_reserva_por_hora` × horas de cada sócio no mês (inclusive a parte dele nos voos `SOCIEDADE`) vira débito no extrato do sócio e crédito no fundo; saídas quando uma manutenção grande (motor, hélice) é paga pelo fundo. Saldo do fundo aparece no painel. Trocar o valor por hora não altera meses fechados.
- `fechamentos` — mês, status (`ABERTO` | `FECHADO`), fechado por/em, horímetro no fim do mês, horas por sócio no mês, saldo por sócio, PDF gerado. Mês fechado não aceita voo nem despesa com data dentro dele sem o admin reabrir (auditado).
- **Extrato do sócio** (view `v_extrato_socio`): créditos (aportes + despesas que ele pagou + combustível que deixou a mais) − débitos (rateios + combustível que usou a mais + fundo de reserva) = **saldo**. Saldo positivo = a sociedade deve a ele; negativo = ele deve à sociedade. O "acerto" do mês mostra quem transfere quanto para quem.

### Agenda
- `semanas` — geradas pelo app para cada mês: 4 (ou 5) semanas de segunda a domingo. Cada uma tem `socio_id` (titular) ou fica livre.
- `escolha_semanas` — por mês: ordem de escolha, quem escolheu qual semana e quando. **Regra da ordem:** menos horas voadas nos últimos 3 meses escolhe primeiro; empate → quem escolheu por último no mês anterior fica atrás. O app abre a escolha no **dia 15 do mês anterior** e avisa cada sócio na vez dele (notificação push; WhatsApp na fase 4); quem não escolher em 48 h passa a vez e escolhe depois entre o que sobrou. Sócio pode abrir mão da semana, que volta ao pool; semana não usada não acumula.
- `reservas` — sócio, início, fim (data e hora), destino/motivo, status (`CONFIRMADA` | `CANCELADA`), origem (`SEMANA` = a semana titular; `LIVRE` = dia sem titular; `CEDIDA` = titular cedeu). Fora da semana titular vale ordem de chegada; dentro, só o titular ou quem ele ceder.
- `bloqueios` — aeronave indisponível: manutenção programada, documento vencido, avião fora da base. Bloqueio vence reserva e avisa quem tinha reserva.

### Manutenção
- `plano_manutencao` — itens do plano: descrição (TROCA DE ÓLEO E FILTRO, REVISÃO 100 H, IAM/ANUAL, VELAS, PNEUS, BATERIA, ELT, TRANSPONDER, SEGURO, REVISÃO HÉLICE…), gatilho `POR_HORAS` (intervalo em horas), `POR_TEMPO` (intervalo em meses) ou `AMBOS` (o que vencer primeiro), última execução (data e horímetro), tolerância de aviso (ex.: 10 h / 30 dias antes). Próxima execução calculada.
- `manutencoes` — a ida à oficina: data início/fim, oficina, horímetro, descrição, voo de translado e voo de teste (ligados), status (`PROGRAMADA` | `EM_OFICINA` | `CONCLUIDA`).
- `manutencao_itens` — cada linha da nota da oficina, ligada a um item do plano (opcional): descrição, valor, **tipo do custo**: `POR_TEMPO` (rateio `IGUAL`) ou `POR_USO` (rateio `POR_HORAS` **desde a última execução daquele item** — as horas de cada sócio entre a troca anterior e esta), ou `IGUAL` para o que não é nem um nem outro (mão de obra de deslocamento, taxa de hangar da oficina). Cada item vira uma `despesa` com o critério certo. Concluir a manutenção atualiza `plano_manutencao.ultima_execucao` dos itens executados.

### Documentos da aeronave
- `documentos_aeronave` — tipo (CA/CVA, SEGURO RETA, IAM, LICENÇA DE ESTAÇÃO…), número, emissão, vencimento, arquivo. Vencido = bloqueio automático na agenda e alerta no painel.

## 5. Telas

**Celular (todos os sócios) — PWA**
1. **Início** — avião disponível hoje? (quem está com ele, próxima revisão em X h / Y dias, documentos ok), meu saldo, minhas horas no mês, próximas reservas, pendências (voo sem horímetro final, despesa sem comprovante, minha vez de escolher a semana).
2. **Registrar voo** — em 3 toques: (1) foto do horímetro inicial → o app lê o número e confirma que bate com o último voo; (2) origem/destino (últimos usados primeiro) e sócio responsável (já preenchido com quem está logado ou com o titular da semana); (3) no pouso, foto do horímetro final → horas calculadas, combustível final. Salva como rascunho se não tiver sinal.
3. **Abastecer / lançar despesa** — foto do comprovante → o app lê fornecedor, valor, litros, data → sugere categoria e rateio → confirma. Custo de pouso cruza com o voo do dia.
4. **Agenda** — mês com as semanas coloridas por sócio, dias livres, bloqueios; escolher minha semana quando for minha vez; reservar dia livre; ceder semana.
5. **Extratos** — o meu e o dos outros: lançamentos, saldo, acerto do mês.
6. **Aportar** — valor, data, comprovante.

**Notebook (admin)**
7. **Painel** — horas por sócio (mês, trimestre, acumulado, % de uso), custo por sócio, caixa, fundo de reserva, próximas revisões, documentos a vencer, fila "a classificar".
8. **Voos** — tabela com filtros (sócio, período, natureza, aeródromo), edição, buraco de horímetro destacado, exportação Excel no layout da aba HORIMETRO.
9. **Despesas** — tabela com filtros, aprovar, mudar rateio, exportação Excel.
10. **Manutenção** — plano (próximas execuções), histórico, lançar nota da oficina item a item com o tipo do custo.
11. **Fechamento do mês** — resumo por sócio (horas, créditos, débitos, saldo), combustível (litros × preço médio), fundo de reserva, acerto sugerido, botão "Fechar mês" e PDF (linhas + colunas por sócio + resumo).
12. **Cadastros** — sócios, pilotos, aeródromos, fornecedores, plano de manutenção, documentos da aeronave.

## 6. Leitura do horímetro por foto

- Foto tirada pelo PWA (câmera direta) ou galeria. Enviada ao route handler `/api/horimetro` que chama o Claude (visão) com prompt que devolve `{"leitura": 1131.7, "confianca": 0.0-1.0, "legivel": true, "observacao": ""}`. O horímetro mostra horas com um décimo (ex.: `1127.3`).
- Regras: nunca inventar; se ilegível, devolver `legivel: false` e o app pede outra foto ou digitação manual (com a foto guardada mesmo assim). Leitura com confiança < 0,8 fica amarela na tela de confirmação. O valor final é sempre o que o piloto confirmou; a leitura bruta fica em `voos.leitura_ia` para auditoria.
- Foto guardada com nome `AAAA-MM-DD - HORIMETRO - [INICIAL|FINAL] - [SOCIO] - [LEITURA]`.
- Conjunto de teste: 20 fotos reais de horímetro (com reflexo, de noite, torta) com o valor esperado, rodado a cada mudança no prompt.

## 7. Migração dos dados atuais

Só a `HORAS E COMBUSTÍVEL.xlsx`, aba HORIMETRO:

1. Cada linha vira um `voo`. Linha sem horímetro entra com as horas digitadas e fica marcada `PENDENTE_HORIMETRO` (o admin completa ou aceita). "SÓCIOS" vira natureza `SOCIEDADE`; "ROBINHO (EXTRA)" vira piloto externo com sócio responsável `SOCIEDADE`; a linha "TRANSLADO DA AERONAVE, VOO TESTE PILOTO" vira `TRANSLADO_MANUTENCAO`.
2. Combustível inicial/final vira o saldo de tanque de cada voo; o resumo de saldo de combustível por sócio da planilha é a conferência.
3. Aportes e despesas até aqui são lançados no app à mão pelo Arthur (não há planilha a importar).
4. `CONFERENCIA_IMPORTACAO.xlsx`: horas por sócio e saldo de combustível por sócio batem com o resumo da aba HORIMETRO.

## 8. Fases de entrega

| Fase | Entrega | Critério de pronto |
|---|---|---|
| 1 | Auth + perfis, cadastros, **registrar voo com foto do horímetro** (leitura por IA, validação de continuidade), abastecimento e despesa com comprovante e rateio, aportes, fundo de reserva, extrato por sócio, importação da planilha, exportação Excel | Os 4 sócios registram voo pelo celular; a planilha HORAS E COMBUSTÍVEL deixa de ser usada |
| 2 | Agenda: semanas, ordem de escolha pelo histórico, reservas, bloqueios, disponibilidade no início; notificação push | Semana do mês é escolhida no app, sem grupo de WhatsApp |
| 3 | Manutenção: plano por horas/tempo, execução com nota da oficina item a item e rateio por tipo, documentos da aeronave com vencimento | Revisão fechada no app com cada sócio sabendo sua parte |
| 4 | Fechamento mensal com PDF, acerto entre sócios, conciliação bancária, leitura de comprovantes por IA, WhatsApp | Mês fecha sem planilha e sem retrabalho |

## 9. Regras que o Claude Code deve seguir

- Nunca apagar: soft-delete (`deleted_at`) com auditoria em voos, despesas, aportes e rateios.
- Valores em `numeric(14,2)`; horímetro e horas em `numeric(8,1)`; litros em `numeric(8,1)`; nunca `float`.
- Cadastros em CAIXA ALTA, sem espaços duplos.
- Validações no banco (constraints: final ≥ inicial, percentuais somam 100, mês fechado bloqueia) e na tela.
- Cada listagem exporta para Excel.
- Testes mínimos: importação bate horas e saldo de combustível; RLS impede `piloto` de ler `despesas`/`aportes`; continuidade de horímetro; rateio POR_HORAS fecha 100%; 20 fotos de horímetro.
- Chave da API do Claude só no servidor.
- Commits pequenos por funcionalidade; preview na Vercel a cada PR.
- **Migration antes do deploy, nunca depois.** Depois de rodar, `notify pgrst, 'reload schema';`.
- **Uma tabela só pode ter UMA chave estrangeira para cada outra tabela que o app embute** (PostgREST recusa embutir com duas FKs). `manutencoes` referencia `voos` duas vezes (translado e teste): guardar sem FK e validar no código, ou nomear a relação em toda consulta.
- Verificação acessória não barra o caminho principal: se a leitura da foto falhar, o piloto digita; se a busca do voo do pouso falhar, a despesa fica pendente. O que barra é problema confirmado, nunca erro de infraestrutura.

## 10. Estado da implementação (Fase 1 — 17/09/2026)

- `db/schema.sql` — tabelas, views, funções e RLS da Fase 1. Rodar no SQL Editor; idempotente.
- Combustível sem leitura no voo: consumo **estimado** por `aeronaves.consumo_medio_lh × horas` (marcado `tem_estimativa` no extrato). Saldo do sócio = litros que abasteceu − litros que consumiu, valorado pelo preço médio do mês (ou do último mês com abastecimento).
- Abastecimento vira despesa COMBUSTÍVEL automaticamente (trigger): `DIRETO` de quem pagou, `IGUAL` se foi o caixa. Despesa DIRETO paga pelo próprio sócio não entra no extrato (é custo dele sem passar pela sociedade); entra no custo por sócio.
- Rateio calculado no banco (`calcular_rateio`) a cada despesa; `POR_HORAS` recalcula quando entra voo no período (trigger em `voos`). Rateio `MANUAL` pela RPC `definir_rateio_manual`. Centavos fecham na maior parte.
- Fundo de reserva provisionado por sócio/mês a cada voo (`provisionar_fundo_reserva`); mês fechado congela.
- `despesas` tem DUAS FKs para `socios` (pagador e direto): toda consulta nomeia a relação (`socios!despesas_pagador_socio_id_fkey`). Não criar uma terceira.
- Buraco de horímetro (inicial do voo > final do último): entra um voo `SOCIEDADE` pendente com a diferença, para o admin resolver.
- Leitura do horímetro: `lib/horimetro/ler.ts` (Claude, ferramenta `registrar_horimetro`), rota `/api/horimetro`. Confiança < 0,8 fica amarela; falha cai na digitação.
- Login novo: `npm run criar-usuario -- email senha "NOME" socio` (vincula ao sócio de mesmo apelido). Importação: `npm run importar-horimetro -- "<xlsx>" --gravar`. RLS: `npm run verificar-rls`.

## 10b. Fase 2 — Agenda (18/09/2026)

- `db/schema_v2_agenda.sql`: `semanas`, `escolha_semanas`, `reservas`, `bloqueios`, view `v_agenda_dia`; funções `abrir_escolha`, `vez_de_escolher`, `escolher_semana`, `ceder_semana`, `reservar`. Tudo pelas RPCs (security definer, `auth.uid()` → sócio).
- A escolha abre sozinha: qualquer sócio que abrir Início/Agenda dispara `abrir_escolha` do mês corrente e, do dia 15 em diante, do mês seguinte. Sem cron ainda.
- Prazo de 48 h por vez; vencido, `vez_de_escolher` marca `pulado` e passa. Pulado escolhe depois entre o que sobrou.
- Semana com reserva de outro sócio feita antes não pode ser escolhida (bloqueio no `escolher_semana`).
- `semanas` tem DUAS FKs para `socios` (titular e cedida_por): consulta nomeia `socios!semanas_socio_id_fkey`.
- Notificação push ficou para depois (precisa de service worker + VAPID); o aviso "é a sua vez" aparece no Início.

## 10c. Fase 3 — Manutenção e aeródromos (18/09/2026)

- `db/schema_v3_manutencao.sql`: `plano_manutencao` (+ view `v_plano_status`), `plano_execucoes` (histórico; a base do "desde a última troca"), `manutencoes`, `manutencao_itens`, `documentos_aeronave` (+ `v_documentos_status`), coluna `despesas.pago_pelo_fundo`.
- Item da nota vira despesa por gatilho: POR_USO → POR_HORAS entre a execução anterior do item e a ENTRADA na oficina (`data_inicio`; voo de teste durante a revisão fica fora — schema_v5b); POR_TEMPO/IGUAL → IGUAL; pago pelo fundo → sem rateio + saída em `fundo_reserva_movimentos`.
- Manutenção PROGRAMADA/EM_OFICINA cria bloqueio MANUTENCAO na agenda; `concluir_manutencao` (admin) grava execuções, atualiza o plano, reprocessa os itens e encerra o bloqueio na data real.
- Documento vencido (`documento_vencido_em`) barra `reservar` e aparece no Início. Bucket `documentos-aeronave` (admin grava).
- `manutencoes.voo_translado_id`/`voo_teste_id` são ponteiros sem FK (validados no código).
- Aeródromos: `db/schema_v3b_aerodromos.sql` amplia a tabela (UF, tipo, coordenadas, pista) e cria `buscar_aerodromos`; `npm run importar-aerodromos` carrega as listas da ANAC em `dados/aerodromos/*.csv` (4.349 em 18/09/2026). O seletor de aeródromo busca em `/api/aerodromos?q=` (ICAO, nome ou cidade) — sem `<datalist>`, que o iPhone não mostra.
- Constantes usadas nos dois lados ficam em `lib/manutencao-constantes.ts` (sem `server-only`).

## 10d. Fase 4 (18/09/2026)

- **Fechamento** (`db/schema_v4_fechamento.sql`): `resumo_mes`, `pendencias_mes`, `linhas_mes`, `fechar_mes` (só mês terminado; voo sem pouso bloqueia; grava o resumo em `fechamentos.resumo`), `reabrir_mes` (auditado em `historico`). Tela `/fechamento` com acerto sugerido (casamento guloso devedor × credor pelo saldo acumulado) e `/fechamento/[mes]/imprimir` (PDF pelo "Salvar em PDF" do navegador).
- **Comprovante por foto** (`lib/comprovante/ler.ts`, rota `/api/comprovante`): fornecedor, CNPJ, data, valor, litros, categoria, ICAO. Preenche despesa e abastecimento; leitura acessória.
- **Escalas** (`db/schema_v4b_escalas.sql`): `voos.escalas text[]`; pousos = escalas + 1 (ajustável). Trecho `SNTF → SDIY → SIFC` em listas, Excel e PDF.
- **Conciliação** (`db/schema_v4c_conciliacao.sql`): `extrato_banco` (FITID único por conta), `sugestoes_extrato` (mesmo valor ± 5 dias), `conciliar_linha`, `ignorar_linha`, `desfazer_conciliacao`. Leitores: `lib/ofx.ts` (do AMR) e `lib/extrato-csv.ts`. Linha sem par vira despesa do caixa ou aporte direto da tela.
- Pilotos: nenhum sócio pilota; lixeira apaga (voos antigos ficam sem piloto), botão inativar/reativar para os contratados.
- Scripts com `@/`: `node --experimental-strip-types --import ./scripts/alias.mjs`.
- Ficou para depois: WhatsApp (resumo do mês para os sócios) e push "é a sua vez".

## 11. Pendências (não travam a Fase 1 — implementar com a assunção indicada)

1. **Valor do fundo de reserva por hora** — assumir R$ 150/h até o admin definir na tela de cadastro da aeronave.
2. **Semana** — assumir segunda a domingo; janela de "menos uso" para a ordem de escolha: últimos 3 meses.
3. Nome do app e da sociedade para a identidade visual.

## 10e. Tanque do hangar, piloto e ciclo das revisões (19/09/2026)

- **Tanque de 2.000 L** (`db/schema_v6_tanque.sql`): `tanque_movimentos` (COMPRA / RETIRADA / AJUSTE), views `v_tanque_saldo`, `v_tanque_movimentos`, `v_tanque_socio_mes`, `preco_tanque_em`. COMPRA vira despesa COMBUSTÍVEL **sem rateio** (`despesas.tanque = 'COMPRA'`; crédito de quem pagou, saída do caixa se foi o caixa). RETIRADA vira `abastecimentos` de `origem = 'TANQUE'` valorado pelo preço médio das compras até a data, e a despesa é DIRETO ao sócio (ou IGUAL para a sociedade) **paga pelo caixa mas fora de `v_caixa`** (`despesas.tanque = 'RETIRADA'`). Tela `/combustivel` (menu "Combustível"); abastecimento em posto continua em `/abastecimentos/novo`.
- `v_combustivel_socio_mes`: abastecimento pago pelo caixa divide os litros entre os sócios (antes cobrava duas vezes o consumo dos voos da sociedade).
- `v_extrato_socio` (`schema_v6b`): despesa DIRETO paga pelo caixa entra como débito do sócio (`is not distinct from` — o `=` com pagador nulo descartava a linha).
- **Piloto contratado** (`schema_v5c`): `pilotos.usuario_id`; sessão traz `pilotoId`; o piloto escolhe natureza e sócio do voo, o campo piloto é ele; menu só Início / Registrar voo / Voos; Início não mostra horas por sócio. Convite por e-mail: `npm run convidar -- email "NOME" socio|piloto` (Supabase manda o link; Site URL = https://ppznm.vercel.app). O SMTP padrão do Supabase tem limite de poucos e-mails por hora.
- **Ciclo das revisões** (`schema_v5`, `schema_v5b`): item REVISÃO 50 H; `plano_execucoes` guarda marco 26/06/2026 e a revisão de 100 h (08–15/09/2026, em `manutencoes`, sem itens ainda). Início tem abas Mês / Trimestre / Revisão 50 h / Revisão 100 h, com o bloco "última revisão" (`ciclosRevisao`). Período POR_USO fecha na entrada da oficina.

## 10f. Piloto opera, reembolsos e avisos push (19/09/2026)

- `db/schema_v6c_piloto_operacao.sql`: piloto lança RETIRADA no tanque (sem ler a tabela; `tanque_saldo_litros`, `tanque_retiradas_recentes` security definer), programa/atualiza/conclui `manutencoes` (`concluir_manutencao` aceita piloto; nota e plano seguem do admin), agenda só leitura. Menu PILOTO: Início, Registrar voo, Voos, Combustível, Reembolsos, Agenda, Manutenção.
- **Reembolso ao piloto**: `despesas.reembolso_piloto_id` + `reembolsado_em/por`; despesa DIRETO do sócio paga por ele (custo dele, fora do extrato) com o piloto que adiantou; RLS `despesas_piloto_ler/lancar` (só as dele, via `meu_piloto_id()`); RPC `marcar_reembolsado` (sócio que deve, piloto ou admin). Tela `/reembolsos` (piloto lança; sócio vê o que deve; Início avisa). Bucket `comprovantes`: qualquer logado grava.
- **Agenda**: `reservar(..., p_socio)` — admin reserva em nome de outro sócio; `editar_reserva` (quem reservou ou admin); `conferir_reserva` concentra as checagens. Formulário "Em nome de" e "editar" por reserva.
- **Push** (`web-push`): `public/sw.js` (fora do middleware), `push_inscricoes`, rota `/api/push/inscrever`, `components/ativar-avisos.tsx` (botão no Início), `lib/push.ts` `notificar({usuarios|perfis}, aviso)`. Dispara: reserva feita/alterada/cancelada e semana escolhida → pilotos; reembolso lançado → o sócio. Env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (na Vercel desde 19/09). Testado no celular do Arthur em 19/09/2026.
- Convites: Caetano, Wanderson, Marcelino (sócios) e Giuliano (piloto) enviados em 19/09/2026 via `npm run convidar`.

## 10g. Regras da agenda (19/09/2026) e instalação

- `db/schema_v7_regras_agenda.sql`: `semanas.tipo` (SEMANA seg–qui / FDS sex–dom; as semanas antigas viraram dois blocos), `escolha_semanas.fds_id`/`dias_base`; fila por **dias reservados + horas voadas** (`dias_reservados_por_socio`); `reservas.pendente`/`feriado`, `reserva_respostas`, `feriados` (2026–27), `responder_pedido` (qualquer "preciso" cancela; todos "concordo" confirma), `resolver_pedidos` (dia comum: 48 h sem objeção → confirma; chamado em `garantirEscolhaAberta`, que avisa piloto e dono), `conferir_reserva` (60 dias, sem sobreposição), `dentro_dos_blocos`, `trocas` + `propor_troca`/`responder_troca` (mesmo tipo; inverte blocos, reservas e a fila). `v_agenda_dia` ignora pendentes.
- Tela `/agenda`: alerta da vez pede semana e fim de semana; cards "Pedidos aguardando" (Concordo / Preciso) e "Trocas propostas"; "trocar com…" em cada bloco meu (`seletor-troca.tsx`); regras escritas no fim.
- `/instalar` (pública, fora do middleware): Android com `beforeinstallprompt`, iPhone passo a passo; link no login e no menu.
- Links de acesso pessoais: `npm run link-acesso -- <email>` → `/auth/definir-senha#th=<hashed_token>` (token no fragmento: a prévia do WhatsApp gastava o link `auth/v1/verify`). Validade = "Email OTP Expiration" do Auth (12 h desde 19/09).
- `schema_v7b`: bloco livre reservado por sócio com o direito daquele tipo ainda não usado no mês vira dele na hora (`assumir_blocos_livres`, chamado em `reservar`/`editar_reserva`); pedido só quando o direito já foi usado.
