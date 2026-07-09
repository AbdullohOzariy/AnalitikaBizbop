/**
 * Miniapp'dan yangi VOZVRAT (qaytarish) qabul qilish. Telegram initData + whitelist
 * majburiy. Saqlangach guruhga (filial topigiga) xabar FONDA yuboriladi.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { vozvratYarat, ruxsatBormi } from "@/lib/spisaniya/db";
import { vozvratGuruhgaYuborish } from "@/lib/spisaniya/notify";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { rateLimit } from "@/lib/spisaniya/rate-limit";
import { getBotUserScope } from "@/lib/spisaniya/sku-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  tovar: z.string().trim().min(1).max(255),
  miqdor: z.coerce.number().positive().max(1_000_000_000),
  birlik: z.string().trim().max(20).optional().nullable(),
  summa: z.coerce.number().nonnegative().max(1_000_000_000_000),
  sabab: z.string().trim().max(255).optional().nullable(),
  filial: z.string().trim().min(1).max(100),
  yonalish: z.enum(["asosiy_filial", "taminotchi"]),
  taminotchi: z.string().trim().max(255).optional().nullable(),
  // status — lenient: eski qiymat kelsa ham vozvratYarat joriy holatga normallashtiradi
  status: z.string().trim().optional(),
  qaytarilmadi_sabab: z.string().trim().max(500).optional().nullable(),
  rasm_file_id: z.string().max(500).optional().nullable(),
  // SKU katalogdan tanlangan bo'lsa — Product.code (1C kod)
  sku_kod: z.number().int().positive().optional().nullable(),
});

export async function POST(req: Request) {
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) return NextResponse.json({ xato: "Telegram orqali oching." }, { status: 401 });
  if (!rateLimit(`vozvrat:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ xato: "Juda ko'p so'rov. Birozdan keyin urinib ko'ring." }, { status: 429 });
  }
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

  // SKU tanlangan bo'lsa — nom haqiqat manbai katalog. Yaroqsiz (yo'q/arxiv/scope'dan
  // tashqari) sku_kod JIMGINA e'tiborsiz qoldiriladi (200): 400 farqi mavjudlik-probing
  // oracle bo'lardi. Yozuvning o'zi scope'siz — xodim qo'lda ham istalgan matn yoza olardi.
  let tovar = parsed.data.tovar;
  let skuKod: number | null = parsed.data.sku_kod ?? null;
  if (skuKod != null) {
    const prod = await prisma.product.findUnique({
      where: { code: skuKod },
      select: { name: true, categoryId: true, archivedAt: true },
    });
    const scope = prod && !prod.archivedAt ? await getBotUserScope(user.id) : null;
    const scopeOk =
      !!prod && !prod.archivedAt &&
      (scope === null || (prod.categoryId != null && scope.has(prod.categoryId)));
    if (scopeOk && prod) tovar = prod.name.slice(0, 255);
    else skuKod = null;
  }

  // Xodimni imzodan olamiz (soxtalashtirilmasin).
  const d = {
    ...parsed.data,
    tovar,
    sku_kod: skuKod,
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
