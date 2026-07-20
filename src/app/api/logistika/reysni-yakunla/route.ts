/**
 * Reysni haydovchining o'zi yopishi ("Reysni yakunla").
 *
 * Hubga qaytmasdan tugatilgan reys shu yerda yopiladi: status FORCE_CLOSED —
 * DONE'dan ATAYLAB farqlanadi, chunki marshrut hubda tugamagan va tahlilda bu
 * ikkisi aralashmasligi kerak.
 *
 * Idempotentlik: holat o'tishi tabiiy bir tomonlama (OPEN/STALE → FORCE_CLOSED),
 * shuning uchun allaqachon yopilgan reys uchun ham 200 qaytadi.
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
} from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  clientEventId,
  tripId: z.number().int().positive(),
});

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
    const trip = await prisma.trip.findUnique({
      where: { id: p.tripId },
      select: { driverId: true, status: true },
    });
    if (!trip || trip.driverId !== me.id) return xato409("Reys topilmadi");
    // Allaqachon yopiq — takroriy bosish, xato emas.
    if (!["OPEN", "STALE"].includes(trip.status)) return NextResponse.json({ ok: true });

    const hozir = new Date();

    // Ochiq plecho ham yopiladi: aks holda TripLeg_open_per_trip_uniq bo'shamay,
    // reys yopiq bo'lsa-da "yo'lda" ko'rinib qolardi.
    const [, yopildi] = await prisma.$transaction([
      prisma.tripLeg.updateMany({
        // Egalik + holat plecho where'iga ham qo'yiladi: yuqoridagi o'qish bilan
        // shu tranzaksiya orasida nazoratchi reysni yopib ulgursa, aks holda
        // yopilgan reysga soxta "yetib bordi" fakti yozilib qolardi.
        where: {
          tripId: p.tripId,
          arrivedAt: null,
          trip: { driverId: me.id, status: { in: ["OPEN", "STALE"] } },
        },
        data: { arrivedAt: hozir, arrivedActorKind: "DRIVER" },
      }),
      prisma.trip.updateMany({
        // Egalik va holat — WHERE ichida (poyga va IDOR birdan yopiladi).
        where: { id: p.tripId, driverId: me.id, status: { in: ["OPEN", "STALE"] } },
        data: { status: "FORCE_CLOSED", endedAt: hozir, endReason: "haydovchi yakunladi" },
      }),
    ]);

    if (yopildi.count === 0) return NextResponse.json({ ok: true }); // boshqa oqim yopib ulgurdi

    await reysXabarYangila(p.tripId); // o'zi xato yutadi

    return NextResponse.json({ ok: true });
  } catch (err) {
    return xato500("reysni-yakunla", err);
  }
}
