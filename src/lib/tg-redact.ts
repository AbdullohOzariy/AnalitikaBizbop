/**
 * Xato matnlaridan SIRLARNI tozalash (redaksiya).
 *
 * NEGA KERAK: telegraf ichidagi `node-fetch` tarmoq xatosida (ECONNRESET/ETIMEDOUT/DNS —
 * Telegram bilan ishlaganda muntazam hodisa) xato xabariga SO'ROV URL'ini qo'shadi:
 *
 *   request to https://api.telegram.org/bot123456:AAH.../sendDocument failed, reason: ECONNRESET
 *
 * Bu matn keyin log'ga, `CronRun.note` ga (DB), adminga Telegram xabariga va hatto
 * server action javobi orqali brauzerdagi toast'ga tushadi — ya'ni BOT TOKEN oshkor bo'ladi.
 * Shuning uchun Telegram bilan ishlaydigan har bir catch blokida shu yordamchi qo'llanadi.
 *
 * PRINSIP: xabar butunlay tashlanmaydi — faqat sir qismi `***` ga almashadi, qolgan
 * diagnostika (qaysi metod, qanday sabab) saqlanadi.
 */

/**
 * URL ichidagi token: `.../bot<TOKEN>/sendDocument` yoki `.../file/bot<TOKEN>/...`.
 * `bot` prefiksi aniq belgi, shuning uchun tokendan keyin uzunlik sharti shart emas.
 */
const BOT_URL_TOKEN = /bot\d{6,}:[A-Za-z0-9_-]+/g;

/**
 * URL'siz xom token: `123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`.
 * Ikki nuqtali oddiy matnni (masalan `12:30:45`, `409:Conflict`) buzmaslik uchun
 * ikkinchi qism kamida 20 belgi bo'lishi talab qilinadi — real token 35 belgi.
 */
const RAW_TOKEN = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g;

/**
 * URL'dagi login:parol (`postgres://user:parol@host`, `redis://...`).
 * Prisma ulanish xatolari (P1001 va h.k.) ba'zan DSN'ni xabarga qo'shadi.
 */
const URL_CREDENTIALS = /(\/\/)[^/\s:@]+:[^/\s:@]+@/g;

/** Matndagi sirlarni `***` bilan almashtiradi. Boshqa hech narsani o'zgartirmaydi. */
export function redactSecrets(text: string): string {
  return text
    .replace(BOT_URL_TOKEN, "bot***")
    .replace(RAW_TOKEN, "***")
    .replace(URL_CREDENTIALS, "$1***:***@");
}

/**
 * Xatodan FOYDALANUVCHIGA/xabarnomaga yaroqli tozalangan matn.
 * Faqat `message` (stack'siz) — UI toast va Telegram xabari uchun.
 */
export function redactError(err: unknown): string {
  return redactSecrets(err instanceof Error ? err.message : String(err));
}

/**
 * Xatodan LOG uchun tozalangan matn — stack saqlanadi (server log'ida diagnostika kerak).
 * `console.error("[joy]", redactForLog(err))` ko'rinishida ishlating: xato OBYEKTINI
 * to'g'ridan-to'g'ri log'ga bermang, aks holda tozalanmagan `message`/`stack` chiqadi.
 */
export function redactForLog(err: unknown): string {
  if (err instanceof Error) return redactSecrets(err.stack || err.message);
  // Obyekt uchun String() "[object Object]" beradi — ilgari console.error(..., err)
  // obyektni pretty-print qilardi, ya'ni redaksiya diagnostikani yeb qo'yardi
  // (masalan Prisma bo'lmagan rad javobi: { code, meta }).
  if (err !== null && typeof err === "object") {
    try {
      return redactSecrets(JSON.stringify(err));
    } catch {
      // aylanma havola va h.k. — String() ga tushamiz
    }
  }
  return redactSecrets(String(err));
}
