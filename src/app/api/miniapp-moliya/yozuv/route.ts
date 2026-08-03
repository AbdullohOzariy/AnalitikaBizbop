/**
 * Moliya miniapp: kirim/chiqim yozuvi.
 *
 * Biznes qoidalari BU YERDA TAKRORLANMAYDI — `kassaYozuvYarat` chaqiriladi,
 * ya'ni telefondan kiritilgan yozuv web'dagi bilan AYNAN bir xil tekshiruvdan
 * o'tadi (modda yo'nalishi, transfer, yirik summada kontragent, yopilgan kun).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { authMoliya, moliyaXato } from "../auth";
import { kassaYozuvYarat } from "@/lib/moliya/yozuv";
import { parseDateParam } from "@/lib/date";
import { redactForLog } from "@/lib/tg-redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountId: z.coerce.number().int().positive(),
  articleId: z.coerce.number().int().positive(),
  direction: z.enum(["IN", "OUT"]),
  amount: z.coerce.number().positive().max(1e15),
  counterpartyId: z.coerce.number().int().positive().nullable().optional(),
  costCenterId: z.coerce.number().int().positive().nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  const a = await authMoliya(req, "yozuv", 30);
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
    const res = await kassaYozuvYarat({
      businessDate,
      accountId: p.accountId,
      articleId: p.articleId,
      direction: p.direction,
      amount: p.amount,
      counterpartyId: p.counterpartyId ?? null,
      costCenterId: p.costCenterId ?? null,
      note: p.note ?? null,
      source: "MINIAPP",
      createdById: a.user.id,
    });
    if (!res.ok) return moliyaXato(res.error, 400);
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    console.error("[miniapp-moliya:yozuv]", redactForLog(e));
    return moliyaXato("Saqlashda xato. Qayta urinib ko'ring.", 500);
  }
}
