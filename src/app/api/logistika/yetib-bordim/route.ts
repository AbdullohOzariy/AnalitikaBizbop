/**
 * Plechoni yopish — "Yetib bordim".
 *
 * ━━ EGALIK WHERE ICHIDA ━━
 * Tekshiruv `if` bilan EMAS, updateMany'ning where'ida. Bitta statement uchta
 * muammoni birdan yopadi:
 *   - IDOR (boshqa haydovchining plechosi)  → trip.driverId
 *   - ikki marta bosish                      → arrivedAt: null
 *   - poyga (nazoratchi bir vaqtda yopsa)    → atomik shart
 * count===0 bo'lsa holatni qayta o'qib SABABGA qarab javob beramiz.
 *
 * ━━ IDEMPOTENTLIK ━━
 * Bu yerda clientEventId qulf bermaydi (yangi qator yaratilmayapti) — uning
 * o'rnini `arrivedAt IS NULL` sharti bosadi: allaqachon yopilgan plecho xato
 * emas, replay:true bilan 200 qaytadi.
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
  sana,
} from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  clientEventId,
  legId: z.number().int().positive(),
  ...gpsSchema,
});

/** Reys yopilganmi (miniapp shunga qarab bosh ekranga qaytadi). */
const YOPIQ = ["DONE", "DONE_LATE", "FORCE_CLOSED", "CANCELLED"];

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
    // O'qish faqat MA'LUMOT uchun (isHub, lateReport). Ruxsat bu yerda HAL
    // QILINMAYDI — u pastdagi updateMany where'ida.
    const leg = await prisma.tripLeg.findUnique({
      where: { id: p.legId },
      select: {
        arrivedAt: true,
        tripId: true,
        toPoint: { select: { isHub: true } },
        trip: { select: { driverId: true, status: true } },
      },
    });
    if (!leg) return xato409("Plecho topilmadi");

    // STALE'dan keyin kelgan fakt — qabul qilinadi, lekin belgilanadi.
    const kech = leg.trip.status === "STALE";
    const hozir = new Date();

    const upd = await prisma.tripLeg.updateMany({
      where: {
        id: p.legId,
        arrivedAt: null,
        trip: { driverId: me.id, status: { in: ["OPEN", "STALE"] } },
      },
      data: {
        arrivedAt: hozir, // SERVER vaqti
        clientArrivedAt: sana(p.clientAt),
        arriveLat: koord(p.lat),
        arriveLng: koord(p.lng),
        lateReport: kech,
        arrivedActorKind: "DRIVER",
      },
    });

    if (upd.count === 0) {
      // Nima uchun o'tmadi? Sababga qarab javob.
      if (leg.trip.driverId !== me.id) return xato409("Bu plecho boshqa haydovchining reysida");
      if (leg.arrivedAt) {
        // Allaqachon yopilgan — bu XATO EMAS, takroriy bosish/replay.
        const t = await prisma.trip.findUnique({
          where: { id: leg.tripId },
          select: { status: true },
        });
        return NextResponse.json({
          ok: true,
          replay: true,
          tripYopildi: !!t && YOPIQ.includes(t.status),
        });
      }
      return xato409("Reys allaqachon yopilgan");
    }

    // HUB AVTO-YOPISH: markazga qaytish = reys tugadi.
    // STALE edi-yu haqiqiy fakt keldi → DONE_LATE (fakt saqlanadi, lekin ajratiladi).
    let tripYopildi = false;
    if (leg.toPoint.isHub) {
      const yopish = await prisma.trip.updateMany({
        where: { id: leg.tripId, driverId: me.id, status: { in: ["OPEN", "STALE"] } },
        data: {
          status: kech ? "DONE_LATE" : "DONE",
          endedAt: hozir,
          endReason: "hub",
        },
      });
      tripYopildi = yopish.count > 0;
    }

    await reysXabarYangila(leg.tripId); // o'zi xato yutadi

    return NextResponse.json({ ok: true, tripYopildi });
  } catch (err) {
    return xato500("yetib-bordim", err);
  }
}
