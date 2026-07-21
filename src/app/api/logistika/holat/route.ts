/**
 * Miniapp bosh ekrani uchun BUTUN holat — bitta so'rovda.
 *
 * Miniapp har aksiyadan keyin shu endpointni qayta o'qiydi, shuning uchun u
 * yagona haqiqat manbai: ochiq plecho bormi, qaysi moshinalar band, qaysi
 * nuqtalar bor. Mijoz o'z holatini o'zi taxmin qilmaydi.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authDriver, ruxsatYoq, xato500, bugunOraliq } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await authDriver(req);
  if (!auth) return ruxsatYoq();
  const me = auth.driver;

  try {
    const { boshi, oxiri } = bugunOraliq();

    const [ochiqLeg, kelinganTrip, vehicles, points, openTrips, oxirgiTrip, reysSoni, plechoSoni] =
      await Promise.all([
        // Ochiq plecho = "hozir yo'lda". STALE ham qamraladi: qulf bo'shatilgan
        // bo'lsa ham haydovchi haqiqiy faktni kiritishi kerak (lateReport bilan).
        prisma.tripLeg.findFirst({
          where: {
            arrivedAt: null,
            trip: { driverId: me.id, status: { in: ["OPEN", "STALE"] } },
          },
          orderBy: { id: "desc" },
          select: {
            id: true,
            seq: true,
            departedAt: true,
            load: true,
            fromPoint: { select: { name: true } },
            toPoint: { select: { id: true, name: true } },
            trip: {
              select: {
                id: true,
                vehicleId: true,
                vehicle: { select: { plateNumber: true, brand: true } },
              },
            },
          },
        }),

        // "Yetib bordim" bosilgan, lekin reys hali yopilmagan holat (hub bo'lmagan
        // nuqtaga kelindi). Ochiq plecho YO'Q, lekin Trip OPEN — moshina hamon
        // qulflangan. Buni serverdan qaytarmasak, ilova qayta ochilganda haydovchi
        // o'z reysini ko'rmay qoladi: yangi reys 409 beradi, eskisini yopolmaydi.
        prisma.trip.findFirst({
          where: {
            driverId: me.id,
            status: { in: ["OPEN", "STALE"] },
            legs: { none: { arrivedAt: null } }, // ochiq plechosi yo'q
          },
          orderBy: { startedAt: "desc" },
          select: {
            id: true,
            vehicleId: true,
            vehicle: { select: { plateNumber: true, brand: true } },
            // BUTUN zanjir (avval take:1 edi): 3-4 plecholi reysda haydovchi
            // "men allaqachon Chilonzorga bordimmi?" savoliga javob topa olmasdi —
            // ayniqsa telefon almashgan yoki ilova qayta ochilgan bo'lsa.
            legs: {
              orderBy: { seq: "asc" },
              select: {
                seq: true,
                arrivedAt: true,
                fromPoint: { select: { name: true } },
                toPoint: { select: { id: true, name: true } },
              },
            },
          },
        }),

        prisma.vehicle.findMany({
          where: { isActive: true },
          orderBy: { plateNumber: "asc" },
          select: { id: true, plateNumber: true, brand: true },
        }),

        prisma.logisticsPoint.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, isHub: true },
        }),

        // Band moshinalar — faqat OPEN (STALE qulfni ushlab turmaydi).
        prisma.trip.findMany({
          where: { status: "OPEN" },
          select: { vehicleId: true, driver: { select: { name: true } } },
        }),

        // Oxirgi ishlatilgan moshina — miniapp uni birinchi qilib taklif qiladi.
        prisma.trip.findFirst({
          where: { driverId: me.id },
          orderBy: { startedAt: "desc" },
          select: { vehicleId: true },
        }),

        prisma.trip.count({
          where: { driverId: me.id, startedAt: { gte: boshi, lt: oxiri } },
        }),
        prisma.tripLeg.count({
          where: { trip: { driverId: me.id }, departedAt: { gte: boshi, lt: oxiri } },
        }),
      ]);

    const bandMap = new Map<number, string>();
    for (const t of openTrips) bandMap.set(t.vehicleId, t.driver.name);

    return NextResponse.json({
      driver: me,
      ochiqReys: ochiqLeg
        ? {
            tripId: ochiqLeg.trip.id,
            legId: ochiqLeg.id,
            seq: ochiqLeg.seq,
            vehicleId: ochiqLeg.trip.vehicleId,
            plateNumber: ochiqLeg.trip.vehicle.plateNumber,
            brand: ochiqLeg.trip.vehicle.brand,
            fromName: ochiqLeg.fromPoint.name,
            toName: ochiqLeg.toPoint.name,
            toPointId: ochiqLeg.toPoint.id,
            load: ochiqLeg.load,
            departedAt: ochiqLeg.departedAt.toISOString(),
          }
        : null,
      // Yetib borilgan, lekin yakunlanmagan reys — ilova qayta ochilganda ham
      // haydovchi "keyingi yo'nalish / yakunlash" ekraniga qaytadi (localStorage'ga
      // tayanmaydi: telefon almashsa yoki WebView tozalansa ham ishlaydi).
      kelindi:
        !ochiqLeg && kelinganTrip
          ? (() => {
              // legs endi seq bo'yicha O'SISH tartibida — joriy nuqta OXIRGISI.
              const oxirgi = kelinganTrip.legs.at(-1);
              return {
                tripId: kelinganTrip.id,
                vehicleId: kelinganTrip.vehicleId,
                plateNumber: kelinganTrip.vehicle.plateNumber,
                brand: kelinganTrip.vehicle.brand,
                pointId: oxirgi?.toPoint.id ?? null,
                pointName: oxirgi?.toPoint.name ?? null,
                arrivedAt: oxirgi?.arrivedAt?.toISOString() ?? null,
                // O'tilgan yo'l — miniapp shundan "Ombor › Chilonzor › Yunusobod"
                // zanjirini chizadi.
                yol: [
                  kelinganTrip.legs[0]?.fromPoint.name ?? "",
                  ...kelinganTrip.legs.map((l) => l.toPoint.name),
                ].filter(Boolean),
              };
            })()
          : null,
      vehicles: vehicles.map((v) => ({
        id: v.id,
        plateNumber: v.plateNumber,
        brand: v.brand,
        band: bandMap.has(v.id),
        bandKim: bandMap.get(v.id) ?? null,
      })),
      points,
      oxirgiVehicleId: oxirgiTrip?.vehicleId ?? null,
      bugun: { reys: reysSoni, plecho: plechoSoni },
    });
  } catch (err) {
    return xato500("holat", err);
  }
}
