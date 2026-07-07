import { NextRequest, NextResponse } from "next/server";
import zlib from "node:zlib";
import { importSalesJsonViaToken } from "@/app/(app)/admin/upload/actions";
import { rateLimit, clientIp } from "@/lib/spisaniya/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 1C kunlik JSON importi — sotuv (filial kesimida narx/tannarx/qoldiq bilan) +
 * markaziy sklad qoldig'i. 1C rejalashtirilgan ish kuniga bir (yoki bir necha)
 * marta chaqiradi.
 *
 *   POST /api/import/kunlik
 *   Auth:  header `X-Import-Token: <IMPORT_TOKEN>`  (yoki `?token=<...>`)
 *   Body (application/json):
 *   {
 *     "sana": "2026-07-07",
 *     "sotuv": [
 *       { "filial": "Market MEGA", "kod": 50911, "nom": "Coca Cola 1L",
 *         "qoldiq": 12.5, "soni": 3, "narx": 8000, "tannarx": 6000,
 *         "summa": 24000, "tansumma": 18000 }
 *     ],
 *     "sklad": [ { "kod": 50911, "qoldiq": 340 } ]
 *   }
 *   summa/tansumma ixtiyoriy (bo'lmasa soni×narx / soni×tannarx); sklad ixtiyoriy.
 *
 *   Javob: { ok: true, fileId, summary, sklad? } yoki { ok: false, error }.
 *   HTTP: 200 muvaffaqiyat, 401 token, 403 IP, 409 dublikat, 400/500 xato.
 *
 * Bir xil body ikki marta kelsa hash bo'yicha dublikat (409) — qayta yuborish xavfsiz.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  if (!rateLimit(`import-json:${ip}`, 30, 60 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Juda ko'p so'rov. Keyinroq urinib ko'ring." }, { status: 429 });
  }

  // IP-allowlist (IMPORT_ALLOWED_IPS o'rnatilgan bo'lsa) — /api/import/sales bilan bir xil.
  const allow = (process.env.IMPORT_ALLOWED_IPS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length > 0 && !allow.includes(ip)) {
    console.warn(`[api/import/kunlik] ruxsatsiz IP: ${ip}`);
    return NextResponse.json({ ok: false, error: "Ruxsat etilmagan manba (IP)." }, { status: 403 });
  }

  const token =
    req.headers.get("x-import-token") || req.nextUrl.searchParams.get("token") || "";

  // Body'ni xom o'qib, kerak bo'lsa ochamiz (Content-Encoding: gzip/deflate). Katta JSON
  // (kirill UTF-8 → 8mln belgi ~16MB) route-body chegarasidan oshadi; 1C gzip yuborsa,
  // sim orqali ~1-2MB bo'lib chegaradan o'tadi, server bu yerda ochadi.
  let body: unknown;
  try {
    const raw = Buffer.from(await req.arrayBuffer());
    const enc = (req.headers.get("content-encoding") || "").toLowerCase();
    const text = enc.includes("gzip")
      ? zlib.gunzipSync(raw).toString("utf8")
      : enc.includes("deflate")
        ? zlib.inflateSync(raw).toString("utf8")
        : raw.toString("utf8");
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON emas (yoki gzip ochilmadi)." }, { status: 400 });
  }

  try {
    const res = await importSalesJsonViaToken({ token, body });
    if (res.ok) return NextResponse.json(res, { status: 200 });

    const err = res.error || "";
    const status = err.includes("Token")
      ? 401
      : err.toLowerCase().includes("avval yuklangan")
        ? 409 // dublikat body
        : 400;
    return NextResponse.json(res, { status });
  } catch (err) {
    console.error("[api/import/kunlik]", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Import xatosi." }, { status: 500 });
  }
}
