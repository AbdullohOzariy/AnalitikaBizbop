/**
 * Ochiq reysga keyingi plechoni qo'shish (filialdan filialga, hubga qaytmasdan).
 *
 * ━━ from'ni SERVER aniqlaydi ━━
 * Boshlanish nuqtasi = oldingi plechoning toPointId. Mijozdan OLINMAYDI: aks
 * holda marshrut zanjirida uzilish paydo bo'lardi (A→B keyin C→D), va masofa/
 * reysbay hisobi yolg'on chiqardi. Mijoz faqat "qayerga" ni aytadi.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { reysXabarYangila } from "@/lib/logistika/notify";
import {
  authDriver,
  ruxsatYoq,
  xato400,
  xato409,
  xato500,
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
  tripId: z.number().int().positive(),
  toPointId: z.number().int().positive(),
  load: z.enum(["EMPTY", "QUARTER", "HALF", "FULL"]),
  ...gpsSchema,
});

/** Shu clientEventId bilan plecho allaqachon yozilganmi? (replay) */
async function replayTop(ceid: string, driverId: number) {
  const l = await prisma.tripLeg.findUnique({
    where: { clientEventId: ceid },
    select: { id: true, trip: { select: { driverId: true } } },
  });
  // Boshqa haydovchining ceid'i — replay emas (amalda bo'lmaydi, UUID).
  if (!l || l.trip.driverId !== driverId) return null;
  return NextResponse.json({ ok: true, replay: true, legId: l.id });
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

  try {
    const replay = await replayTop(p.clientEventId, me.id);
    if (replay) return replay;

    const trip = await prisma.trip.findUnique({
      where: { id: p.tripId },
      select: {
        driverId: true,
        status: true,
        legs: {
          orderBy: { seq: "desc" },
          take: 1,
          select: { seq: true, toPointId: true, arrivedAt: true },
        },
      },
    });
    if (!trip || trip.driverId !== me.id) return xato409("Reys topilmadi");
    if (!["OPEN", "STALE"].includes(trip.status)) return xato409("Reys allaqachon yopilgan");

    const oxirgi = trip.legs[0];
    if (!oxirgi) return xato409("Reysda plecho yo'q");
    // Ochiq plecho ustiga yangisini qo'shib bo'lmaydi (DB indeksi ham rad etadi).
    if (!oxirgi.arrivedAt) return xato409("Avval yetib borishni belgilang");

    const fromPointId = oxirgi.toPointId; // SERVER aniqlaydi
    if (fromPointId === p.toPointId) return xato409("Siz allaqachon shu nuqtadasiz");

    const nuqta = await prisma.logisticsPoint.findFirst({
      where: { id: p.toPointId, isActive: true },
      select: { id: true },
    });
    if (!nuqta) return xato409("Nuqta topilmadi yoki faol emas");

    const leg = await prisma.tripLeg.create({
      data: {
        tripId: p.tripId,
        seq: oxirgi.seq + 1,
        fromPointId,
        toPointId: p.toPointId,
        load: p.load,
        loadEstimated: false,
        clientDepartedAt: sana(p.clientAt),
        departLat: koord(p.lat),
        departLng: koord(p.lng),
        clientEventId: p.clientEventId,
      },
      select: { id: true },
    });

    await reysXabarYangila(p.tripId); // o'zi xato yutadi

    return NextResponse.json({ ok: true, legId: leg.id });
  } catch (err) {
    if (p2002(err)) {
      // Uchta manba: clientEventId, @@unique([tripId,seq]), ochiq-plecho indeksi.
      // Qaysi biri ekanini meta'dan emas, holatni qayta o'qib aniqlaymiz.
      try {
        const replay = await replayTop(p.clientEventId, me.id);
        if (replay) return replay;
        const ochiq = await prisma.tripLeg.count({
          where: { tripId: p.tripId, arrivedAt: null },
        });
        if (ochiq > 0) return xato409("Avval yetib borishni belgilang");
      } catch (err2) {
        return xato500("keyingi-plecho", err2);
      }
      return xato409("Plecho qo'shilmadi, qayta urinib ko'ring");
    }
    return xato500("keyingi-plecho", err);
  }
}
