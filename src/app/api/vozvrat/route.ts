/**
 * Miniapp'dan yangi VOZVRAT (qaytarish) qabul qilish. Telegram initData + whitelist
 * majburiy. Saqlangach guruhga (filial topigiga) xabar FONDA yuboriladi.
 */
import { NextResponse } from "next/server";
import { vozvratYarat, ruxsatBormi, type VozvratKirim } from "@/lib/spisaniya/db";
import { vozvratGuruhgaYuborish } from "@/lib/spisaniya/notify";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) return NextResponse.json({ xato: "Telegram orqali oching." }, { status: 401 });
  if (!(await ruxsatBormi(user.id))) {
    return NextResponse.json({ xato: "Ruxsat yo'q. Admindan ruxsat oling." }, { status: 403 });
  }

  let d: VozvratKirim;
  try {
    d = (await req.json()) as VozvratKirim;
  } catch {
    return NextResponse.json({ xato: "Noto'g'ri JSON" }, { status: 400 });
  }

  if (!d.tovar || !d.miqdor || !d.summa || !d.filial || !d.yonalish) {
    return NextResponse.json({ xato: "Majburiy maydonlar to'ldirilmagan" }, { status: 400 });
  }
  if (d.status === "qaytarilmadi" && !d.qaytarilmadi_sabab?.trim()) {
    return NextResponse.json({ xato: "Qaytarilmadi sababi kiritilishi shart" }, { status: 400 });
  }

  // Xodimni imzodan olamiz (soxtalashtirilmasin).
  d.xodim_id = user.id;
  d.xodim_ism = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Noma'lum";
  d.xodim_username = user.username ?? null;

  try {
    const id = await vozvratYarat(d);
    void vozvratGuruhgaYuborish(d, id).catch((e) => console.error("[vozvrat→guruh]", e));
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[api/vozvrat]", err);
    return NextResponse.json({ xato: "Vozvrat saqlanmadi. Qaytadan urinib ko'ring." }, { status: 500 });
  }
}
