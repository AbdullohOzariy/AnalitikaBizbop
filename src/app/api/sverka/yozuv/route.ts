/**
 * Sverka Mini App: yozuv yaratish. Rasm avval /api/rasm-yukla orqali yuklanib
 * file_id olinadi, so'ng shu endpoint to'liq yozuvni saqlaydi.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyInitData } from "@/lib/spisaniya/telegram-auth";
import { sverkaRuxsatBormi } from "@/lib/sverka/ruxsat";
import { rateLimit } from "@/lib/spisaniya/rate-limit";
import { getSverkaGroupChatId, getSverkaTopicId } from "@/lib/sverka/sozlama";
import { getBot } from "@/lib/spisaniya/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  sana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplierId: z.coerce.number().int().positive().nullable().optional(),
  firmaNomi: z.string().trim().min(1).max(200),
  sklad: z.string().trim().min(1).max(200),
  kontragent: z.string().trim().min(1).max(200),
  dagavor: z.string().trim().min(1).max(200),
  summa: z.coerce.number().positive().max(1_000_000_000_000),
  rasmFileId: z.string().min(10).max(200),
});

export async function POST(req: Request) {
  const user = verifyInitData(req.headers.get("x-telegram-init-data") || "");
  if (!user) return NextResponse.json({ xato: "Telegram orqali oching." }, { status: 401 });
  if (!rateLimit(`sverka-y:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ xato: "Juda ko'p yozuv. Birozdan keyin urinib ko'ring." }, { status: 429 });
  }
  if (!(await sverkaRuxsatBormi(user.id))) {
    return NextResponse.json({ xato: "Ruxsat yo'q. Admindan ruxsat oling." }, { status: 403 });
  }

  let p: z.infer<typeof schema>;
  try {
    p = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ xato: "Maydonlar to'liq emas yoki noto'g'ri." }, { status: 400 });
  }

  // supplierId berilgan bo'lsa bazada mavjudligini tekshiramiz (firmaNomi snapshot qoladi)
  if (p.supplierId) {
    const sup = await prisma.supplier.findUnique({ where: { id: p.supplierId }, select: { id: true } });
    if (!sup) p.supplierId = null;
  }

  const ism = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || null;
  const rec = await prisma.sverkaRecord.create({
    data: {
      sana: new Date(p.sana + "T00:00:00.000Z"),
      supplierId: p.supplierId ?? null,
      firmaNomi: p.firmaNomi,
      sklad: p.sklad,
      kontragent: p.kontragent,
      dagavor: p.dagavor,
      summa: p.summa,
      rasmFileId: p.rasmFileId,
      tgUserId: BigInt(user.id),
      tgUserName: ism,
    },
    select: { id: true },
  });

  // Guruhga yuborish (Sozlamalar → Sverka'da belgilanadi) — xato yozuvni buzmaydi
  try {
    const chatId = await getSverkaGroupChatId();
    const bot = getBot();
    if (chatId && bot) {
      // Sklad filialga mos kelsa — o'sha filial topigiga (Sozlamalar → Sverka)
      const topicId = await getSverkaTopicId(p.sklad);
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const caption =
        `📑 <b>Sverka #${rec.id}</b>\n` +
        `📅 ${p.sana}\n` +
        `🏢 ${esc(p.firmaNomi)}\n` +
        `🏬 Sklad: ${esc(p.sklad)}\n` +
        `👤 Kontragent: ${esc(p.kontragent)}\n` +
        `📄 Dagavor: ${esc(p.dagavor)}\n` +
        `💰 <b>${p.summa.toLocaleString("uz-UZ")} so'm</b>\n` +
        `✍️ ${esc(ism ?? String(user.id))}`;
      await bot.telegram.sendPhoto(chatId, p.rasmFileId, {
        caption,
        parse_mode: "HTML",
        ...(topicId != null ? { message_thread_id: topicId } : {}),
      });
    }
  } catch (e) {
    console.warn("[sverka] guruhga yuborilmadi:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, id: rec.id });
}
