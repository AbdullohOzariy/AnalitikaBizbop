/**
 * 1C qabul endpointi uchun IP cheklovi — "birinchi kelgan IP" prinsipi (TOFU).
 *
 * NEGA SHUNDAY: 1C tomonining chiquvchi IP'sini oldindan so'rab o'tirish uzoq
 * yozishmaga aylanadi va ular ham ko'pincha aniq bilishmaydi. Shuning uchun
 * BIRINCHI muvaffaqiyatli so'rov kelgan IP avtomatik ro'yxatga olinadi, keyin
 * esa faqat o'sha IP qabul qilinadi.
 *
 * Xavf past: birinchi so'rovni yuborish uchun ham TOKEN kerak, u esa faqat
 * bizda va 1C jamoasida. Ro'yxatga olingan IP Sozlamalarda ko'rinadi va
 * tozalanadi (masalan IP o'zgarsa).
 */
import { prisma } from "@/lib/prisma";

export const IP_SETTING_KEY = "onec_allowed_ips";

/**
 * Haqiqiy mijoz IP'si.
 *
 * TARTIB MUHIM: Cloudflare orqasida `cf-connecting-ip` YAGONA ishonchli manba —
 * uni Cloudflare o'zi qo'yadi va mijoz yuborganini o'chirib tashlaydi.
 * Cloudflare bo'lmasa Railway `x-forwarded-for` ga haqiqiy IP'ni OXIRGI
 * element qilib qo'yadi (birinchisini mijoz soxtalashtirishi mumkin).
 */
export function haqiqiyIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export type IpTekshiruv =
  | { ok: true; royxatgaOlindi: boolean }
  | { ok: false; ip: string; ruxsatEtilgan: string[] };

/** Vergul bilan ajratilgan ro'yxatni tozalab o'qiydi. */
function parseIps(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * IP ruxsat etilganmi. Ro'yxat BO'SH bo'lsa — shu IP ro'yxatga olinadi
 * (birinchi muvaffaqiyatli ulanish).
 *
 * `qabulQil` — bo'sh ro'yxatni SHU IP bilan band qilishga ruxsat. Faqat POST
 * uchun `true`. GET ping `false` bilan chaqiradi: aks holda ulanishni tekshirib
 * ko'rgan har qanday kompyuter (biz o'zimiz ham) ro'yxatni band qilib qo'yadi
 * va keyin 1C ning haqiqiy so'rovi `403` oladi. Bu bir marta sodir bo'lgan.
 */
export async function ipTekshir(ip: string, qabulQil = false): Promise<IpTekshiruv> {
  const row = await prisma.appSetting.findUnique({ where: { key: IP_SETTING_KEY } });
  const ruxsat = parseIps(row?.value);

  if (ruxsat.length === 0) {
    // "unknown" ni ro'yxatga OLMAYMIZ — aks holda cheklov mangu ochiq qolardi.
    if (ip === "unknown" || !qabulQil) return { ok: true, royxatgaOlindi: false };
    await prisma.appSetting.upsert({
      where: { key: IP_SETTING_KEY },
      create: { key: IP_SETTING_KEY, value: ip },
      update: { value: ip },
    });
    return { ok: true, royxatgaOlindi: true };
  }

  if (ruxsat.includes(ip)) return { ok: true, royxatgaOlindi: false };
  return { ok: false, ip, ruxsatEtilgan: ruxsat };
}

/**
 * IP jurnaliga yozadi — RUXSAT BERILGANI ham, RAD ETILGANI ham.
 *
 * IP bo'yicha agregat (har so'rov emas): jadval o'smaydi, lekin "qaysi IP'dan
 * necha marta kelgan" savoliga javob beradi. Rad etilgan urinish 1C ning
 * ikkinchi serveri bo'lishi ham mumkin — buni ko'rmasdan bilib bo'lmaydi.
 *
 * `imzolangan` — so'rov HMAC bilan TO'G'RI imzolangan bo'lsa true. Shu hisob
 * imzoni majburiy qilish xavfsizmi yo'qmi degan savolga javob beradi: agar
 * barcha so'rovlar imzolangan bo'lsa, yoqish oqimni buzmaydi.
 */
export async function ipJurnal(
  ip: string,
  allowed: boolean,
  imzolangan = false
): Promise<void> {
  if (ip === "unknown") return;
  const imzo = imzolangan ? 1 : 0;
  await prisma.onecIpLog
    .upsert({
      where: { ip },
      create: { ip, allowed, requests: 1, signedRequests: imzo },
      update: {
        allowed,
        requests: { increment: 1 },
        signedRequests: { increment: imzo },
      },
    })
    .catch(() => undefined); // jurnal — yordamchi, asosiy oqimni to'xtatmasin
}
