import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

/**
 * Leitura de comprovante (nota de combustível, cupom, taxa de pouso, boleto
 * de hangar, recibo de oficina) por foto ou PDF. Devolve o que preenche o
 * formulário de despesa/abastecimento; quem confirma é a pessoa.
 * Acessória (CLAUDE.md §9): se falhar, o formulário segue em branco.
 */

export const MODELO = "claude-sonnet-5";
const TIMEOUT_MS = 60_000;

export const CATEGORIAS_VALIDAS = [
  "COMBUSTÍVEL", "ÓLEO", "HANGAR", "SEGURO", "MANUTENÇÃO", "PEÇAS", "TAXAS DE POUSO E NAVEGAÇÃO",
  "DOCUMENTAÇÃO", "ASSINATURAS E AVIÔNICOS", "PILOTO", "VIAGEM E DIÁRIAS", "OUTROS",
] as const;

export type ComprovanteLido = {
  legivel: boolean;
  fornecedor: string | null;
  cnpj_cpf: string | null;
  data: string | null;
  valor: number | null;
  litros: number | null;
  descricao: string | null;
  categoria: (typeof CATEGORIAS_VALIDAS)[number] | null;
  aerodromo: string | null;
  confianca: number;
  observacao: string;
};

const SYSTEM_PROMPT = `Você lê comprovantes de despesa de um avião particular (Van's RV-10) no Brasil: nota fiscal ou cupom de abastecimento de AVGAS, recibo de taxa de pouso/estadia/navegação, boleto de hangar, nota de oficina, seguro, taxas da ANAC.

Devolva SOMENTE o que está escrito no documento. Nunca invente fornecedor, valor ou data. Se algo não aparece, deixe nulo.

Regras:
- fornecedor: razão social ou nome fantasia como impresso, em CAIXA ALTA, sem "LTDA"/"ME" no fim.
- cnpj_cpf: só dígitos, se houver.
- data: a data de emissão/pagamento no formato AAAA-MM-DD (datas brasileiras são DD/MM/AAAA).
- valor: o TOTAL pago, número com ponto decimal (1.234,56 → 1234.56).
- litros: só em combustível, a quantidade total abastecida em litros (número). Se aparecer em galões, converta (1 gal = 3,785 L) e diga em observacao.
- descricao: resumo curto em CAIXA ALTA do que foi comprado (ex.: "AVGAS 115 L", "TAXA DE POUSO SBSV", "HANGAR SETEMBRO").
- categoria: uma das opções válidas; combustível de aviação é COMBUSTÍVEL; pouso, estadia, navegação e DECEA são TAXAS DE POUSO E NAVEGAÇÃO.
- aerodromo: o código ICAO de 4 letras se o documento indicar o aeroporto (SBSV, SNTF…); se só houver o nome da cidade, deixe nulo.
- confianca de 0 a 1 sobre o conjunto; legivel = false se a imagem não permite ler valor OU fornecedor.
- observacao em português, curta, em CAIXA ALTA, só quando houver algo a avisar (várias notas na imagem, valor com desconto, parcelas).`;

const FERRAMENTA: Anthropic.Tool = {
  name: "registrar_comprovante",
  description: "Registra os dados lidos do comprovante.",
  input_schema: {
    type: "object",
    properties: {
      legivel: { type: "boolean" },
      fornecedor: { type: ["string", "null"] },
      cnpj_cpf: { type: ["string", "null"] },
      data: { type: ["string", "null"], description: "AAAA-MM-DD" },
      valor: { type: ["number", "null"] },
      litros: { type: ["number", "null"] },
      descricao: { type: ["string", "null"] },
      categoria: { type: ["string", "null"], enum: [...CATEGORIAS_VALIDAS, null] },
      aerodromo: { type: ["string", "null"] },
      confianca: { type: "number", minimum: 0, maximum: 1 },
      observacao: { type: "string" },
    },
    required: ["legivel", "fornecedor", "cnpj_cpf", "data", "valor", "litros", "descricao", "categoria", "aerodromo", "confianca", "observacao"],
  },
};

export function temChave(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

async function prepararImagem(bytes: Buffer): Promise<Buffer> {
  const imagem = sharp(bytes, { failOn: "none" }).rotate();
  const meta = await imagem.metadata();
  const maior = Math.max(meta.width ?? 0, meta.height ?? 0);
  return (maior > 1568 ? imagem.resize({ width: 1568, height: 1568, fit: "inside" }) : imagem).jpeg({ quality: 85 }).toBuffer();
}

export async function lerComprovante(bytes: Buffer, tipo: string): Promise<ComprovanteLido & { modelo: string; duracao_ms: number }> {
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
      max_tokens: 600,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [FERRAMENTA],
      tool_choice: { type: "tool", name: "registrar_comprovante" },
      messages: [{ role: "user", content: [bloco, { type: "text", text: "Leia este comprovante." }] }],
    },
    { timeout: TIMEOUT_MS },
  );

  const chamada = resposta.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "registrar_comprovante");
  if (!chamada) throw new Error(`O modelo não devolveu a leitura (stop_reason: ${resposta.stop_reason ?? "?"}).`);
  const b = chamada.input as Partial<ComprovanteLido>;

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null);
  const categoria = CATEGORIAS_VALIDAS.find((c) => c === b.categoria) ?? null;
  const dataOk = typeof b.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.data) ? b.data : null;
  const aerodromo = txt(b.aerodromo);

  return {
    legivel: Boolean(b.legivel) && num(b.valor) !== null,
    fornecedor: txt(b.fornecedor),
    cnpj_cpf: typeof b.cnpj_cpf === "string" ? b.cnpj_cpf.replace(/\D/g, "") || null : null,
    data: dataOk,
    valor: num(b.valor),
    litros: num(b.litros),
    descricao: txt(b.descricao),
    categoria,
    aerodromo: aerodromo && /^[A-Z0-9]{4}$/.test(aerodromo) ? aerodromo : null,
    confianca: Math.max(0, Math.min(1, Number(b.confianca ?? 0))),
    observacao: String(b.observacao ?? "").trim(),
    modelo: MODELO,
    duracao_ms: Date.now() - comeco,
  };
}
