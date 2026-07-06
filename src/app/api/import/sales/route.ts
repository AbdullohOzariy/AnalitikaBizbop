import { NextRequest, NextResponse } from "next/server";
import { importSalesViaToken } from "@/app/(app)/admin/upload/actions";
import { rateLimit, clientIp } from "@/lib/spisaniya/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 1C avto sotuv importi. QC/1C tomonidan rejalashtirilgan HTTP POST bilan kuniga bir
 * (yoki bir necha) marta chaqiriladi — qo'lda /admin/upload o'rniga.
 *
 *   POST /api/import/sales
 *   Auth:  header `X-Import-Token: <IMPORT_TOKEN>`  (yoki `?token=<...>`)
 *   Body:  multipart/form-data — `file=<xlsx>` [, `label`, `period=YYYY-MM-DD`]
 *          YOKI to'g'ridan-to'g'ri xlsx (raw body) + `?filename=` (ixtiyoriy)
 *
 *   Javob: JSON `{ ok: true, fileId, summary }` yoki `{ ok: false, error }`.
 *          HTTP: 200 muvaffaqiyat, 401 token, 409 dublikat, 400/500 xato.
 *
 * Sotuv formati /admin/upload dagi bilan bir xil (1C eksporti). Dublikat fayl (bir xil
 * tarkib) hash bo'yicha e'tiborsiz qoldiriladi — 1C xato bermay qayta yuboraverishi mumkin.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // Rate-limit: import kuniga bir-ikki marta bo'ladi — flood/abuse'ni to'sadi.
  if (!rateLimit(`import:${ip}`, 30, 60 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Juda ko'p so'rov. Keyinroq urinib ko'ring." }, { status: 429 });
  }

  // IP-allowlist (ixtiyoriy, lekin TAVSIYA etiladi): IMPORT_ALLOWED_IPS o'rnatilgan bo'lsa,
  // faqat o'sha IP'lardan qabul qilinadi. Token tarqalib ketsa ham, begona manbadan
  // yuborilgani o'tmaydi (token + IP = ikki omil). Bo'sh bo'lsa — faqat token bilan.
  const allow = (process.env.IMPORT_ALLOWED_IPS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length > 0 && !allow.includes(ip)) {
    console.warn(`[api/import/sales] ruxsatsiz IP: ${ip}`);
    return NextResponse.json({ ok: false, error: "Ruxsat etilmagan manba (IP)." }, { status: 403 });
  }

  const token =
    req.headers.get("x-import-token") || req.nextUrl.searchParams.get("token") || "";
  const ctype = req.headers.get("content-type") || "";
  try {
    let bytes: ArrayBuffer;
    let filename = req.nextUrl.searchParams.get("filename") || "1c-sales.xlsx";
    let label: string | undefined;
    let period: string | undefined = req.nextUrl.searchParams.get("period") || undefined;

    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const f = form.get("file");
      if (!(f instanceof File) || f.size === 0) {
        return NextResponse.json({ ok: false, error: "file topilmadi." }, { status: 400 });
      }
      bytes = await f.arrayBuffer();
      filename = f.name || filename;
      label = (form.get("label") as string) || undefined;
      period = (form.get("period") as string) || period;
    } else {
      // Raw xlsx body (1C to'g'ridan-to'g'ri fayl oqimini yuborsa)
      bytes = await req.arrayBuffer();
      label = req.nextUrl.searchParams.get("label") || undefined;
      if (bytes.byteLength === 0) {
        return NextResponse.json({ ok: false, error: "Bo'sh body." }, { status: 400 });
      }
    }

    const res = await importSalesViaToken({ token, filename, label, period, bytes });
    if (res.ok) return NextResponse.json(res, { status: 200 });

    const err = res.error || "";
    const status = err.includes("Token")
      ? 401
      : err.toLowerCase().includes("avval yuklangan")
        ? 409 // dublikat fayl
        : 400;
    return NextResponse.json(res, { status });
  } catch (err) {
    console.error("[api/import/sales]", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Import xatosi." }, { status: 500 });
  }
}
