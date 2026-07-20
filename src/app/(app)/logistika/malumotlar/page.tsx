/**
 * Logistika → Ma'lumotlar. To'rt tab:
 *   Reyslar       — reys jurnali (o'qish; fors-major amallari /logistika/hozir da)
 *   Nuqtalar      — boriladigan joylar ma'lumotnomasi
 *   Avtomobillar  — avtopark (sig'im, sug'urta, tex ko'rik)
 *   Haydovchilar  — miniapp foydalanuvchilari (Telegram ID orqali taniladi)
 *
 * Reys ochilishi uchun nuqta, avto va haydovchi shu yerda kiritilgan bo'lishi
 * shart — miniappda erkin matn yo'q, hammasi ro'yxatdan tanlanadi.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageReys } from "@/lib/roles";
import { Database, MapPin, Truck, Users, Route } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { NuqtalarTab } from "./nuqtalar-tab";
import { AvtolarTab } from "./avtolar-tab";
import { HaydovchilarTab } from "./haydovchilar-tab";
import { ReyslarTab } from "./reyslar-tab";

export const dynamic = "force-dynamic";

type Tab = "reyslar" | "nuqtalar" | "avtolar" | "haydovchilar";

const TABS: { v: Tab; l: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { v: "reyslar", l: "Reyslar", icon: Route },
  { v: "nuqtalar", l: "Nuqtalar", icon: MapPin },
  { v: "avtolar", l: "Avtomobillar", icon: Truck },
  { v: "haydovchilar", l: "Haydovchilar", icon: Users },
];

export default async function MalumotlarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canManageReys(session.user.roles)) redirect("/logistika/hozir");

  const sp = await searchParams;
  const tab: Tab =
    sp.tab === "nuqtalar" ? "nuqtalar"
    : sp.tab === "avtolar" ? "avtolar"
    : sp.tab === "haydovchilar" ? "haydovchilar"
    : "reyslar";

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Database}
        title="Ma'lumotlar"
        description="Reyslar jurnali va ma'lumotnomalar — nuqta, avtomobil, haydovchi"
      />

      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.v;
          return (
            <Link
              key={t.v}
              href={`/logistika/malumotlar?tab=${t.v}`}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-xl border px-4 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.l}
            </Link>
          );
        })}
      </div>

      {tab === "nuqtalar" ? <NuqtalarPanel />
        : tab === "avtolar" ? <AvtolarPanel />
        : tab === "haydovchilar" ? <HaydovchilarPanel />
        : <ReyslarPanel />}
    </div>
  );
}

async function NuqtalarPanel() {
  const [points, branches] = await Promise.all([
    prisma.logisticsPoint.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, kind: true, branchId: true, isHub: true,
        isActive: true, sortOrder: true, lat: true, lng: true,
        isLongHaul: true, staleHours: true,
        branch: { select: { name: true } },
      },
    }),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <NuqtalarTab
      rows={points.map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        branchId: p.branchId,
        branchName: p.branch?.name ?? null,
        isHub: p.isHub,
        isActive: p.isActive,
        sortOrder: p.sortOrder,
        lat: p.lat == null ? null : Number(p.lat),
        lng: p.lng == null ? null : Number(p.lng),
        isLongHaul: p.isLongHaul,
        staleHours: p.staleHours,
      }))}
      branches={branches}
    />
  );
}

async function AvtolarPanel() {
  const rows = await prisma.vehicle.findMany({
    orderBy: [{ isActive: "desc" }, { plateNumber: "asc" }],
    select: {
      id: true, plateNumber: true, brand: true, model: true,
      capacityM3: true, capacityVagonetka: true,
      insuranceUntil: true, techInspectionUntil: true,
      isActive: true, note: true,
      _count: { select: { trips: true } },
    },
  });

  return (
    <AvtolarTab
      rows={rows.map((v) => ({
        id: v.id,
        plateNumber: v.plateNumber,
        brand: v.brand,
        model: v.model,
        capacityM3: v.capacityM3 == null ? null : Number(v.capacityM3),
        capacityVagonetka: v.capacityVagonetka == null ? null : Number(v.capacityVagonetka),
        insuranceUntil: v.insuranceUntil ? v.insuranceUntil.toISOString().slice(0, 10) : null,
        techInspectionUntil: v.techInspectionUntil ? v.techInspectionUntil.toISOString().slice(0, 10) : null,
        isActive: v.isActive,
        note: v.note,
        tripCount: v._count.trips,
      }))}
    />
  );
}

async function HaydovchilarPanel() {
  const rows = await prisma.driver.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, tgUserId: true, phone: true, isActive: true,
      _count: { select: { trips: true } },
    },
  });

  return (
    <HaydovchilarTab
      rows={rows.map((d) => ({
        id: d.id,
        name: d.name,
        tgUserId: String(d.tgUserId), // BigInt — client'ga string sifatida
        phone: d.phone,
        isActive: d.isActive,
        tripCount: d._count.trips,
      }))}
    />
  );
}

async function ReyslarPanel() {
  const trips = await prisma.trip.findMany({
    orderBy: { startedAt: "desc" },
    take: 200,
    select: {
      id: true, status: true, startedAt: true, endedAt: true,
      actorKind: true, actorName: true, payAmount: true,
      vehicle: { select: { plateNumber: true, brand: true } },
      driver: { select: { name: true } },
      legs: {
        orderBy: { seq: "asc" },
        select: {
          seq: true, load: true, departedAt: true, arrivedAt: true, lateReport: true,
          fromPoint: { select: { name: true } },
          toPoint: { select: { name: true } },
        },
      },
    },
  });

  return (
    <ReyslarTab
      rows={trips.map((t) => ({
        id: t.id,
        status: t.status,
        startedAt: t.startedAt.toISOString(),
        endedAt: t.endedAt ? t.endedAt.toISOString() : null,
        actorKind: t.actorKind,
        actorName: t.actorName,
        payAmount: t.payAmount == null ? null : Number(t.payAmount),
        plateNumber: t.vehicle.plateNumber,
        brand: t.vehicle.brand,
        driverName: t.driver.name,
        legs: t.legs.map((l) => ({
          seq: l.seq,
          from: l.fromPoint.name,
          to: l.toPoint.name,
          load: l.load,
          departedAt: l.departedAt.toISOString(),
          arrivedAt: l.arrivedAt ? l.arrivedAt.toISOString() : null,
          lateReport: l.lateReport,
        })),
      }))}
    />
  );
}
