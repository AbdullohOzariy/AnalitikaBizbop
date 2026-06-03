/**
 * Miniapp'dan yangi yozuv qabul qilish (spisaniya / vozvrat / kafe / ovqatlanish).
 * Auth shart emas — Telegram miniapp foydalanuvchisi yuboradi (eski bot bilan bir xil).
 * Saqlangach guruhga xabar + AI kategoriya FONDA ishlaydi (javobni kechiktirmaydi).
 */
import { NextResponse } from "next/server";
import { insertYozuv, ruxsatBormi, type YozuvKirim } from "@/lib/spisaniya/db";
import { guruhgaYuborish } from "@/lib/spisaniya/notify";
import { kategoriyalashtirish } from "@/lib/spisaniya/kategoriya";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Telegram WebApp imzosini tekshiramiz — xodim_id soxtalashtirilmasin.
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) {
    return NextResponse.json({ xato: "Telegram orqali oching." }, { status: 401 });
  }
  if (!(await ruxsatBormi(user.id))) {
    return NextResponse.json(
      { xato: "Ruxsat yo'q. Iltimos, admindan ruxsat oling." },
      { status: 403 }
    );
  }

  let d: YozuvKirim;
  try {
    d = (await req.json()) as YozuvKirim;
  } catch {
    return NextResponse.json({ xato: "Noto'g'ri JSON" }, { status: 400 });
  }

  if (!d.tovar || !d.miqdor || !d.summa || !d.filial || !d.tur) {
    return NextResponse.json({ xato: "Majburiy maydonlar to'ldirilmagan" }, { status: 400 });
  }

  // Xodim ma'lumotini imzolangan user'dan olamiz (client payload'iga ishonmaymiz).
  d.xodim_id = user.id;
  d.xodim_ism = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Noma'lum";
  d.xodim_username = user.username ?? null;

  try {
    const yozuvId = await insertYozuv(d);

    // Fonda — javobni kutmaymiz.
    void guruhgaYuborish(d, yozuvId).catch((e) => console.error("[yozuv→guruh]", e));
    void kategoriyalashtirish(yozuvId, d.tovar).catch((e) => console.error("[yozuv→kategoriya]", e));

    return NextResponse.json({ ok: true, id: yozuvId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server xatosi";
    console.error("[api/yozuv] DB xato:", msg);
    return NextResponse.json({ xato: msg }, { status: 500 });
  }
}
