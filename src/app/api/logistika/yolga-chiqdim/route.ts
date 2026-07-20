/**
 * Yangi reys ochish (Trip + 1-plecho) — miniappdagi yuk chipini bosish.
 *
 * ━━ QULF ━━
 * "Bu moshina band emasmi?" tekshiruvi ILOVADA EMAS — Postgres partial unique
 * indekslarida (Trip_open_per_vehicle_uniq / Trip_open_per_driver_uniq). Ilova
 * faqat P2002'ni ODAMGA TUSHUNARLI matnga aylantiradi. Sabab: ikki haydovchi
 * bir soniyada bir moshinani olsa, SELECT-keyin-INSERT ikkalasini ham o'tkazib
 * yuborardi — indeks esa aniq bittasini rad etadi.
 *
 * ━━ IDEMPOTENTLIK ━━
 * Tarmoq uzilib qayta yuborilgan so'rov 409 EMAS, 200 replay qaytaradi:
 * haydovchi allaqachon yozilgan reys uchun xato ko'rmasligi kerak. Shu sababli
 * P2002 kelganda AVVAL clientEventId qaraladi, keyin qulf.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { reysXabarYubor } from "@/lib/logistika/notify";
import {
  authDriver,
  ruxsatYoq,
  xato400,
  xato409,
  xato500,
  bandXabar,
  clientEventId,
  gpsSchema,
  koord,
  p2002,
  sana,
} from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  clientEventId,
  vehicleId: z.number().int().positive(),
  fromPointId: z.number().int().positive(),
  toPointId: z.number().int().positive(),
  load: z.enum(["EMPTY", "QUARTER", "HALF", "FULL"]),
  ...gpsSchema,
});

/** Shu clientEventId bilan reys allaqachon yozilganmi? (replay) */
async function replayTop(ceid: string, driverId: number) {
  const t = await prisma.trip.findUnique({
    where: { clientEventId: ceid },
    select: {
      id: true,
      driverId: true,
      legs: { orderBy: { seq: "asc" }, take: 1, select: { id: true } },
    },
  });
  // Boshqa haydovchining ceid'i — replay emas (amalda bo'lmaydi, UUID).
  if (!t || t.driverId !== driverId) return null;
  return NextResponse.json({
    ok: true,
    replay: true,
    tripId: t.id,
    legId: t.legs[0]?.id ?? null,
  });
}

export async function POST(req: Request) {
  const auth = await authDriver(req);
  if (!auth) return ruxsatYoq();
  const me = auth.driver;

  let p: z.infer<typeof schema>;
  try {
    p = schema.parse(await req.json());
  } catch {
    return xato400("Ma'lumot to'liq emas");
  }
  if (p.fromPointId === p.toPointId) {
    return xato409("Qayerdan va qayerga bir xil bo'lishi mumkin emas");
  }

  try {
    // 1) Takroriy so'rovmi?
    const replay = await replayTop(p.clientEventId, me.id);
    if (replay) return replay;

    // 2) Ma'lumotnoma yaroqliligi — FK xatosi o'rniga tushunarli javob.
    const [vehicle, nuqtalar] = await Promise.all([
      prisma.vehicle.findFirst({
        where: { id: p.vehicleId, isActive: true },
        select: { id: true },
      }),
      prisma.logisticsPoint.findMany({
        where: { id: { in: [p.fromPointId, p.toPointId] }, isActive: true },
        select: { id: true },
      }),
    ]);
    if (!vehicle) return xato409("Moshina topilmadi yoki faol emas");
    if (nuqtalar.length !== 2) return xato409("Nuqta topilmadi yoki faol emas");

    // 3) Qulf band emasmi? (do'stona javob uchun — haqiqiy to'siq indeksda)
    const band = await bandXabar(p.vehicleId, me.id);
    if (band) return xato409(band);

    // 4) Yozamiz. Nested create — Trip va 1-plecho bitta atomik amalda.
    //    startedAt/departedAt: DB default now() = SERVER vaqti (yagona haqiqat).
    const trip = await prisma.trip.create({
      data: {
        vehicleId: p.vehicleId,
        driverId: me.id,
        actorKind: "DRIVER",
        actorName: me.name,
        clientEventId: p.clientEventId,
        legs: {
          create: {
            seq: 1,
            fromPointId: p.fromPointId,
            toPointId: p.toPointId,
            load: p.load,
            loadEstimated: false, // haydovchining o'zi bosdi — taxmin emas
            clientDepartedAt: sana(p.clientAt),
            departLat: koord(p.lat),
            departLng: koord(p.lng),
            clientEventId: `${p.clientEventId}:leg1`,
          },
        },
      },
      select: { id: true, legs: { select: { id: true } } },
    });

    await reysXabarYubor(trip.id); // o'zi xato yutadi — reys baribir yozilgan

    return NextResponse.json({ ok: true, tripId: trip.id, legId: trip.legs[0]?.id ?? null });
  } catch (err) {
    if (p2002(err)) {
      // err.meta.target'ga TAYANMAYMIZ — raw partial indeks uchun uning shakli
      // ishonchsiz. O'rniga holatni QAYTA o'qib deterministik javob beramiz.
      try {
        const replay = await replayTop(p.clientEventId, me.id);
        if (replay) return replay;
        const band = await bandXabar(p.vehicleId, me.id);
        if (band) return xato409(band);
      } catch (err2) {
        return xato500("yolga-chiqdim", err2);
      }
      // Poyga oralig'ida qulf bo'shab qolgan — haydovchi qayta bossa o'tadi.
      return xato409("Reys ochilmadi, qayta urinib ko'ring");
    }
    return xato500("yolga-chiqdim", err);
  }
}
