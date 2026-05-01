/**
 * DeepSeek API orqali Excel fayl nomlarini DB nomlariga moslashtiradi.
 * Faqat fallback sifatida — avval aniq (exact) moslik tekshiriladi.
 */

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const TIMEOUT_MS = 25_000;
const MIN_CONFIDENCE = 0.82;

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

async function callDeepSeek(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY muhit o'zgaruvchisi sozlanmagan.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 800,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`DeepSeek API xatosi ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content ?? "{}";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Excel'dagi noma'lum kategoriya nomlarini DB kategoriyalariga moslashtiradi.
 *
 * @param unknownNames  - normalizatsiya qilingan, DB'da topilmagan nomlar
 * @param knownNames    - DB'dagi barcha kategoriya nomlari (normalizatsiya qilingan)
 * @returns Map<excelNorm, dbNorm>
 */
export async function matchCategoryNames(
  unknownNames: string[],
  knownNames: string[]
): Promise<Map<string, string>> {
  if (unknownNames.length === 0) return new Map();

  const raw = await callDeepSeek([
    {
      role: "system",
      content:
        "Supermarket sotuv hisoboti tahlilchisissan. " +
        "Excel fayl kategoriya nomlarini ma'lumotlar bazasi kategoriyalari bilan solishtir. " +
        "Faqat ishonchli mosliklarni (≥82%) qaytargil. " +
        "Javobni FAQAT JSON formatida ber.",
    },
    {
      role: "user",
      content:
        `Ma'lumotlar bazasi kategoriyalari:\n` +
        knownNames.map((n, i) => `${i + 1}. ${n}`).join("\n") +
        `\n\nExcel'da topilgan noma'lum nomlar:\n` +
        unknownNames.map((n, i) => `${i + 1}. ${n}`).join("\n") +
        `\n\nHar bir noma'lum nomga eng yaqin DB kategoriyasini top.\n` +
        `Ishonch darajasi 82% dan past bo'lsa db: null qo'y.\n\n` +
        `Javob:\n{"matches":[{"excel":"...","db":"...yoki null","confidence":0.0}]}`,
    },
  ]);

  try {
    const parsed = JSON.parse(raw) as {
      matches: { excel: string; db: string | null; confidence: number }[];
    };
    const map = new Map<string, string>();
    for (const m of parsed.matches ?? []) {
      if (m.db && m.confidence >= MIN_CONFIDENCE) {
        map.set(m.excel, m.db);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

export type BranchMatchResult = {
  branchId: number;
  branchName: string;
  confidence: number;
} | null;

/**
 * Noma'lum filial alias nomini ma'lum filiallar bilan moslashtiradi.
 *
 * @param alias      - Excel'dagi noma'lum filial nomi
 * @param branches   - DB'dagi filiallar (id, nom, mavjud aliaslar)
 */
export async function matchBranchAlias(
  alias: string,
  branches: { id: number; name: string; existingAliases: string[] }[]
): Promise<BranchMatchResult> {
  const raw = await callDeepSeek([
    {
      role: "system",
      content:
        "Supermarket filial nomlarini solishtiruvchi yordamchisan. " +
        "Berilgan Excel alias nomini ma'lum filiallar ro'yxatiga moslashtir. " +
        "Javobni FAQAT JSON formatida ber.",
    },
    {
      role: "user",
      content:
        `Excel'dagi noma'lum filial nomi: "${alias}"\n\n` +
        `Ma'lum filiallar va ularning aliaslar:\n` +
        branches
          .map(
            (b) =>
              `- ${b.name}${b.existingAliases.length ? ` (aliaslar: ${b.existingAliases.join(", ")})` : ""}`
          )
          .join("\n") +
        `\n\nQaysi filialga tegishli?\n` +
        `{"branchName":"...yoki null","confidence":0.0}`,
    },
  ]);

  try {
    const parsed = JSON.parse(raw) as { branchName: string | null; confidence: number };
    if (!parsed.branchName || parsed.confidence < MIN_CONFIDENCE) return null;
    const branch = branches.find((b) => b.name === parsed.branchName);
    return branch
      ? { branchId: branch.id, branchName: branch.name, confidence: parsed.confidence }
      : null;
  } catch {
    return null;
  }
}
