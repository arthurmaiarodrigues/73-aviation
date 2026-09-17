import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

/**
 * Leitura do horímetro por foto (CLAUDE.md §6).
 *
 * O modelo devolve a leitura pela ferramenta `registrar_horimetro` — JSON
 * garantido, sem texto solto. Nunca inventa: se não dá para ler, `legivel`
 * vem false e o piloto digita. O valor final é sempre o que o piloto
 * confirmar; o bruto fica em `voos.leitura_ia`.
 */

export const MODELO = "claude-sonnet-5";
const TIMEOUT_MS = 45_000;

export type LeituraHorimetro = {
  leitura: number | null;
  confianca: number;
  legivel: boolean;
  observacao: string;
};

export type ResultadoLeitura = LeituraHorimetro & {
  modelo: string;
  duracao_ms: number;
  tokens_entrada: number;
  tokens_saida: number;
};

const SYSTEM_PROMPT = `Você lê o horímetro (Hobbs) de um avião Van's RV-10 em fotos tiradas com celular no hangar.

O horímetro mostra as horas totais da aeronave como um número com UM décimo, por exemplo 1131.7. Ele pode ser um contador mecânico de rolos (o último dígito, em outra cor, é o décimo) ou um mostrador digital da aviônica (Garmin), às vezes com o rótulo "HOBBS", "TACH", "FLT" ou "TOTAL".

Regras:
- Leia SOMENTE o valor do HOBBS/horímetro total. Se a tela mostrar vários contadores, prefira o rotulado HOBBS; se não houver rótulo, prefira o maior número com um décimo na faixa de 1000 a 9999.
- Nunca invente um número. Se a foto estiver desfocada, cortada, com reflexo sobre os dígitos, ou se o dígito de décimo estiver entre duas posições e não der para decidir, devolva legivel = false e explique em observacao.
- Um rolo mecânico entre dois dígitos: use o dígito que está mais visível e reduza a confiança para 0.6 ou menos.
- confianca é de 0 a 1: 0.95+ quando todos os dígitos estão nítidos; 0.7–0.9 quando um dígito exige interpretação; abaixo de 0.6 quando é palpite.
- observacao em português, curta, em CAIXA ALTA, só quando houver algo a dizer (reflexo, dígito duvidoso, outro contador na tela). Vazia quando a leitura é limpa.`;

const FERRAMENTA: Anthropic.Tool = {
  name: "registrar_horimetro",
  description: "Registra a leitura do horímetro que aparece na foto.",
  input_schema: {
    type: "object",
    properties: {
      legivel: { type: "boolean", description: "false quando não dá para ler com segurança" },
      leitura: { type: ["number", "null"], description: "Horas totais com um décimo, ex. 1131.7. null se ilegível." },
      confianca: { type: "number", minimum: 0, maximum: 1 },
      observacao: { type: "string" },
    },
    required: ["legivel", "leitura", "confianca", "observacao"],
  },
};

/** Fotos: no máximo 1568 px no maior lado, JPEG 85 — barato e legível. */
async function prepararImagem(bytes: Buffer): Promise<{ dados: Buffer; tipo: "image/jpeg" }> {
  const imagem = sharp(bytes, { failOn: "none" }).rotate();
  const meta = await imagem.metadata();
  const maior = Math.max(meta.width ?? 0, meta.height ?? 0);
  const redimensionada = maior > 1568 ? imagem.resize({ width: 1568, height: 1568, fit: "inside" }) : imagem;
  return { dados: await redimensionada.jpeg({ quality: 85 }).toBuffer(), tipo: "image/jpeg" };
}

export class ChaveAusenteError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY não está definida. A leitura da foto não funciona sem ela — digite o horímetro.");
    this.name = "ChaveAusenteError";
  }
}

export function temChave(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export async function lerHorimetro(bytes: Buffer, contexto?: { esperadoPerto?: number | null }): Promise<ResultadoLeitura> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new ChaveAusenteError();

  const cliente = new Anthropic({ apiKey, maxRetries: 1 });
  const { dados, tipo } = await prepararImagem(bytes);
  const comeco = Date.now();

  // A dica do último horímetro vai DEPOIS da imagem e só como referência:
  // ajuda a desempatar um dígito, não pode virar o número lido.
  const dica =
    contexto?.esperadoPerto != null
      ? `Referência: o último horímetro registrado foi ${contexto.esperadoPerto.toFixed(1)}. A leitura desta foto deve ser igual ou um pouco maior (um voo tem entre 0,1 e 8,0 horas). Se a foto mostrar claramente outro número, devolva o que está na foto e comente em observacao.`
      : "Leia o horímetro desta foto.";

  const resposta = await cliente.messages.create(
    {
      model: MODELO,
      max_tokens: 300,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [FERRAMENTA],
      tool_choice: { type: "tool", name: "registrar_horimetro" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: tipo, data: dados.toString("base64") } },
            { type: "text", text: dica },
          ],
        },
      ],
    },
    { timeout: TIMEOUT_MS },
  );

  const chamada = resposta.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "registrar_horimetro",
  );
  if (!chamada) throw new Error(`O modelo não devolveu a leitura (stop_reason: ${resposta.stop_reason ?? "?"}).`);

  const bruto = chamada.input as Partial<LeituraHorimetro>;
  const leitura = typeof bruto.leitura === "number" && Number.isFinite(bruto.leitura) ? Math.round(bruto.leitura * 10) / 10 : null;

  return {
    legivel: Boolean(bruto.legivel) && leitura !== null,
    leitura,
    confianca: Math.max(0, Math.min(1, Number(bruto.confianca ?? 0))),
    observacao: String(bruto.observacao ?? "").trim(),
    modelo: MODELO,
    duracao_ms: Date.now() - comeco,
    tokens_entrada: resposta.usage.input_tokens ?? 0,
    tokens_saida: resposta.usage.output_tokens ?? 0,
  };
}
