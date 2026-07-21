import { prisma } from "@/lib/prisma";
import { getBot } from "@/lib/spisaniya/bot";
import { todayTashkentISO } from "@/lib/date";
import { redactError, redactForLog } from "@/lib/tg-redact";

/** Adminga (ADMIN_IDS[0]) qisqa Telegram ogohlantirish. Bot/ID yo'q bo'lsa jim o'tadi. */
export async function notifyAdmin(text: string): Promise<void> {
  const bot = getBot();
  if (!bot) return;
  const id = (process.env.ADMIN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean)[0];
  if (!id) return;
  await bot.telegram.sendMessage(id, text).catch(() => {});
}

/**
 * Cron ishini ishonchli bajaradi:
 *  (1) DEDUP — bugungi kun uchun CronRun yozuvini EGALLAB oladi (@@unique[job,dayKey]).
 *      Konflikt (P2002) = allaqachon bajarilgan (replika / zero-downtime deploy / startup
 *      catch-up ustma-ust) → jim chiqadi, ikki marta yubormaydi.
 *  (2) RETRY — xatoda 1 marta (60s keyin) qayta uriniladi (Neon/Telegram lahzalik uzilishi).
 *  (3) ALERT — yakuniy muvaffaqiyatsizlikda adminga Telegram xabar + CronRun.status=error.
 * Shu tarzda hisobot "jimgina yo'qolmaydi" va dublikat bo'lmaydi.
 */
export async function runCron(job: string, fn: () => Promise<void>): Promise<void> {
  const dayKey = todayTashkentISO();
  try {
    await prisma.cronRun.create({ data: { job, dayKey } });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return; // dedup: allaqachon bajarilgan
    console.warn(`[cron:${job}] dedup yozuvi xatosi (baribir bajaramiz):`, redactForLog(e));
  }
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await fn();
      await prisma.cronRun.updateMany({ where: { job, dayKey }, data: { status: "ok" } }).catch(() => {});
      return;
    } catch (e) {
      lastErr = e;
      console.error(`[cron:${job}] urinish ${attempt}/2 xato:`, redactForLog(e));
      if (attempt < 2) await new Promise((r) => setTimeout(r, 60_000));
    }
  }
  // SIR: telegraf tarmoq xatosi xabarga bot token'li URL'ni qo'shadi. Bu matn
  // CronRun.note ga (DB) yoziladi va adminga Telegram orqali ketadi — avval tozalanadi.
  const msg = redactError(lastErr);
  await prisma.cronRun.updateMany({ where: { job, dayKey }, data: { status: "error", note: msg.slice(0, 300) } }).catch(() => {});
  await notifyAdmin(`❌ Cron "${job}" bajarilmadi (2 urinish): ${msg}`);
}
