/**
 * Miniapp'dan yangi yozuv qabul qilish (spisaniya / vozvrat / kafe / ovqatlanish).
 * Auth shart emas — Telegram miniapp foydalanuvchisi yuboradi (eski bot bilan bir xil).
 * Saqlangach guruhga xabar + AI kategoriya FONDA ishlaydi (javobni kechiktirmaydi).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { insertYozuv, ruxsatBormi } from "@/lib/spisaniya/db";
import { guruhgaYuborish } from "@/lib/spisaniya/notify";
import { kategoriyalashtirish } from "@/lib/spisaniya/kategoriya";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { rateLimit } from "@/lib/spisaniya/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  tur: z.enum(["spisaniya", "vozvrat", "kafe", "ovqatlanish", "ichki_sotuv"]),
  tovar: z.string().trim().min(1).max(255),
  miqdor: z.coerce.number().positive().max(1_000_000_000),
  birlik: z.string().trim().max(20).optional().nullable(),
  summa: z.coerce.number().nonnegative().max(1_000_000_000_000),
  sabab: z.string().trim().max(255).optional().nullable(),
  filial: z.string().trim().min(1).max(100),
  rasm_file_id: z.string().max(500).optional().nullable(),
  qr_file_id: z.string().max(500).optional().nullable(),
  firma: z.string().trim().max(255).optional().nullable(),
});

export async function POST(req: Request) {
  // Telegram WebApp imzosini tekshiramiz — xodim_id soxtalashtirilmasin.
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) {
    return NextResponse.json({ xato: "Telegram orqali oching." }, { status: 401 });
  }
  if (!rateLimit(`yozuv:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ xato: "Juda ko'p so'rov. Birozdan keyin urinib ko'ring." }, { status: 429 });
  }
  if (!(await ruxsatBormi(user.id))) {
    return NextResponse.json(
      { xato: "Ruxsat yo'q. Iltimos, admindan ruxsat oling." },
      { status: 403 }
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ xato: "Noto'g'ri JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ xato: "Ma'lumotlar noto'g'ri yoki to'liq emas." }, { status: 400 });
  }

  // Xodim ma'lumotini imzolangan user'dan olamiz (client payload'iga ishonmaymiz).
  const d = {
    ...parsed.data,
    xodim_id: user.id,
    xodim_ism: [user.first_name, user.last_name].filter(Boolean).join(" ") || "Noma'lum",
    xodim_username: user.username ?? null,
  };

  try {
    const yozuvId = await insertYozuv(d);

    // Fonda — javobni kutmaymiz.
    void guruhgaYuborish(d, yozuvId).catch((e) => console.error("[yozuv→guruh]", e));
    void kategoriyalashtirish(yozuvId, d.tovar).catch((e) => console.error("[yozuv→kategoriya]", e));

    return NextResponse.json({ ok: true, id: yozuvId });
  } catch (err) {
    // Ichki xato detallarini (jadval/constraint nomlari) mijozga oshkor qilmaymiz.
    console.error("[api/yozuv] DB xato:", err);
    return NextResponse.json({ xato: "Yozuv saqlanmadi. Qaytadan urinib ko'ring." }, { status: 500 });
  }
}
