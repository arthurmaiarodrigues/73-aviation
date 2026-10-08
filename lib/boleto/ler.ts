import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

import { CATEGORIAS_VALIDAS } from "@/lib/comprovante/ler";
import { lerLinhaDigitavel } from "./linha";

/**
 * Leitura de boleto (foto ou PDF) para a tela de contas a pagar: beneficiário,
 * vencimento, valor e número do documento. Quando a linha digitável é lida e
 * os dígitos verificadores fecham, ela manda no vencimento e no valor — é o
 * que o banco vai cobrar. Acessória (CLAUDE.md §9): se falhar, digita-se.
 */

export const MODELO = "claude-sonnet-5";
const TIMEOUT_MS = 60_000;
const TOKENS = 1_500;

export type BoletoLido = {
  legivel: boolean;
  beneficiario: string | null;
  cnpj_cpf: string | null;
  vencimento: string | null;
  valor: number | null;
  documento: string | null;
  descricao: string | null;
  categoria: (typeof CATEGORIAS_VALIDAS)[number] | null;
  linha_digitavel: string | null;
  /** O "copia e cola" do PIX, quando o boleto traz o texto impresso. */
  pix_copia_cola: string | null;
  /** O vencimento e o valor vieram da linha digitável conferida. */
  conferido: boolean;
  confianca: number;
  observacao: string;
};

const SYSTEM_PROMPT = `Você lê boletos bancários brasileiros de uma sociedade dona de um avião (hangar, seguro, oficina, peças, taxas).

Devolva SOMENTE o que está impresso. Nunca invente valor, vencimento ou beneficiário. Se algo não aparece, deixe nulo.

Regras:
- beneficiario: o CEDENTE / BENEFICIÁRIO (quem recebe), em CAIXA ALTA, sem "LTDA"/"ME" no fim. Não confunda com o pagador/sacado (que é a sociedade ou um dos sócios).
- cnpj_cpf: só dígitos, do beneficiário.
- vencimento: o campo VENCIMENTO, no formato AAAA-MM-DD (datas brasileiras são DD/MM/AAAA).
- valor: o VALOR DO DOCUMENTO (ou "valor cobrado"), número com ponto decimal (1.234,56 → 1234.56). Ignore juros/multa calculados para depois do vencimento.
- documento: o "número do documento" ou o "nosso número", como impresso.
- pix_copia_cola: o código PIX "copia e cola" quando ele estiver IMPRESSO COMO TEXTO (começa por 00020101…). Não tente adivinhar pelo QR Code: se só houver o quadrado do QR, deixe nulo.
- linha_digitavel: a sequência de números do topo do boleto, SÓ OS DÍGITOS, sem pontos e espaços. São 47 dígitos (cobrança) ou 48 (conta de consumo). Copie com cuidado, dígito a dígito; se não conseguir ler todos, deixe nulo.
- descricao: resumo curto em CAIXA ALTA do que é a conta (ex.: "HANGAR OUTUBRO", "PARCELA 2/4 SEGURO RETA"). Use a instrução/demonstrativo do boleto se houver.
- categoria: uma das opções válidas, pelo que dá para entender do beneficiário e do demonstrativo.
- confianca de 0 a 1; legivel = false se não dá para ler valor OU vencimento.
- observacao curta em CAIXA ALTA só quando houver o que avisar (boleto já vencido, parcelado, mais de um boleto na imagem).`;

const FERRAMENTA: Anthropic.Tool = {
  name: "registrar_boleto",
  description: "Registra os dados lidos do boleto.",
  input_schema: {
    type: "object",
    properties: {
      legivel: { type: "boolean" },
      beneficiario: { type: ["string", "null"] },
      cnpj_cpf: { type: ["string", "null"] },
      vencimento: { type: ["string", "null"], description: "AAAA-MM-DD" },
      valor: { type: ["number", "null"] },
      documento: { type: ["string", "null"] },
      linha_digitavel: { type: ["string", "null"], description: "só dígitos" },
      pix_copia_cola: { type: ["string", "null"] },
      descricao: { type: ["string", "null"] },
      categoria: { type: ["string", "null"], enum: [...CATEGORIAS_VALIDAS, null] },
      confianca: { type: "number", minimum: 0, maximum: 1 },
      observacao: { type: "string" },
    },
    required: ["legivel", "beneficiario", "cnpj_cpf", "vencimento", "valor", "documento", "linha_digitavel", "pix_copia_cola", "descricao", "categoria", "confianca", "observacao"],
  },
};

async function prepararImagem(bytes: Buffer): Promise<Buffer> {
  const imagem = sharp(bytes, { failOn: "none" }).rotate();
  const meta = await imagem.metadata();
  const maior = Math.max(meta.width ?? 0, meta.height ?? 0);
  return (maior > 1568 ? imagem.resize({ width: 1568, height: 1568, fit: "inside" }) : imagem).jpeg({ quality: 90 }).toBuffer();
}

export async function lerBoleto(bytes: Buffer, tipo: string): Promise<BoletoLido & { modelo: string; duracao_ms: number }> {
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
      tool_choice: { type: "tool", name: "registrar_boleto" },
      messages: [{ role: "user", content: [bloco, { type: "text", text: "Leia este boleto." }] }],
    },
    { timeout: TIMEOUT_MS },
  );

  const chamada = resposta.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "registrar_boleto");
  if (!chamada) throw new Error(`O modelo não devolveu a leitura (stop_reason: ${resposta.stop_reason ?? "?"}).`);
  const b = chamada.input as Partial<BoletoLido>;

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null);
  const dataOk = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

  let vencimento = dataOk(b.vencimento);
  let valor = num(b.valor);
  const avisos: string[] = [];

  // A linha digitável, quando fecha, manda: é o que o banco cobra.
  const linha = lerLinhaDigitavel(b.linha_digitavel);
  const conferido = Boolean(linha?.valida && linha.tipo === "COBRANCA");
  if (linha?.valida) {
    if (linha.valor !== null && valor !== null && Math.abs(linha.valor - valor) > 0.01) {
      avisos.push(`VALOR IMPRESSO ${valor.toFixed(2)} DIFERE DA LINHA DIGITÁVEL ${linha.valor.toFixed(2)}`);
    }
    if (linha.vencimento && vencimento && linha.vencimento !== vencimento) {
      avisos.push(`VENCIMENTO IMPRESSO ${vencimento} DIFERE DA LINHA DIGITÁVEL ${linha.vencimento}`);
    }
    valor = linha.valor ?? valor;
    vencimento = linha.vencimento ?? vencimento;
  }

  return {
    legivel: Boolean(b.legivel) && (valor !== null || vencimento !== null),
    beneficiario: txt(b.beneficiario),
    cnpj_cpf: typeof b.cnpj_cpf === "string" ? b.cnpj_cpf.replace(/\D/g, "") || null : null,
    vencimento,
    valor,
    documento: txt(b.documento),
    descricao: txt(b.descricao),
    categoria: CATEGORIAS_VALIDAS.find((c) => c === b.categoria) ?? null,
    linha_digitavel: linha?.digitos ?? null,
    pix_copia_cola: typeof b.pix_copia_cola === "string" && b.pix_copia_cola.trim().length > 40 ? b.pix_copia_cola.trim() : null,
    conferido,
    confianca: Math.max(0, Math.min(1, Number(b.confianca ?? 0))),
    observacao: [String(b.observacao ?? "").trim(), ...avisos].filter(Boolean).join(" · "),
    modelo: MODELO,
    duracao_ms: Date.now() - comeco,
  };
}
