/**
 * Miniapp'dan yangi yozuv qabul qilish (spisaniya / vozvrat / kafe / ovqatlanish).
 * Auth shart emas — Telegram miniapp foydalanuvchisi yuboradi (eski bot bilan bir xil).
 * Saqlangach guruhga xabar + AI kategoriya FONDA ishlaydi (javobni kechiktirmaydi).
 */
import { NextResponse } from "next/server";
import { insertYozuv, type YozuvKirim } from "@/lib/spisaniya/db";
import { guruhgaYuborish } from "@/lib/spisaniya/notify";
import { kategoriyalashtirish } from "@/lib/spisaniya/kategoriya";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let d: YozuvKirim;
  try {
    d = (await req.json()) as YozuvKirim;
  } catch {
    return NextResponse.json({ xato: "Noto'g'ri JSON" }, { status: 400 });
  }

  if (!d.tovar || !d.miqdor || !d.summa || !d.filial || !d.tur) {
    return NextResponse.json({ xato: "Majburiy maydonlar to'ldirilmagan" }, { status: 400 });
  }

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
