/**
 * Logistika → Statistika. Reyslar bo'yicha hisobot.
 *
 * ATAYLAB SODDA: tizim endi ishga tushmoqda, ma'lumot juda kam. Grafik kutubxona
 * qo'shilmagan — jadval + progress bar yetarli va halol. Ma'lumot bo'lmasa nol
 * to'ldirilgan soxta diagramma emas, ochiq "reys yo'q" holati ko'rsatiladi.
 *
 * Asosiy ko'rsatkich — BO'SH YURISH ULUSHI (load=EMPTY plecholar / jami plecholar):
 * reysbay haq to'lanadigan tizimda eng qimmat yo'qotish shu. Qolgan ikkitasi
 * (nazoratchi kiritgan reyslar, STALE+DONE_LATE) — ADOPTSIYA signali: haydovchi
 * o'zi yozayaptimi yoki nazoratchi uning o'rniga terayaptimi.
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { canSeeReys } from "@/lib/roles";
import { isoDay, nowTashkent, parseDateParam, TASHKENT_OFFSET_MS } from "@/lib/date";
import { formatPercent, formatDateRangeUZ } from "@/lib/format";
import { EmptyState, PageHeader, Pill, SectionCard, StatCard } from "@/components/common/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ChartPie, Route, Split, Timer, Truck, UserCog, Users } from "lucide-react";
import { LogistikaFilter } from "../filter";

export const dynamic = "force-dynamic";

// ── Yordamchilar ──────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Yo'lda",
  DONE: "Yakunlangan",
  DONE_LATE: "Kech fakt (DONE_LATE)",
  FORCE_CLOSED: "Majburan yopilgan",
  STALE: "Qulf bo'shatilgan (STALE)",
  CANCELLED: "Bekor qilingan",
};

const STATUS_TONE: Record<string, "green" | "orange" | "blue" | "amber" | "red" | "muted"> = {
  OPEN: "blue",
  DONE: "green",
  DONE_LATE: "amber",
  FORCE_CLOSED: "orange",
  STALE: "red",
  CANCELLED: "muted",
};

/** Foiz — bo'luvchi 0 bo'lsa 0 (NaN emas). */
function share(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

/** Daqiqa → "2 soat 15 daq" / "45 daq". Null bo'lsa "—". */
function formatDuration(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const m = Math.round(minutes);
  if (m < 60) return `${m} daq`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} soat` : `${h} soat ${rest} daq`;
}

/** Sodda progress bar — grafik kutubxonasiz. */
function Bar({ value, tone = "green" }: { value: number; tone?: "green" | "red" | "amber" | "blue" }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          tone === "red" ? "bg-destructive"
            : tone === "amber" ? "bg-amber-500"
            : tone === "blue" ? "bg-blue-500"
            : "bg-primary"
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// ── Raw SQL qator tiplari ─────────────────────────────────────────

type LegAggRow = {
  legs: number;
  emptyLegs: number;
  closedLegs: number;
  avgMinutes: number | null;
};

type DriverRow = {
  id: number;
  name: string;
  trips: number;
  legs: number;
  emptyLegs: number;
};

type VehicleRow = {
  id: number;
  plateNumber: string;
  brand: string;
  trips: number;
  legs: number;
  emptyLegs: number;
};

export default async function StatistikaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canSeeReys(session.user.roles)) redirect("/dashboard-v2");

  const sp = await searchParams;

  // Davr — default so'nggi 30 kun (Toshkent kalendar kuni bo'yicha).
  const today = new Date(isoDay(nowTashkent()) + "T00:00:00.000Z");
  const defEnd = today;
  const defStart = new Date(today.getTime() - 29 * 86_400_000);
  const startDay = parseDateParam(sp.start, defStart)!;
  const endDayRaw = parseDateParam(sp.end, defEnd)!;
  // Teskari oraliq kiritilsa jimgina almashtiramiz (bo'sh hisobot o'rniga).
  const [dayFrom, dayTo] = endDayRaw < startDay ? [endDayRaw, startDay] : [startDay, endDayRaw];

  // Toshkent kuni → UTC timestamp oralig'i (startedAt UTC saqlanadi).
  const from = new Date(dayFrom.getTime() - TASHKENT_OFFSET_MS);
  const to = new Date(dayTo.getTime() + 86_400_000 - TASHKENT_OFFSET_MS);
  const tripWhere: Prisma.TripWhereInput = { startedAt: { gte: from, lt: to } };

  const [statusRows, actorRows, legAgg, driverRows, vehicleRows] = await Promise.all([
    prisma.trip.groupBy({ by: ["status"], where: tripWhere, _count: { _all: true } }),
    prisma.trip.groupBy({ by: ["actorKind"], where: tripWhere, _count: { _all: true } }),
    prisma.$queryRaw<LegAggRow[]>(Prisma.sql`
      SELECT COUNT(l.id)::int AS "legs",
             (COUNT(l.id) FILTER (WHERE l."load"::text = 'EMPTY'))::int AS "emptyLegs",
             (COUNT(l.id) FILTER (WHERE l."arrivedAt" IS NOT NULL))::int AS "closedLegs",
             (AVG(EXTRACT(EPOCH FROM (l."arrivedAt" - l."departedAt")) / 60.0)
               FILTER (WHERE l."arrivedAt" IS NOT NULL))::float8 AS "avgMinutes"
      FROM "TripLeg" l
      JOIN "Trip" t ON t.id = l."tripId"
      WHERE t."startedAt" >= ${from} AND t."startedAt" < ${to}`),
    prisma.$queryRaw<DriverRow[]>(Prisma.sql`
      SELECT d.id, d.name,
             COUNT(DISTINCT t.id)::int AS "trips",
             COUNT(l.id)::int AS "legs",
             (COUNT(l.id) FILTER (WHERE l."load"::text = 'EMPTY'))::int AS "emptyLegs"
      FROM "Trip" t
      JOIN "Driver" d ON d.id = t."driverId"
      LEFT JOIN "TripLeg" l ON l."tripId" = t.id
      WHERE t."startedAt" >= ${from} AND t."startedAt" < ${to}
      GROUP BY d.id, d.name
      ORDER BY "trips" DESC, d.name ASC`),
    prisma.$queryRaw<VehicleRow[]>(Prisma.sql`
      SELECT v.id, v."plateNumber", v.brand,
             COUNT(DISTINCT t.id)::int AS "trips",
             COUNT(l.id)::int AS "legs",
             (COUNT(l.id) FILTER (WHERE l."load"::text = 'EMPTY'))::int AS "emptyLegs"
      FROM "Trip" t
      JOIN "Vehicle" v ON v.id = t."vehicleId"
      LEFT JOIN "TripLeg" l ON l."tripId" = t.id
      WHERE t."startedAt" >= ${from} AND t."startedAt" < ${to}
      GROUP BY v.id, v."plateNumber", v.brand
      ORDER BY "trips" DESC, v."plateNumber" ASC`),
  ]);

  const totalTrips = statusRows.reduce((s, r) => s + r._count._all, 0);
  const statusCount = (s: string) => statusRows.find((r) => r.status === s)?._count._all ?? 0;

  const agg = legAgg[0] ?? { legs: 0, emptyLegs: 0, closedLegs: 0, avgMinutes: null };
  const totalLegs = agg.legs;
  const emptyLegs = agg.emptyLegs;
  const openLegs = totalLegs - agg.closedLegs;
  const emptyShare = share(emptyLegs, totalLegs);

  const controllerTrips = actorRows.find((r) => r.actorKind === "CONTROLLER")?._count._all ?? 0;
  const controllerShare = share(controllerTrips, totalTrips);

  const staleTrips = statusCount("STALE") + statusCount("DONE_LATE");
  const staleShare = share(staleTrips, totalTrips);

  const header = (
    <PageHeader
      icon={ChartPie}
      title="Statistika"
      description={`Reyslar hisoboti — ${formatDateRangeUZ(dayFrom, dayTo)}`}
    />
  );

  if (totalTrips === 0) {
    return (
      <div className="space-y-5">
        {header}
        <LogistikaFilter
          basePath="/logistika/statistika"
          defaultStart={isoDay(dayFrom)}
          defaultEnd={isoDay(dayTo)}
        />
        <EmptyState
          icon={Route}
          title="Bu davrda reys yo'q"
          description="Tanlangan davrda birorta ham reys yozuvi topilmadi. Davrni kengaytiring yoki haydovchilar miniappda reys ocha boshlagach qayting."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}

      <LogistikaFilter
        basePath="/logistika/statistika"
        defaultStart={isoDay(dayFrom)}
        defaultEnd={isoDay(dayTo)}
      />

      {/* ── Bo'sh yurish — eng muhim ko'rsatkich, ataylab kattaroq ── */}
      <div className="shadow-card rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Split className="h-[1.05rem] w-[1.05rem]" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Bo&apos;sh yurish ulushi
              </span>
            </div>
            <div className="mt-3 text-[3rem] font-bold leading-none tabular-nums tracking-[-0.03em]">
              {formatPercent(emptyShare)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {totalLegs} plechodan {emptyLegs} tasi bo&apos;sh (load = EMPTY) ketgan
            </p>
          </div>
          <div className="min-w-[16rem] flex-1">
            <Bar value={emptyShare} tone="red" />
            <p className="mt-2 text-xs text-muted-foreground">
              Reysbay haq to&apos;lanadigan tizimda eng qimmat yo&apos;qotish shu — bo&apos;sh plecho
              uchun ham yoqilg&apos;i va haq sarflanadi.
            </p>
          </div>
        </div>
      </div>

      {/* ── Asosiy raqamlar ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Jami reys" value={totalTrips} icon={Route} tone="green" />
        <StatCard
          label="Jami plecho"
          value={totalLegs}
          icon={Split}
          tone="blue"
          hint={openLegs > 0 ? `${openLegs} ta plecho hali yopilmagan` : "Barcha plecholar yopilgan"}
        />
        <StatCard
          label="O'rtacha plecho davomiyligi"
          value={formatDuration(agg.avgMinutes)}
          icon={Timer}
          tone="violet"
          hint={
            agg.closedLegs > 0
              ? `${agg.closedLegs} ta yopilgan plecho bo'yicha`
              : "Yopilgan plecho yo'q — hisoblab bo'lmaydi"
          }
        />
      </div>

      {/* ── Adoptsiya signallari ── */}
      <SectionCard
        title="Adoptsiya signallari"
        description="Haydovchi tizimga o'zi yozayaptimi yoki nazoratchi uning o'rniga terayaptimi"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <UserCog className="h-3.5 w-3.5" />
                Nazoratchi kiritgan reyslar
              </span>
              <span className="text-sm font-semibold tabular-nums">{formatPercent(controllerShare)}</span>
            </div>
            <div className="mt-2">
              <Bar value={controllerShare} tone="amber" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {totalTrips} reysdan {controllerTrips} tasi nazoratchi tomonidan (fors-major) ochilgan.
              Ulush yuqori bo&apos;lsa — miniapp haydovchilarda ishlamayapti.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Timer className="h-3.5 w-3.5" />
                STALE + kech fakt ulushi
              </span>
              <span className="text-sm font-semibold tabular-nums">{formatPercent(staleShare)}</span>
            </div>
            <div className="mt-2">
              <Bar value={staleShare} tone="red" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {totalTrips} reysdan {staleTrips} tasida qulf ostona bo&apos;yicha bo&apos;shatilgan yoki
              fakt kech kelgan. Ulush yuqori bo&apos;lsa — &quot;yetib bordim&quot; tugmasi bosilmayapti.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-border/60 pt-4">
          {statusRows
            .slice()
            .sort((a, b) => b._count._all - a._count._all)
            .map((r) => (
              <Pill key={r.status} tone={STATUS_TONE[r.status] ?? "muted"}>
                {STATUS_LABEL[r.status] ?? r.status}
                <span className="tabular-nums font-semibold">{r._count._all}</span>
              </Pill>
            ))}
        </div>
      </SectionCard>

      {/* ── Haydovchi kesimi ── */}
      <SectionCard
        title="Haydovchi kesimi"
        description="Kim nechta reys qilgan va bo'sh yurish ulushi qanday"
        bodyClassName="p-0"
      >
        {driverRows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Users} title="Haydovchi ma'lumoti yo'q" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Haydovchi</TableHead>
                  <TableHead className="text-right">Reys</TableHead>
                  <TableHead className="text-right">Plecho</TableHead>
                  <TableHead className="text-right">Bo&apos;sh</TableHead>
                  <TableHead className="w-40">Bo&apos;sh yurish</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {driverRows.map((d) => {
                  const s = share(d.emptyLegs, d.legs);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.trips}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.legs}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.emptyLegs}</TableCell>
                      <TableCell>
                        {d.legs === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Bar value={s} tone="red" />
                            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                              {formatPercent(s, 0)}
                            </span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {/* ── Avto kesimi ── */}
      <SectionCard
        title="Avtomobil kesimi"
        description="Qaysi avto nechta reysga chiqqan"
        bodyClassName="p-0"
      >
        {vehicleRows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Truck} title="Avtomobil ma'lumoti yo'q" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Avtomobil</TableHead>
                  <TableHead className="text-right">Reys</TableHead>
                  <TableHead className="text-right">Plecho</TableHead>
                  <TableHead className="text-right">Bo&apos;sh</TableHead>
                  <TableHead className="w-40">Bo&apos;sh yurish</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicleRows.map((v) => {
                  const s = share(v.emptyLegs, v.legs);
                  return (
                    <TableRow key={v.id}>
                      <TableCell>
                        <span className="font-medium">{v.plateNumber}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{v.brand}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{v.trips}</TableCell>
                      <TableCell className="text-right tabular-nums">{v.legs}</TableCell>
                      <TableCell className="text-right tabular-nums">{v.emptyLegs}</TableCell>
                      <TableCell>
                        {v.legs === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Bar value={s} tone="red" />
                            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                              {formatPercent(s, 0)}
                            </span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
