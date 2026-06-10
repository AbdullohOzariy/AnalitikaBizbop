"use server";

/**
 * Yetkazib beruvchi anketasi — PUBLIC yuborish (supplier.oilagroup.uz).
 * Auth yo'q: IP bo'yicha rate-limit + server tomonda to'liq validatsiya.
 */
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// IP bo'yicha: 5 ta yuborish / soat (in-memory — bitta instansiya uchun yetarli)
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_PER_HOUR = 5;

function rateLimitOk(ip: string): boolean {
  const now = Date.now();
  const e = attempts.get(ip);
  if (!e || e.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (e.count >= MAX_PER_HOUR) return false;
  e.count++;
  return true;
}

const schema = z.object({
  // { fieldId: javob } — qiymatlar satr ("Ha"/"Yo'q" ham satr)
  answers: z.record(z.string(), z.string().max(2000)),
});

export async function submitAnketaAction(
  input: z.input<typeof schema>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const hdrs = await headers();
    const xff = hdrs.get("x-forwarded-for");
    const ip = xff?.split(",").pop()?.trim() || hdrs.get("x-real-ip") || "unknown";
    if (!rateLimitOk(ip)) {
      return { ok: false, error: "Juda ko'p urinish. Birozdan so'ng qayta yuboring." };
    }

    const p = schema.parse(input);
    const fields = await prisma.anketaField.findMany({ where: { active: true } });
    const byId = new Map(fields.map((f) => [String(f.id), f]));

    // Faqat mavjud aktiv maydonlarning javoblari qabul qilinadi
    const answers: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.answers)) {
      if (byId.has(k) && v.trim() !== "") answers[k] = v.trim();
    }
    // Majburiy maydonlar to'ldirilganmi
    for (const f of fields) {
      if (f.required && !answers[String(f.id)]) {
        return { ok: false, error: `"${f.label}" maydoni to'ldirilishi shart.` };
      }
    }

    // Ro'yxat uchun kompaniya nomi va telefonni ajratamiz (label bo'yicha)
    const findByLabel = (s: string) =>
      fields.find((f) => f.label.toLowerCase().includes(s));
    const companyField = findByLabel("kompaniya nomi");
    const phoneField = findByLabel("telefon");
    const companyName =
      (companyField && answers[String(companyField.id)]) ||
      Object.values(answers)[0] ||
      "Noma'lum";

    await prisma.anketaSubmission.create({
      data: {
        companyName: companyName.slice(0, 200),
        phone: phoneField ? (answers[String(phoneField.id)] ?? null) : null,
        answers,
      },
    });
    return { ok: true };
  } catch (e) {
    console.error("[anketa] submit xatosi:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Yuborishda xato — qayta urinib ko'ring." };
  }
}
