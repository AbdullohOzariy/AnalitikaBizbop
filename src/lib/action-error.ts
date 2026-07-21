import { ZodError } from "zod";
import { AuthorizationError } from "@/lib/auth-helpers";
import { redactForLog } from "@/lib/tg-redact";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Server action xatosini foydalanuvchiga XAVFSIZ xabarga aylantiradi.
 * To'liq xato server log'iga yoziladi; UI'ga DB/Prisma ichki detallari
 * (jadval/ustun nomlari, stack) OSHKOR qilinmaydi.
 *
 * Biznes qoidalari odatda to'g'ridan-to'g'ri `{ ok:false, error }` qaytaradi —
 * bu helper faqat KUTILMAGAN (catch'ga tushgan) xatolar uchun mo'ljallangan.
 */
export function actionError(err: unknown, context?: string): { ok: false; error: string } {
  // Xato OBYEKTI emas, tozalangan matn log'ga yoziladi: telegraf tarmoq xatosi
  // message/stack ichida bot token'li URL olib keladi (Railway loglariga sizardi).
  console.error(`[action${context ? `:${context}` : ""}]`, redactForLog(err));

  if (err instanceof AuthorizationError) return { ok: false, error: "Ruxsat yo'q." };
  if (err instanceof ZodError)
    return { ok: false, error: err.issues[0]?.message || "Kiritilgan ma'lumot noto'g'ri." };

  // Prisma mashhur xato kodlari — tushunarli, lekin ichki detalsiz xabar
  const code = (err as { code?: string })?.code;
  if (code === "P2002") return { ok: false, error: "Bunday yozuv allaqachon mavjud." };
  if (code === "P2003") return { ok: false, error: "Bog'liq yozuvlar bor — amal bajarilmadi." };
  if (code === "P2025") return { ok: false, error: "Yozuv topilmadi." };

  // Aks holda — umumiy xabar (server detallari oshkor bo'lmaydi)
  return { ok: false, error: "Amal bajarilmadi. Birozdan so'ng qayta urinib ko'ring." };
}
