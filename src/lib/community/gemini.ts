/**
 * Gemini transporti — Community tahlili uchun YAGONA chiqish nuqtasi.
 *
 * NEGA SDK EMAS: bizga bitta POST kerak. Loyihada allaqachon ikki xil LLM naqshi bor
 * (xom fetch — DeepSeek, SDK — Anthropic); uchinchi paket qo'shish keraksiz.
 * Ammo `ai-matcher.ts` ning ikki kamchiligini TAKRORLAMAYMIZ: retry yo'qligi va
 * qisqa timeout (50 xabarlik oyna uchun 25s kam).
 *
 * API TANLOVI: `/v1beta/interactions` — Google'ning yangi Interactions API'si;
 * eski `generateContent` legacy deb belgilangan va strukturali chiqish sintaksisi
 * ham unda boshqacha. `response_format` AYNAN shu endpointda hujjatlashtirilgan.
 */

const GEMINI_URL =
  process.env.GEMINI_URL ?? "https://generativelanguage.googleapis.com/v1beta/interactions";

/** 50 xabarlik oyna + thinking — 25s (ai-matcher naqshi) yetmaydi. */
const TIMEOUT_MS = 90_000;

/** Kunlik tasnif — asosiy model. */
export const MODEL_SMART = process.env.GEMINI_MODEL_SMART ?? "gemini-3.6-flash";
/** Arzon yordamchi ishlar (SKU re-rank, subkategoriya biriktirish). */
export const MODEL_FAST = process.env.GEMINI_MODEL_FAST ?? "gemini-3.1-flash-lite";

interface Part {
  type?: string;
  text?: string;
}
interface Step {
  type?: string;
  content?: Part[];
}
interface Res {
  status?: string;
  output_text?: string;
  steps?: Step[];
  usage?: { total_input_tokens?: number; total_output_tokens?: number };
}

export interface GeminiOut {
  text: string;
  inTokens: number;
  outTokens: number;
}

/** HTTP holati bilan boyitilgan xato — retry qarorini shu asosda qabul qilamiz. */
class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

/** 429 / 5xx / tarmoq — eksponensial backoff; 400/401/403 — DARHOL to'xtash (qayta urinish behuda). */
async function withRetry<T>(fn: () => Promise<T>, max = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= max; i++) {
    try {
      return await fn();
    } catch (e) {
      const st = (e as GeminiError).status;
      const retryable = st === undefined || st === 429 || st >= 500;
      if (!retryable || i === max) throw e;
      last = e;
      await new Promise((r) =>
        setTimeout(r, Math.min(30_000, 1000 * 2 ** i) + Math.random() * 500)
      );
    }
  }
  throw last;
}

/** Javob matnini ajratadi: `output_text` bo'lmasa `steps[].content[].text` dan yig'adi. */
function javobMatni(data: Res): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text;
  const parts: string[] = [];
  for (const step of data.steps ?? []) {
    if (step.type === "thought") continue; // fikrlash bloki — natija emas
    for (const c of step.content ?? []) {
      if (typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("");
}

/**
 * Strukturali (JSON) javob so'raydi. `schema` — Gemini qo'llab-quvvatlaydigan
 * JSON Schema qismi (type/properties/required/enum/items/description).
 *
 * `temperature` ATAYLAB yuborilmaydi: Gemini 3 hujjati uni default (1.0) da qoldirishni
 * qat'iy tavsiya qiladi — pasaytirish looping/degradatsiyaga olib keladi, bu esa
 * chiqish limitida JSON'ni o'rtasidan kesib qo'yadi. Determinizm sxema + enum hisobiga.
 */
export async function callGemini(opts: {
  model: string;
  system: string;
  input: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  apiKey?: string;
}): Promise<GeminiOut> {
  const key = opts.apiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY sozlanmagan.");

  const data = await withRetry(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model: opts.model,
          // Mijoz yozishmasi Google serverida SAQLANMASIN (default: true).
          store: false,
          system_instruction: opts.system,
          input: opts.input,
          generation_config: {
            thinking_level: "minimal",
            max_output_tokens: opts.maxOutputTokens ?? 8192,
          },
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: opts.schema,
          },
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        // Xato tanasi ba'zan massiv bilan o'ralgan google.rpc shaklida keladi —
        // shuning uchun matnni xom holda (qisqartirib) beramiz.
        const body = await res.text().catch(() => "");
        throw new GeminiError(`Gemini ${res.status}: ${body.slice(0, 300)}`, res.status);
      }
      return (await res.json()) as Res;
    } finally {
      clearTimeout(timer);
    }
  });

  const text = javobMatni(data);
  if (!text.trim()) throw new GeminiError("Gemini bo'sh javob qaytardi.");

  return {
    text,
    inTokens: data.usage?.total_input_tokens ?? 0,
    outTokens: data.usage?.total_output_tokens ?? 0,
  };
}
