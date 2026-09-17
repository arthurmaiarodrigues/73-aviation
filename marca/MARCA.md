# Identidade visual — 73 Aviation (PP-ZNM · RV-10)

A logo é um selo: avião visto de cima, "73" em bloco, "AVIATION" espaçado, matrícula em laranja. Três cores, nada mais. O app precisa ser legível no hangar, no sol, com uma mão só.

## Cores (medidas das artes enviadas em 17/09/2026)

| Token | Hex | Uso |
|---|---|---|
| `marinho` | `#0E2846` | Barra lateral, cabeçalho, texto principal no claro, fundo do escuro |
| `laranja` | `#E4782A` | Único acento: botão primário, item ativo, destaque de número (matrícula) |
| `areia` | `#F3EFE8` | Fundo do tema claro, texto sobre marinho |

Derivadas:

| Token | Hex | Uso |
|---|---|---|
| `marinho-700` | `#081A30` | Hover em fundo marinho |
| `marinho-300` | `#6C7A8C` | Texto secundário, ícones inativos |
| `marinho-100` | `#D5D9DF` | Bordas, divisores, linhas da tabela |
| `areia-200` | `#E9E3D9` | Cabeçalho de tabela, cartões, campos |
| `laranja-700` | `#B95C1A` | Hover/pressed do primário |
| `laranja-100` | `#FBE4D2` | Fundo de badge/alerta laranja |

Semânticas (o laranja é acento, então atenção não pode ser o mesmo laranja):

| Token | Hex | Uso |
|---|---|---|
| `ok` | `#2E7D4F` | Voo confirmado, despesa rateada, documento em dia |
| `atencao` | `#B7791F` | Leitura de horímetro com confiança média, revisão perto |
| `erro` | `#8B1E1E` | Buraco de horímetro, documento vencido, avião indisponível |
| `info` | `#3E5C76` | Rascunho, em processamento |

Contraste: areia sobre marinho 13:1; areia sobre laranja 3,3:1 (só em botão com texto ≥ 16 px bold ou usar marinho sobre laranja, 6:1 — o app usa **marinho sobre laranja** nos botões); laranja sobre areia 3,3:1 (só em texto grande ou números de destaque, nunca em texto corrido).

## Tipografia

A logo usa um bloco geométrico pesado ("73") e capitais espaçadas ("AVIATION"). Na interface, uma família só, com números tabulares (horímetro, litros, reais):

- **Manrope** (Google Fonts) — 400, 500, 600, 700. `tnum` em qualquer coluna numérica.
- Horímetro sempre com um décimo: `1.131,7`. Horas: `4,4 h`. Litros: `115 L`. Reais: `R$ 1.234,56`.
- Títulos em 600, nunca em caixa alta (a caixa alta é da marca e dos cadastros).

## Arquivos (`marca/`)

| Arquivo | Onde usar |
|---|---|
| `selo.png` | Selo redondo — tela de login, "sobre", relatórios |
| `logo-horizontal.png` | Barra lateral (fundo marinho usa a versão clara), cabeçalho de PDF |
| `icone-app.png` | Ícone do PWA (laranja com avião areia) — origem de `public/icones/` |
| `logo-vertical-claro.png` / `logo-vertical-escuro.png` | Login, splash |

`npm run gerar-icones` gera `public/icones/` (16, 32, 180, 192, 512, 512-maskable) a partir de `marca/icone-app.png`; sem o arquivo, gera um provisório no mesmo estilo.

## Regras

- Área de respiro ao redor da logo = altura do "73" ÷ 4. Não esticar, não recolorir.
- Botões grandes no celular (mín. 48 px), uma ação principal por tela, câmera a um toque.
- Estado nunca é comunicado só por cor: ícone + texto.
