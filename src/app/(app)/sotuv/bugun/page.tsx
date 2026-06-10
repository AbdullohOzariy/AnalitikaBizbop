/**
 * "Bugun" — kunlik ish navbati. Asosan kategoriya menejerlari uchun:
 * bugun zakaz beriladigan yetkazib beruvchilar (profildagi zakaz kunlari bo'yicha),
 * har biri uchun tayyor "Zakaz yaratish" yo'li, bajarilganlik holati,
 * hamda diqqat talab signallar (kechikish xavfi, OOS).
 * Qamrov: CAT_MANAGER faqat o'z kategoriyalaridagi yetkazib beruvchi/signal'larni ko'radi.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultRange } from "@/lib/analytics";
import { scopeParentIds, scopeSubIds, scopeProductWhere } from "@/lib/scope";
import { oosKpi, stockdayKpi, type SnapshotFilters } from "@/lib/snapshot-reports";
import {
  CalendarCheck, CheckCircle2, Clock, PackageX, TimerOff, Truck, Plus, ArrowRight, Layers,
} from "lucide-react";
import { PageHeader, StatCard, Pill } from "@/components/common/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WD_UZ = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

export default async function BugunPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (
    !session?.user ||
    (role !== "SYSTEM_ADMIN" && role !== "ADMIN" && role !== "CAT_MANAGER" && role !== "SUPPLYCHAIN")
  ) {
    redirect("/dashboard-v2");
  }
  const userId = Number(session.user.id);
  const canCreateOrder = role === "SYSTEM_ADMIN" || role === "CAT_MANAGER";

  // Toshkent (UTC+5) bo'yicha "bugun" — zakaz kunlari kalendari ham shu asosda.
  // Server komponent: har so'rovda bir marta hisoblanadi (purity qoidasi client uchun).
  // eslint-disable-next-line react-hooks/purity
  const nowTk = new Date(Date.now() + 5 * 3_600_000);
  const todayStr = nowTk.toISOString().slice(0, 10);
  const dow = nowTk.getUTCDay();
  const tomorrowDow = (dow + 1) % 7;
  // Bugungi kun boshlanishi (real UTC instant): Toshkent yarim tuni = UTC 19:00 (kecha)
  const todayStartUtc = new Date(new Date(todayStr + "T00:00:00.000Z").getTime() - 5 * 3_600_000);

  const [scopeParents, scope] = await Promise.all([
    scopeParentIds(userId, role!),
    scopeSubIds(userId, role!),
  ]);

  // Qamrovda kategoriya biriktirilmagan menejer
  if (scope && scope.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader icon={CalendarCheck} title="Bugun" description="Kunlik ish navbati" />
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Sizga hali kategoriya biriktirilmagan — administrator tayinlagach, bu yerda kunlik
          ishlaringiz (zakaz beriladigan yetkazib beruvchilar, signallar) ko&apos;rinadi.
        </div>
      </div>
    );
  }

  // ── Yetkazib beruvchilar: bugun va ertaga zakaz qabul qiladiganlar (qamrov ichida) ──
  const supplierWhere = (d: number) => ({
    orderWeekdays: { has: d },
    products: { some: { archivedAt: null, ...scopeProductWhere(scopeParents) } },
  });

  const def = await getDefaultRange();
  const filters: SnapshotFilters = {
    startStr: def.start.toISOString().slice(0, 10),
    endStr: def.end.toISOString().slice(0, 10),
    q: "",
    scopeSubIds: scope,
  };

  const [todaySuppliers, tomorrowSuppliers, sdKpi, oKpi] = await Promise.all([
    prisma.supplier.findMany({
      where: supplierWhere(dow),
      select: { id: true, name: true, rating: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({
      where: supplierWhere(tomorrowDow),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    stockdayKpi(filters, todayStr),
    oosKpi(filters),
  ]);

  // Bugun allaqachon berilgan zakazlar (menejer — faqat o'ziniki)
  const todayOrders = todaySuppliers.length
    ? await prisma.purchaseOrder.findMany({
        where: {
          supplierId: { in: todaySuppliers.map((s) => s.id) },
          createdAt: { gte: todayStartUtc },
          ...(role === "CAT_MANAGER" ? { createdById: userId } : {}),
        },
        select: { id: true, supplierId: true, status: true },
        orderBy: { id: "desc" },
      })
    : [];
  const orderBySupplier = new Map<number, { id: number; status: string }>();
  for (const o of todayOrders) {
    if (!orderBySupplier.has(o.supplierId)) orderBySupplier.set(o.supplierId, { id: o.id, status: o.status });
  }

  // Qamrovdagi SKU soni har yetkazib beruvchi uchun (kartada ko'rsatish)
  const skuCounts = todaySuppliers.length
    ? await prisma.product.groupBy({
        by: ["supplierId"],
        where: {
          supplierId: { in: todaySuppliers.map((s) => s.id) },
          archivedAt: null,
          ...scopeProductWhere(scopeParents),
        },
        _count: { _all: true },
      })
    : [];
  const skuCountMap = new Map(skuCounts.map((g) => [g.supplierId, g._count._all]));

  const done = todaySuppliers.filter((s) => orderBySupplier.has(s.id)).length;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={CalendarCheck}
        title="Bugun"
        description={`${WD_UZ[dow]}, ${todayStr} — kunlik ish navbati${role === "CAT_MANAGER" ? " (sizning kategoriyalaringiz)" : ""}`}
      />

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Bugungi zakaz kunlari" value={todaySuppliers.length.toLocaleString("uz-UZ")} icon={Truck}
          hint="zakaz qabul qiladigan yetkazib beruvchilar" />
        <StatCard label="Zakaz berildi" value={`${done}/${todaySuppliers.length}`} icon={CheckCircle2}
          tone={todaySuppliers.length > 0 && done === todaySuppliers.length ? "green" : "default"}
          hint={done < todaySuppliers.length ? "qolganlari kutilmoqda" : "hammasi bajarildi"} />
        <StatCard label="Kechikish xavfi" value={sdKpi.xavf.toLocaleString("uz-UZ")} icon={TimerOff}
          tone={sdKpi.xavf > 0 ? "red" : "default"}
          hint="keyingi zakazda ham yetib kelguncha tugaydi" />
        <StatCard label="Tugagan (OOS)" value={oKpi.oos.toLocaleString("uz-UZ")} icon={PackageX}
          tone={oKpi.oos > 0 ? "orange" : "default"} hint="hozir javonda yo'q" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(280px,360px)]">
        {/* ── Bugungi zakazlar ro'yxati ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bugun zakaz beriladigan yetkazib beruvchilar</CardTitle>
            <p className="text-xs text-muted-foreground">
              Zakaz kunlari yetkazib beruvchi profilida belgilanadi. Tugma — yetkazib beruvchi tanlangan holda tayyor zakaz oynasini ochadi.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {todaySuppliers.length === 0 ? (
              <p className="py-6 text-center text-sm italic text-muted-foreground">
                Bugun zakaz kuni belgilangan yetkazib beruvchi yo&apos;q.
                Zakaz kunlarini <Link href="/baza/taminotchilar" className="underline underline-offset-2">yetkazib beruvchi profillarida</Link> belgilang.
              </p>
            ) : (
              todaySuppliers.map((s) => {
                const order = orderBySupplier.get(s.id);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5",
                      order ? "border-emerald-500/40 bg-emerald-500/10" : "border-border"
                    )}
                  >
                    {order
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      : <Clock className="h-4 w-4 shrink-0 text-amber-500" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {s.name}
                        {s.rating != null && <span className="ml-1.5 text-xs text-amber-500">{"★".repeat(s.rating)}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(skuCountMap.get(s.id) ?? 0).toLocaleString("uz-UZ")} SKU
                        {order && <> · zakaz <Link href={`/sotuv/sotib-olish/${order.id}`} className="underline underline-offset-2">#{order.id}</Link> berildi</>}
                      </p>
                    </div>
                    {order ? (
                      <Pill tone="green" className="text-[10px]">bajarildi</Pill>
                    ) : canCreateOrder ? (
                      <Link
                        href={`/sotuv/sotib-olish/yangi?supplier=${s.id}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                      >
                        <Plus className="h-3.5 w-3.5" /> Zakaz yaratish
                      </Link>
                    ) : (
                      <Pill tone="amber" className="text-[10px]">kutilmoqda</Pill>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* ── O'ng ustun: signallar + ertaga ── */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Diqqat talab signallar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <SignalLink
                href="/stockday"
                icon={TimerOff}
                label="Kechikish xavfi"
                count={sdKpi.xavf}
                tone="red"
                desc="zudlik bilan buyurtma kerak"
              />
              <SignalLink
                href="/stockday?view=kritik"
                icon={Clock}
                label="Kritik zaxira (≤3 kun)"
                count={sdKpi.kritik}
                tone="red"
                desc="tez orada tugaydi"
              />
              <SignalLink
                href="/oos"
                icon={PackageX}
                label="Tugagan (OOS)"
                count={oKpi.oos}
                tone="orange"
                desc="javonda yo'q — savdo yo'qotilmoqda"
              />
              <SignalLink
                href="/oos?view=dead"
                icon={Layers}
                label="O'lik qoldiq"
                count={oKpi.dead}
                tone="muted"
                desc="davr davomida sotuv 0"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ertaga — {WD_UZ[tomorrowDow]}</CardTitle>
              <p className="text-xs text-muted-foreground">Tayyorgarlik uchun: ertangi zakaz kunlari</p>
            </CardHeader>
            <CardContent>
              {tomorrowSuppliers.length === 0 ? (
                <p className="py-2 text-center text-xs italic text-muted-foreground">Ertaga zakaz kuni yo&apos;q.</p>
              ) : (
                <ul className="space-y-1.5">
                  {tomorrowSuppliers.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <Link href={`/baza/taminotchilar/${s.id}`} className="truncate hover:underline">{s.name}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SignalLink({
  href, icon: Icon, label, count, tone, desc,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  tone: "red" | "orange" | "muted";
  desc: string;
}) {
  const toneCls =
    count === 0 ? "text-muted-foreground" :
    tone === "red" ? "text-destructive" :
    tone === "orange" ? "text-amber-600 dark:text-amber-400" : "text-foreground";
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-muted/40"
    >
      <Icon className={cn("h-4 w-4 shrink-0", toneCls)} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{desc}</span>
      </span>
      <span className={cn("text-base font-bold tabular-nums", toneCls)}>{count.toLocaleString("uz-UZ")}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
    </Link>
  );
}
