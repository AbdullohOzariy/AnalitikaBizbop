/**
 * /logistika/hozir — nazoratchining kun bo'yi ochiq turadigan jonli ekrani.
 *
 * Savol bitta: AYNI DAMDA kim yo'lda, qaysi avto qayerda, qancha vaqtdan beri.
 * Shuning uchun bu yerda filtr ham, sana tanlash ham YO'Q — faqat hozirgi holat.
 *
 * Bu bosqichda sahifa FAQAT KO'RSATADI. Fors-major amallari (haydovchi nomidan
 * yo'lga chiqarish / majburan yopish) keyingi bosqichda qo'shiladi.
 *
 * ESLATMA (vaqt): reysning davomiyligi epoch ayirmasidan olinadi — mintaqa
 * ahamiyatsiz. Mintaqa faqat "bugun" chegarasi va ko'rsatishda kerak, u yerda
 * TASHKENT_OFFSET_MS / formatDateTimeUZ ishlatilgan.
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canSeeReys } from "@/lib/roles";
import { TASHKENT_OFFSET_MS, nowTashkent, todayTashkentISO } from "@/lib/date";
import { formatDateTimeUZ } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, ArrowRight, Clock, Gauge, MapPin, PauseCircle, Route, Truck, User,
} from "lucide-react";
import { EmptyState, PageHeader, Pill, StatCard } from "@/components/common/page";

export const dynamic = "force-dynamic";

/** Nazoratchi darhol ko'rishi kerak bo'lgan ostona — reys shuncha vaqt ochiq turgan bo'lsa. */
const OGOHLANTIRISH_SOAT = 5;
const OGOHLANTIRISH_MS = OGOHLANTIRISH_SOAT * 3_600_000;

const LOAD_LABEL = {
  EMPTY: "Bo'sh",
  QUARTER: "Chorak",
  HALF: "Yarim",
  FULL: "To'la",
} as const;

// Bo'sh yurish eng qimmat ko'rsatkich — shuning uchun u qizil, to'la yuk yashil.
const LOAD_TONE = {
  EMPTY: "red",
  QUARTER: "amber",
  HALF: "blue",
  FULL: "green",
} as const;

/** Davomiylik -> "2s 15d" (sutkadan oshsa "1k 3s"). Manfiy/nol -> "0d". */
function davomiylik(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0d";
  const daqiqa = Math.floor(ms / 60_000);
  const soat = Math.floor(daqiqa / 60);
  const kun = Math.floor(soat / 24);
  if (kun >= 1) return `${kun}k ${soat % 24}s`;
  if (soat >= 1) return `${soat}s ${daqiqa % 60}d`;
  return `${daqiqa}d`;
}

export default async function HozirPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canSeeReys(session.user.roles)) redirect("/dashboard-v2");

  // "Bugun" — Toshkent kalendar kuni, UTC oralig'iga o'giriladi (startedAt UTC saqlanadi).
  const kunBoshi = new Date(
    new Date(`${todayTashkentISO()}T00:00:00.000Z`).getTime() - TASHKENT_OFFSET_MS
  );
  const kunOxiri = new Date(kunBoshi.getTime() + 86_400_000);
  const bugun = { gte: kunBoshi, lt: kunOxiri };

  const [ochiqReyslar, faolAvto, bugungiReys, javobsiz] = await Promise.all([
    prisma.trip.findMany({
      where: { status: "OPEN" },
      orderBy: { startedAt: "asc" }, // eng uzoq yo'ldagisi tepada
      select: {
        id: true,
        startedAt: true,
        actorKind: true,
        actorName: true,
        vehicleId: true,
        vehicle: { select: { plateNumber: true, brand: true, model: true, isActive: true } },
        driver: { select: { name: true, phone: true } },
        legs: {
          orderBy: { seq: "desc" },
          take: 1, // reys ichida bir vaqtda bitta ochiq plecho bo'ladi (partial unique index)
          select: {
            seq: true,
            load: true,
            loadEstimated: true,
            departedAt: true,
            arrivedAt: true,
            fromPoint: { select: { name: true } },
            toPoint: { select: { name: true } },
          },
        },
      },
    }),
    prisma.vehicle.count({ where: { isActive: true } }),
    prisma.trip.count({ where: { startedAt: bugun } }),
    prisma.trip.count({ where: { status: "STALE", startedAt: bugun } }),
  ]);

  // Haqiqiy epoch ms. `Date.now()` ni render ichida chaqirib bo'lmaydi
  // (react-hooks/purity = error), shuning uchun markazlashgan nowTashkent orqali.
  const hozir = nowTashkent().getTime() - TASHKENT_OFFSET_MS;
  const yoldaSoni = ochiqReyslar.length;
  // Ochiq reys avtoni qulflaydi -> bo'sh avto = faol avtopark minus qulflangan FAOL
  // avtolar. Nofaol avtoda ochiq reys qolgan bo'lsa (avto reys ochilgandan keyin
  // nofaol qilingan) uni ayirmaymiz — aks holda bo'sh avto kam ko'rsatiladi.
  const yoldagiFaolAvtolar = new Set(
    ochiqReyslar.filter((t) => t.vehicle.isActive).map((t) => t.vehicleId)
  );
  const boshAvto = Math.max(0, faolAvto - yoldagiFaolAvtolar.size);
  const kechikkan = ochiqReyslar.filter(
    (t) => hozir - t.startedAt.getTime() > OGOHLANTIRISH_MS
  ).length;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Gauge}
        title="Hozir"
        description="Ayni damda yo'lda bo'lgan reyslar"
      >
        <span className="text-xs text-muted-foreground">
          Holat: {formatDateTimeUZ(new Date(hozir))}
        </span>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Yo'lda"
          value={yoldaSoni}
          icon={Truck}
          tone={yoldaSoni > 0 ? "green" : "default"}
          hint={
            kechikkan > 0
              ? `${kechikkan} ta reys ${OGOHLANTIRISH_SOAT} soatdan oshdi`
              : "Ochiq reyslar"
          }
        />
        <StatCard
          label="Bo'sh avto"
          value={boshAvto}
          icon={PauseCircle}
          tone="blue"
          hint={`Faol avtopark: ${faolAvto} ta`}
        />
        <StatCard
          label="Bugungi reyslar"
          value={bugungiReys}
          icon={Route}
          tone="violet"
          hint="Bugun boshlangan (Toshkent)"
        />
        <StatCard
          label="Javobsiz"
          value={javobsiz}
          icon={AlertTriangle}
          tone={javobsiz > 0 ? "red" : "default"}
          hint="Ostona o'tdi, qulf bo'shatildi"
        />
      </div>

      {ochiqReyslar.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Hozir hech kim yo'lda emas"
          description="Barcha avtomobillar bo'sh. Haydovchi miniappda yo'lga chiqqanda reys shu yerda paydo bo'ladi."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {ochiqReyslar.map((t) => {
            const leg = t.legs[0] ?? null;
            const reysMs = hozir - t.startedAt.getTime();
            const ogohlantirish = reysMs > OGOHLANTIRISH_MS;
            // Oxirgi plecho yopilgan bo'lsa — haydovchi nuqtada turibdi (tushirish/kutish).
            const yolda = leg != null && leg.arrivedAt == null;
            const bosqichBoshi = leg == null
              ? t.startedAt
              : (leg.arrivedAt ?? leg.departedAt);

            return (
              <div
                key={t.id}
                className={cn(
                  "shadow-card rounded-2xl border bg-card p-4",
                  ogohlantirish ? "border-destructive ring-1 ring-destructive/30" : "border-border"
                )}
              >
                {/* Haydovchi + avto */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{t.driver.name}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Truck className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-medium tabular-nums text-foreground">
                        {t.vehicle.plateNumber}
                      </span>
                      <span className="truncate">
                        {t.vehicle.brand}
                        {t.vehicle.model ? ` ${t.vehicle.model}` : ""}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={cn(
                        "text-lg font-bold leading-none tabular-nums",
                        ogohlantirish && "text-destructive"
                      )}
                    >
                      {davomiylik(reysMs)}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {formatDateTimeUZ(t.startedAt)} dan
                    </div>
                  </div>
                </div>

                {/* Joriy plecho */}
                <div className="mt-3 rounded-xl border border-border/60 bg-muted/40 px-3 py-2.5">
                  {leg == null ? (
                    <p className="text-xs text-muted-foreground">
                      Plecho ochilmagan — reys boshlandi, yo&apos;nalish hali belgilanmagan.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span>{leg.fromPoint.name}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span>{leg.toPoint.name}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Pill tone={yolda ? "blue" : "muted"}>
                          {yolda ? "Yo'lda" : "Nuqtada"}
                        </Pill>
                        <Pill tone={LOAD_TONE[leg.load]}>
                          Yuk: {LOAD_LABEL[leg.load]}
                          {leg.loadEstimated ? " (taxmin)" : ""}
                        </Pill>
                        <Pill tone="muted">
                          <Clock className="h-3 w-3" />
                          {yolda ? "Chiqqan" : "Yetgan"}: {formatDateTimeUZ(bosqichBoshi)} ·{" "}
                          {davomiylik(hozir - bosqichBoshi.getTime())}
                        </Pill>
                        <Pill tone="muted">Plecho #{leg.seq}</Pill>
                      </div>
                    </>
                  )}
                </div>

                {/* Fors-major: reysni haydovchi emas, nazoratchi ochgan bo'lsa — ko'rinib tursin */}
                {t.actorKind !== "DRIVER" && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Nazoratchi kiritgan: {t.actorName}
                  </p>
                )}

                {ogohlantirish && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {OGOHLANTIRISH_SOAT} soatdan oshdi — haydovchi bilan bog&apos;laning
                    {t.driver.phone ? ` (${t.driver.phone})` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
