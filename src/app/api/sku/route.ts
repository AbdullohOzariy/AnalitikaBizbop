/**
 * Miniapp SKU katalogi (asosiy Prisma bazadan; yozuv bizbop'ga sku_kod bilan yoziladi).
 * Rejimlar: ?q= — qidiruv (nom/kod) | ?subId=&page= — sub tovarlari | parametrsiz — daraxt.
 * Hammasi xodimning BotUserCategory scope'i ichida (biriktirma yo'q = to'liq katalog).
 */
import { NextResponse } from "next/server";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { rateLimit } from "@/lib/spisaniya/rate-limit";
import { ruxsatBormi } from "@/lib/spisaniya/db";
import { getBotUserScope, skuDaraxt, skuRoyxat, skuQidiruv } from "@/lib/spisaniya/sku-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) return NextResponse.json({ xato: "Telegram orqali oching." }, { status: 401 });
  // Qidiruv har tugmada chaqiriladi — limit boshqa endpointlardan kengroq
  if (!rateLimit(`sku:${user.id}`, 120, 60_000)) {
    return NextResponse.json({ xato: "Juda ko'p so'rov" }, { status: 429 });
  }
  if (!(await ruxsatBormi(user.id))) {
    return NextResponse.json({ xato: "Ruxsat yo'q. Admindan ruxsat oling." }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  try {
    const scope = await getBotUserScope(user.id);

    const q = (sp.get("q") ?? "").trim();
    if (q) {
      if (q.length < 2 || q.length > 60) {
        return NextResponse.json({ xato: "Qidiruv 2-60 belgi bo'lsin." }, { status: 400 });
      }
      return NextResponse.json(await skuQidiruv(scope, q));
    }

    const subIdRaw = sp.get("subId");
    if (subIdRaw) {
      const subId = Number(subIdRaw);
      if (!Number.isInteger(subId) || subId <= 0) {
        return NextResponse.json({ xato: "subId noto'g'ri." }, { status: 400 });
      }
      const sahifa = Math.min(Math.max(Math.trunc(Number(sp.get("page")) || 1), 1), 200);
      return NextResponse.json(await skuRoyxat(scope, subId, sahifa));
    }

    return NextResponse.json({ daraxt: await skuDaraxt(scope) });
  } catch (err) {
    console.error("[api/sku]", err instanceof Error ? err.message : err);
    return NextResponse.json({ xato: "Server xatosi" }, { status: 500 });
  }
}
