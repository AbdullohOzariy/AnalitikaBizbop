/**
 * AI mahsulot kategoriyalash (Claude Haiku) — bizbop yozuvlari uchun.
 * Yozuv saqlangandan keyin FONDA (await qilinmasdan) chaqiriladi: xato bo'lsa
 * faqat log qiladi, yozuvni buzmaydi. ANTHROPIC_API_KEY yo'q bo'lsa jim o'chadi.
 */
import Anthropic from "@anthropic-ai/sdk";
import { kategoriyaNomlari, yozuvKategoriyaSaqla, kategoriyasizYozuvlar } from "./db";

const MODEL = "claude-haiku-4-5";

let _client: Anthropic | null | undefined;
function getClient(): Anthropic | null {
  if (_client === undefined) {
    _client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  }
  return _client;
}

const SYSTEM_PROMPT = `Sen oziq-ovqat va chakana savdo do'koni uchun mahsulotlarni
kategoriyalashtiruvchi yordamchisan. Senga tovar nomi va mavjud kategoriyalar ro'yxati
beriladi. Vazifang — tovarga eng mos kategoriyani aniqlash.

Qoidalar:
- Agar mavjud kategoriyalardan biri tovarga mos kelsa, ANIQ o'sha nomni qaytar (yangi yaratma).
- Agar hech qaysi mos kelmasa, qisqa (1-2 so'z), umumiy va o'zbek tilidagi yangi kategoriya yarat.
  Masalan: "Sut mahsulotlari", "Sabzavotlar", "Mevalar", "Ichimliklar", "Go'sht mahsulotlari",
  "Non va un mahsulotlari", "Shirinliklar", "Bakaleya", "Tozalik vositalari".
- Kategoriya nomini Bosh harf bilan boshla. Tovar markasi yoki o'lchamini kategoriya qilma.
- Kategoriya nomi 100 belgidan oshmasin.
- Faqat so'ralgan JSON formatida javob ber.`;

const SCHEMA = {
  type: "object" as const,
  properties: {
    kategoriya: { type: "string", description: "Tanlangan yoki yangi yaratilgan kategoriya nomi" },
  },
  required: ["kategoriya"],
  additionalProperties: false,
};

async function aiKategoriyaAniqla(
  client: Anthropic,
  tovar: string,
  mavjud: string[]
): Promise<string> {
  const royxat = mavjud.length ? mavjud.map((k) => `- ${k}`).join("\n") : "(hozircha kategoriya yo'q)";

  // output_config (json_schema) API'da qo'llanadi, lekin SDK turlarida hali yo'q —
  // shuning uchun params'ni kengaytirib cast qilamiz.
  const params = {
    model: MODEL,
    max_tokens: 256,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content:
          `Mavjud kategoriyalar:\n${royxat}\n\n` +
          `Tovar nomi: "${tovar}"\n\n` +
          `Shu tovar uchun eng mos kategoriyani tanla yoki yangi yarat.`,
      },
    ],
  };
  const msg = await client.messages.create(
    params as unknown as Anthropic.MessageCreateParamsNonStreaming
  );

  const block = msg.content.find((b) => b.type === "text");
  const matn = block && "text" in block ? block.text : "{}";
  const kat = (JSON.parse(matn).kategoriya as string | undefined)?.trim();
  if (!kat) throw new Error("AI bo'sh kategoriya qaytardi");
  return kat.slice(0, 100);
}

/** Bitta yozuvni kategoriyalaydi. Xato bo'lsa faqat log (yozuvni buzmaydi). */
export async function kategoriyalashtirish(yozuvId: number, tovar: string): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn("[kategoriya] ANTHROPIC_API_KEY yo'q — o'tkazib yuborildi");
    return;
  }
  try {
    const mavjud = await kategoriyaNomlari();
    const kategoriya = await aiKategoriyaAniqla(client, tovar, mavjud);
    await yozuvKategoriyaSaqla(yozuvId, kategoriya);
    console.log(`[kategoriya] Yozuv #${yozuvId} "${tovar}" → "${kategoriya}"`);
  } catch (err) {
    console.error(`[kategoriya] Yozuv #${yozuvId} xato:`, err instanceof Error ? err.message : err);
  }
}

/** Kategoriyasi yo'q eski yozuvlarni ketma-ket to'ldiradi. */
export async function backfill(limit = 200): Promise<{ ok: boolean; kategoriyalandi?: number; xato?: string }> {
  if (!getClient()) return { ok: false, xato: "ANTHROPIC_API_KEY yo'q" };
  const rows = await kategoriyasizYozuvlar(limit);
  let soni = 0;
  for (const r of rows) {
    await kategoriyalashtirish(r.id, r.tovar);
    soni++;
  }
  return { ok: true, kategoriyalandi: soni };
}
