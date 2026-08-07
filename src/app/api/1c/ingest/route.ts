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
  imzoTekshir,
  HMAC_REQUIRED_KEY,
  IMZO_HEADER,
  VAQT_HEADER,
  IMZO_OYNA_SEK,
} from "@/lib/integratsiya/imzo";
import {
  authTashxis,
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

/**
 * Sozlanmagan yoki noto'g'ri token — 404: endpoint borligini ham oshkor qilmaymiz.
 *
 * Mijozga sabab AYTILMAYDI, lekin jurnalga yoziladi: aks holda hamkor jamoa
 * bilan "404 kelyapti" dan nariga o'tib bo'lmaydi. Token QIYMATI yozilmaydi.
 */
function notFound(req: Request): NextResponse {
  console.warn("[1c-ingest:auth-xato]", JSON.stringify(authTashxis(req, haqiqiyIp(req))));
  return new NextResponse("Not found", { status: 404 });
}

/**
 * Imzo majburiymi. Sozlamalardan o'qiladi (env emas) — 1C imzolashni qo'shgach
 * qayta deploy qilmasdan, bitta tugma bilan yoqiladi.
 */
async function imzoMajburiymi(): Promise<boolean> {
  const row = await prisma.appSetting
    .findUnique({ where: { key: HMAC_REQUIRED_KEY } })
    .catch(() => null);
  return row?.value === "1";
}

export async function GET(req: Request) {
  if (!authorized(req)) return notFound(req);

  // qabulQil=false — ping IP'ni BAND QILMAYDI, faqat tekshiradi. Aks holda
  // ulanishni sinab ko'rgan har qanday kompyuter ro'yxatni egallab olardi va
  // 1C ning haqiqiy so'rovi 403 olardi.
  const ip = haqiqiyIp(req);
  const ipRes = await ipTekshir(ip, false).catch(
    () => ({ ok: true, royxatgaOlindi: false }) as const
  );
  const majburiy = await imzoMajburiymi();
  return NextResponse.json({
    ok: true,
    service: "analitika-bizbop",
    yourIp: ip,
    ipAllowed: ipRes.ok,
    // Server soati — 1C tomon o'z soatini shu bilan solishtirib ko'radi.
    serverTime: Math.floor(Date.now() / 1000),
    signature: {
      required: majburiy,
      configured: Boolean(process.env.ONEC_INGEST_SECRET),
      alg: "HMAC-SHA256",
      headers: { signature: IMZO_HEADER, timestamp: VAQT_HEADER },
      payload: "<timestamp>.<xom tana baytlari>",
      encoding: "hex (kichik harf)",
      clockSkewSeconds: IMZO_OYNA_SEK,
    },
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
  if (!authorized(req)) return notFound(req);

  // IP cheklovi TOKENDAN KEYIN: tokensiz so'rov IP ro'yxatiga ta'sir qilmasin
  // (aks holda tasodifiy skaner birinchi IP bo'lib yozilib qolardi).
  // qabulQil=true — faqat POST ro'yxatni band qila oladi ("birinchi haqiqiy
  // yuborish" prinsipi). Token allaqachon tekshirilgan, ya'ni buni 1C qiladi.
  const ip = haqiqiyIp(req);
  const ipRes = await ipTekshir(ip, true);
  if (!ipRes.ok) {
    await ipJurnal(ip, false);
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

  // Tana BIR MARTA xom bayt sifatida o'qiladi: imzo aynan shu baytlar bo'yicha
  // tekshiriladi, keyin o'shalar dekodlanadi. Matnga aylantirilgandan keyin
  // imzolash noto'g'ri bo'lardi — cp1251 → UTF-8 da baytlar o'zgaradi.
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(await req.arrayBuffer());
  } catch {
    await ipJurnal(ip, true);
    return NextResponse.json({ ok: false, error: "So'rov tanasi o'qilmadi." }, { status: 400 });
  }
  // Content-Length YOLG'ON bo'lishi mumkin — haqiqiy o'lchamni ham tekshiramiz.
  if (raw.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: `So'rov juda katta (${raw.byteLength} bayt). Partiyani kichraytiring.` },
      { status: 413 }
    );
  }

  // HMAC imzo: HTTP (shifrsiz) kanalda tokenni ushlab olish mumkin, imzo kaliti
  // esa simda ketmaydi. Imzo kelgan bo'lsa har doim tekshiriladi.
  const imzoRes = imzoTekshir({
    secret: process.env.ONEC_INGEST_SECRET,
    imzo: req.headers.get(IMZO_HEADER),
    vaqt: req.headers.get(VAQT_HEADER),
    tana: raw,
    talabQilinadi: await imzoMajburiymi(),
  });
  // Jurnal AYNAN shu yerda: imzo holati ma'lum bo'lgach, lekin rad javobidan
  // oldin — imzosi noto'g'ri urinish ham ko'rinib tursin.
  await ipJurnal(ip, true, imzoRes.ok && imzoRes.holat === "tekshirildi");
  if (!imzoRes.ok) {
    console.warn(`[1c-ingest] imzo rad etildi: ${imzoRes.sabab} (ip: ${ip})`);
    return NextResponse.json({ ok: false, error: imzoRes.sabab }, { status: 401 });
  }

  // req.json() ISHLATILMAYDI: u tanani har doim UTF-8 deb o'qiydi va 1C ning
  // windows-1251 chiqishida kirill matnni U+FFFD ga aylantirib YO'Q QILADI.
  // decodeBody kodlashni o'zi aniqlaydi (charset → UTF-8 → cp1251).
  let body: unknown;
  try {
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
