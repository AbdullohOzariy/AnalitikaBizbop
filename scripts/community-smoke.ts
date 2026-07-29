/**
 * Gemini transportini ALOHIDA sinash — DB'ga tegmaydi, promptning murakkabligidan xoli.
 *
 *   railway run npx tsx scripts/community-smoke.ts
 *   railway run npx tsx scripts/community-smoke.ts --models   # mavjud flash modellar ro'yxati
 *
 * Model ID va endpoint — eng ko'p xato bo'ladigan joy, shuning uchun ular birinchi
 * bo'lib, alohida tekshiriladi.
 */
import "dotenv/config";
import { callGemini, MODEL_SMART } from "../src/lib/community/gemini";

const SOXTA = `1 18:36 M1: Goldda somsa xamiri bormi
2 18:48 OP ↩1: Assalomu alaykum hurmatli mijoz sotuvda mavjud emas
3 19:18 M2: Oilada farsh bormi
4 19:22 OP ↩3: Assalomu alaykum hurmatli mijoz sotuvda mavjud
5 20:00 M3: qora danaksiz uzum bormi`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          messageId: { type: "integer" },
          product: { type: "string" },
          status: { type: "string", enum: ["YES", "NO", "UNANSWERED"] },
        },
        required: ["messageId", "product", "status"],
      },
    },
  },
  required: ["items"],
};

async function modellarniKorsat() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return console.error("GEMINI_API_KEY yo'q");
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    headers: { "x-goog-api-key": key },
  });
  if (!r.ok) return console.error(`models ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = (await r.json()) as { models?: { name?: string }[] };
  const flash = (d.models ?? []).map((m) => m.name ?? "").filter((n) => n.includes("flash"));
  console.log(`Mavjud flash modellar (${flash.length}):`);
  flash.forEach((n) => console.log("  " + n.replace("models/", "")));
}

async function main() {
  if (process.argv.includes("--models")) return modellarniKorsat();

  console.log(`Model: ${MODEL_SMART}`);
  const t0 = Date.now();
  const out = await callGemini({
    model: MODEL_SMART,
    system:
      "Sen supermarket chatini tahlil qilasan. Har MIJOZ so'roviga operator javobini topib, " +
      "status ber: YES (bor), NO (yo'q), UNANSWERED (javob berilmagan). Faqat JSON qaytar.",
    input: SOXTA,
    schema: SCHEMA,
    maxOutputTokens: 2048,
  });

  console.log(`Vaqt: ${Date.now() - t0}ms | tokenlar: ${out.inTokens} in / ${out.outTokens} out`);
  console.log("Xom javob:", out.text.slice(0, 500));

  const parsed = JSON.parse(out.text) as { items: { messageId: number; product: string; status: string }[] };
  console.log("\nTahlil:");
  for (const it of parsed.items) {
    console.log(`  #${it.messageId}  ${it.status.padEnd(11)} ${it.product}`);
  }
  console.log("\n✅ Transport ishlayapti.");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
