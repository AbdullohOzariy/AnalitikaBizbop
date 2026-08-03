/**
 * Moliya miniapp: hisoblararo ko'chirish (Инкасса / Переброс / Обмен).
 *
 * Qoidalar takrorlanmaydi — `kassaKochirishYarat` chaqiriladi, ya'ni telefondan
 * kiritilgan ko'chirish ham AYNAN ikki bog'langan yozuv yaratadi va yopilgan
 * kun tekshiruvidan (ikkala tomon) o'tadi.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { authMoliya, moliyaXato } from "../auth";
import { kassaKochirishYarat } from "@/lib/moliya/yozuv";
import { parseDateParam } from "@/lib/date";
import { redactForLog } from "@/lib/tg-redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromAccountId: z.coerce.number().int().positive(),
  toAccountId: z.coerce.number().int().positive(),
  articleId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive().max(1e15),
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  const a = await authMoliya(req, "kochirish", 30);
  if ("fail" in a) return a.fail;

  let p: z.infer<typeof schema>;
  try {
    p = schema.parse(await req.json());
  } catch {
    return moliyaXato("Maydonlar to'liq emas yoki noto'g'ri.", 400);
  }

  const businessDate = parseDateParam(p.businessDate);
  if (!businessDate) return moliyaXato("Sana noto'g'ri.", 400);

  try {
    const res = await kassaKochirishYarat({
      businessDate,
      fromAccountId: p.fromAccountId,
      toAccountId: p.toAccountId,
      articleId: p.articleId,
      amount: p.amount,
      note: p.note ?? null,
      source: "MINIAPP",
      createdById: a.user.id,
    });
    if (!res.ok) return moliyaXato(res.error, 400);
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    console.error("[miniapp-moliya:kochirish]", redactForLog(e));
    return moliyaXato("Saqlashda xato. Qayta urinib ko'ring.", 500);
  }
}
