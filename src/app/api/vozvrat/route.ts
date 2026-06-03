/**
 * Miniapp'dan yangi VOZVRAT (qaytarish) qabul qilish. Telegram initData + whitelist
 * majburiy. Saqlangach guruhga (filial topigiga) xabar FONDA yuboriladi.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { vozvratYarat, ruxsatBormi } from "@/lib/spisaniya/db";
import { vozvratGuruhgaYuborish } from "@/lib/spisaniya/notify";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    tovar: z.string().trim().min(1).max(255),
    miqdor: z.coerce.number().positive().max(1_000_000_000),
    birlik: z.string().trim().max(20).optional().nullable(),
    summa: z.coerce.number().nonnegative().max(1_000_000_000_000),
    sabab: z.string().trim().max(255).optional().nullable(),
    filial: z.string().trim().min(1).max(100),
    yonalish: z.enum(["asosiy_filial", "taminotchi"]),
    taminotchi: z.string().trim().max(255).optional().nullable(),
    status: z.enum(["xabar_berildi", "yuborildi", "qaytarildi", "qaytarilmadi"]).optional(),
    qaytarilmadi_sabab: z.string().trim().max(500).optional().nullable(),
    rasm_file_id: z.string().max(500).optional().nullable(),
  })
  .refine((d) => d.status !== "qaytarilmadi" || !!d.qaytarilmadi_sabab?.trim(), {
    message: "Qaytarilmadi sababi shart",
  });

export async function POST(req: Request) {
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) return NextResponse.json({ xato: "Telegram orqali oching." }, { status: 401 });
  if (!(await ruxsatBormi(user.id))) {
    return NextResponse.json({ xato: "Ruxsat yo'q. Admindan ruxsat oling." }, { status: 403 });
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

  // Xodimni imzodan olamiz (soxtalashtirilmasin).
  const d = {
    ...parsed.data,
    xodim_id: user.id,
    xodim_ism: [user.first_name, user.last_name].filter(Boolean).join(" ") || "Noma'lum",
    xodim_username: user.username ?? null,
  };

  try {
    const id = await vozvratYarat(d);
    void vozvratGuruhgaYuborish(d, id).catch((e) => console.error("[vozvrat→guruh]", e));
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[api/vozvrat]", err);
    return NextResponse.json({ xato: "Vozvrat saqlanmadi. Qaytadan urinib ko'ring." }, { status: 500 });
  }
}
