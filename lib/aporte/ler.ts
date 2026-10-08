import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

/**
 * Leitura do comprovante de aporte (PIX, TED, depósito) que um sócio fez
 * para o caixa da sociedade: quem pagou, quando e quanto. O que interessa
 * aqui é o PAGADOR — é ele que vira o crédito no extrato.
 * Acessória (CLAUDE.md §9): se falhar, o formulário segue para digitação.
 */

export const MODELO = "claude-sonnet-5";
const TIMEOUT_MS = 60_000;
const TOKENS = 1_000;

export type AporteLido = {
  legivel: boolean;
  pagador: string | null;
  recebedor: string | null;
  data: string | null;
  valor: number | null;
  descricao: string | null;
  confianca: number;
  observacao: string;
};

const SYSTEM_PROMPT = `Você lê comprovantes de transferência (PIX, TED, DOC, depósito) em que um sócio manda dinheiro para o caixa de uma sociedade dona de um avião.

Devolva SOMENTE o que está no comprovante. Nunca invente nome, valor ou data. Se algo não aparece, deixe nulo.

Regras:
- pagador: o nome de QUEM ENVIOU o dinheiro (aparece como "quem pagou", "origem", "debitado de", "pagador", "remetente"), em CAIXA ALTA e completo como impresso. É o campo mais importante.
- recebedor: o nome de quem recebeu, em CAIXA ALTA (normalmente a sociedade).
- data: a data da transação no formato AAAA-MM-DD (datas brasileiras são DD/MM/AAAA). Se houver data e hora, use só a data.
- valor: o valor transferido, número com ponto decimal (25.000,00 → 25000.00).
- descricao: a descrição/mensagem do comprovante em CAIXA ALTA, curta, se houver (ex.: "APORTE OUTUBRO 2026"). Se não houver, nulo.
- confianca de 0 a 1; legivel = false se não dá para ler o valor.
- observacao curta em CAIXA ALTA só quando houver o que avisar (comprovante de agendamento ainda não efetivado, mais de uma transferência na imagem, valor estornado).`;

const FERRAMENTA: Anthropic.Tool = {
  name: "registrar_aporte",
  description: "Registra os dados lidos do comprovante de transferência.",
  input_schema: {
    type: "object",
    properties: {
      legivel: { type: "boolean" },
      pagador: { type: ["string", "null"] },
      recebedor: { type: ["string", "null"] },
      data: { type: ["string", "null"], description: "AAAA-MM-DD" },
      valor: { type: ["number", "null"] },
      descricao: { type: ["string", "null"] },
      confianca: { type: "number", minimum: 0, maximum: 1 },
      observacao: { type: "string" },
    },
    required: ["legivel", "pagador", "recebedor", "data", "valor", "descricao", "confianca", "observacao"],
  },
};

async function prepararImagem(bytes: Buffer): Promise<Buffer> {
  const imagem = sharp(bytes, { failOn: "none" }).rotate();
  const meta = await imagem.metadata();
  const maior = Math.max(meta.width ?? 0, meta.height ?? 0);
  return (maior > 1568 ? imagem.resize({ width: 1568, height: 1568, fit: "inside" }) : imagem).jpeg({ quality: 85 }).toBuffer();
}

export async function lerAporte(bytes: Buffer, tipo: string): Promise<AporteLido & { modelo: string; duracao_ms: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não está definida.");
  const cliente = new Anthropic({ apiKey, maxRetries: 1 });
  const comeco = Date.now();

  const bloco: Anthropic.ContentBlockParam =
    tipo === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }
      : { type: "image", source: { type: "base64", media_type: "image/jpeg", data: (await prepararImagem(bytes)).toString("base64") } };

  const resposta = await cliente.messages.create(
    {
      model: MODELO,
      max_tokens: TOKENS,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [FERRAMENTA],
      tool_choice: { type: "tool", name: "registrar_aporte" },
      messages: [{ role: "user", content: [bloco, { type: "text", text: "Leia este comprovante de transferência." }] }],
    },
    { timeout: TIMEOUT_MS },
  );

  const chamada = resposta.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "registrar_aporte");
  if (!chamada) throw new Error(`O modelo não devolveu a leitura (stop_reason: ${resposta.stop_reason ?? "?"}).`);
  const b = chamada.input as Partial<AporteLido>;

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null);

  return {
    legivel: Boolean(b.legivel) && num(b.valor) !== null,
    pagador: txt(b.pagador),
    recebedor: txt(b.recebedor),
    data: typeof b.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.data) ? b.data : null,
    valor: num(b.valor),
    descricao: txt(b.descricao),
    confianca: Math.max(0, Math.min(1, Number(b.confianca ?? 0))),
    observacao: String(b.observacao ?? "").trim(),
    modelo: MODELO,
    duracao_ms: Date.now() - comeco,
  };
}
