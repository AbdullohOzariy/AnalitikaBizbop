/**
 * 1C → Analitika: hodisalarni QABUL QILUVCHI endpoint.
 *
 *   POST /api/1c/ingest    — chek/hujjat yuborish (bitta yoki partiya)
 *   GET  /api/1c/ingest    — ulanishni tekshirish (ping)
 *
 * Auth: `Authorization: Bearer <ONEC_INGEST_TOKEN>` yoki `X-Ingest-Token` header.
 *
 * KAFOLAT: 200 qaytdi = ma'lumot BAZAGA YOZILDI. Qayta ishlash keyin bo'ladi,
 * lekin xom payload yo'qolmaydi. Shuning uchun 1C tomonda "yuborildi" deb
 * belgilashga 200 javobi yetarli.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { after } from "next/server";
import { redactForLog } from "@/lib/tg-redact";
import { cheklarniQaytaIshla } from "@/lib/integratsiya/chek-saqla";
import { haqiqiyIp, ipTekshir, ipJurnal } from "@/lib/integratsiya/ip-cheklov";
import {
  decodeBody,
  extractEvents,
  normalizeEvent,
  tokenMatches,
  MAX_EVENTS_PER_REQUEST,
  MAX_BODY_BYTES,
} from "@/lib/integratsiya/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const expected = process.env.ONEC_INGEST_TOKEN || "";
  if (!expected) return false; // token sozlanmagan — endpoint yopiq
  const bearer = req.headers.get("authorization") || "";
  const got = bearer.toLowerCase().startsWith("bearer ")
    ? bearer.slice(7).trim()
    : (req.headers.get("x-ingest-token") || "").trim();
  return tokenMatches(got, expected);
}

/** Sozlanmagan yoki noto'g'ri token — 404: endpoint borligini ham oshkor qilmaymiz. */
const notFound = () => new NextResponse("Not found", { status: 404 });

export async function GET(req: Request) {
  if (!authorized(req)) return notFound();

  // Ping IP'ni RO'YXATGA OLMAYDI — faqat tekshiradi. Aks holda test uchun
  // boshqa kompyuterdan qilingan ping IP'ni band qilib qo'yardi.
  const ip = haqiqiyIp(req);
  const ipRes = await ipTekshir(ip).catch(() => ({ ok: true, royxatgaOlindi: false }) as const);
  return NextResponse.json({
    ok: true,
    service: "analitika-bizbop",
    yourIp: ip,
    ipAllowed: ipRes.ok,
    // 1C tomon nima kutilishini shu javobdan ko'radi — hujjat izlab yurmasin.
    accepts: {
      method: "POST",
      contentType: "application/json",
      shapes: ["{...}", "[{...}]", "{ events: [{...}] }"],
      event: {
        kind: "ЧекККМ | ПоступлениеТоваровУслуг | ПеремещениеТоваров | ...",
        id: "Ref_Key (GUID)",
        number: "Номер",
        date: "Дата (ISO)",
        data: "hujjat tanasi — istalgan tuzilma",
      },
      maxEventsPerRequest: MAX_EVENTS_PER_REQUEST,
      maxBodyBytes: MAX_BODY_BYTES,
    },
  });
}

export async function POST(req: Request) {
  if (!authorized(req)) return notFound();

  // IP cheklovi TOKENDAN KEYIN: tokensiz so'rov IP ro'yxatiga ta'sir qilmasin
  // (aks holda tasodifiy skaner birinchi IP bo'lib yozilib qolardi).
  const ip = haqiqiyIp(req);
  const ipRes = await ipTekshir(ip);
  await ipJurnal(ip, ipRes.ok);
  if (!ipRes.ok) {
    console.warn(`[1c-ingest] ruxsatsiz IP: ${ipRes.ip} (ruxsat: ${ipRes.ruxsatEtilgan.join(", ")})`);
    return NextResponse.json(
      { ok: false, error: "Bu IP manzildan qabul qilinmaydi." },
      { status: 403 }
    );
  }
  if (ipRes.royxatgaOlindi) {
    console.log(`[1c-ingest] birinchi ulanish — IP ro'yxatga olindi: ${ip}`);
  }

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: `So'rov juda katta (${len} bayt). Partiyani kichraytiring.` },
      { status: 413 }
    );
  }

  // req.json() ISHLATILMAYDI: u tanani har doim UTF-8 deb o'qiydi va 1C ning
  // windows-1251 chiqishida kirill matnni U+FFFD ga aylantirib YO'Q QILADI.
  // decodeBody kodlashni o'zi aniqlaydi (charset → UTF-8 → cp1251).
  let body: unknown;
  try {
    const raw = new Uint8Array(await req.arrayBuffer());
    body = JSON.parse(decodeBody(raw, req.headers.get("content-type")));
  } catch {
    return NextResponse.json({ ok: false, error: "JSON parse qilinmadi." }, { status: 400 });
  }

  const extracted = extractEvents(body);
  if ("error" in extracted) {
    return NextResponse.json({ ok: false, error: extracted.error }, { status: 400 });
  }
  if (extracted.length === 0) {
    return NextResponse.json({ ok: true, accepted: 0, duplicates: 0, batchId: null });
  }
  if (extracted.length > MAX_EVENTS_PER_REQUEST) {
    return NextResponse.json(
      {
        ok: false,
        error: `Bir so'rovda ${MAX_EVENTS_PER_REQUEST} tadan ko'p hodisa yuborilmasin (kelgan: ${extracted.length}).`,
      },
      { status: 413 }
    );
  }

  const batchId = crypto.randomUUID();

  try {
    const normalized = extracted.map(normalizeEvent);

    // Partiya ICHIDAGI dublikatlar: createMany skipDuplicates faqat BAZAdagi
    // to'qnashuvni bosadi, bir so'rovdagi ikkita bir xil qatorni emas.
    const seen = new Set<string>();
    const unique = normalized.filter((e) => {
      if (seen.has(e.payloadHash)) return false;
      seen.add(e.payloadHash);
      return true;
    });

    const res = await prisma.integrationEvent.createMany({
      data: unique.map((e) => ({
        kind: e.kind,
        externalId: e.externalId,
        externalNo: e.externalNo,
        occurredAt: e.occurredAt,
        payload: e.payload as object,
        payloadHash: e.payloadHash,
        batchId,
      })),
      skipDuplicates: true, // takroriy yuborish xavfsiz (idempotent)
    });

    // Qayta ishlash JAVOBDAN KEYIN — 1C kutib turmasin va u yiqilsa ham
    // xom hodisa allaqachon saqlangan bo'ladi (200 kafolati buzilmaydi).
    if (res.count > 0) {
      after(async () => {
        try {
          await cheklarniQaytaIshla(Math.min(res.count * 2, 500));
        } catch (e) {
          console.error("[1c-ingest:qayta-ishlash]", redactForLog(e));
        }
      });
    }

    return NextResponse.json({
      ok: true,
      batchId,
      received: extracted.length,
      accepted: res.count,
      duplicates: extracted.length - res.count,
    });
  } catch (err) {
    console.error("[1c-ingest]", redactForLog(err));
    // 500 qaytaramiz — 1C qayta yuborsin. payloadHash unique bo'lgani uchun
    // qayta yuborish dubl yaratmaydi.
    return NextResponse.json(
      { ok: false, error: "Saqlashda xato. Qayta yuboring." },
      { status: 500 }
    );
  }
}
