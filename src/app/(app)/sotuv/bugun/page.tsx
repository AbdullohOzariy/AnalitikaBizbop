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
    (role !== "SYSTEM_ADMIN" && role !== "ADMIN" && role !== "CAT_MANAGER" && role !== "SUPPLYCHAIN" && role !== "HEAD_CAT_MANAGER")
  ) {
    redirect("/dashboard-v2");
  }
  const userId = Number(session.user.id);
  const canCreateOrder = role === "SYSTEM_ADMIN" || role === "CAT_MANAGER" || role === "HEAD_CAT_MANAGER";

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

  // ── Zakaz nishonlari: bugun/ertaga zakaz qabul qiladigan AGENTLAR + agentsiz
  // yetkazib beruvchilar (qamrov ichida). Zakaz kunlari ANIQ SANALAR:
  // agentda AgentOrderDay, agentsiz SKU'larda SupplierOrderDay.
  const todayD = new Date(todayStr + "T00:00:00.000Z");
  const tomorrowD = new Date(todayD.getTime() + 86_400_000);
  const scopeProd = scopeProductWhere(scopeParents);
  // Zakaz kuni = aniq sana (OrderDay) YOKI doimiy hafta kuni (orderWeekdays)
  const agentWhere = (d: Date) => ({
    OR: [{ orderDays: { some: { sana: d } } }, { orderWeekdays: { has: d.getUTCDay() } }],
    products: { some: { archivedAt: null, ...scopeProd } },
  });
  // Agentsiz: faqat agentga biriktirilmagan (agentId:null) SKU'lari bor supplier
  const supplierWhere = (d: Date) => ({
    OR: [{ orderDays: { some: { sana: d } } }, { orderWeekdays: { has: d.getUTCDay() } }],
    products: { some: { archivedAt: null, agentId: null, ...scopeProd } },
  });

  const def = await getDefaultRange();
  const filters: SnapshotFilters = {
    startStr: def.start.toISOString().slice(0, 10),
    endStr: def.end.toISOString().slice(0, 10),
    q: "",
    scopeSubIds: scope,
  };

  const [todayAgents, tomorrowAgents, todaySuppliers, tomorrowSuppliers, sdKpi, oKpi] = await Promise.all([
    prisma.agent.findMany({
      where: agentWhere(todayD),
      select: { id: true, name: true, supplierId: true, supplier: { select: { name: true, rating: true } } },
      orderBy: [{ supplier: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.agent.findMany({
      where: agentWhere(tomorrowD),
      select: { id: true, name: true, supplierId: true, supplier: { select: { name: true } } },
      orderBy: [{ supplier: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.supplier.findMany({
      where: supplierWhere(todayD),
      select: { id: true, name: true, rating: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({
      where: supplierWhere(tomorrowD),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    stockdayKpi(filters, todayStr),
    oosKpi(filters),
  ]);

  // Bugungi nishonlar (agent + agentsiz supplier) — bitta ro'yxatga jamlaymiz
  type OrderTarget = { key: string; supplierId: number; agentId: number | null; label: string; rating: number | null; href: string };
  const todayTargets: OrderTarget[] = [
    ...todayAgents.map((a) => ({
      key: `${a.supplierId}:${a.id}`,
      supplierId: a.supplierId,
      agentId: a.id,
      label: `${a.supplier.name} · ${a.name}`,
      rating: a.supplier.rating,
      href: `/sotuv/sotib-olish/yangi?supplier=${a.supplierId}&agent=${a.id}`,
    })),
    ...todaySuppliers.map((s) => ({
      key: `${s.id}:none`,
      supplierId: s.id,
      agentId: null,
      label: s.name,
      rating: s.rating,
      href: `/sotuv/sotib-olish/yangi?supplier=${s.id}`,
    })),
  ].sort((a, b) => a.label.localeCompare(b.label, "uz"));

  // Bugun allaqachon berilgan zakazlar (supplier×agent bo'yicha; menejer — faqat o'ziniki)
  const targetSupIds = [...new Set(todayTargets.map((t) => t.supplierId))];
  const todayOrders = targetSupIds.length
    ? await prisma.purchaseOrder.findMany({
        where: {
          supplierId: { in: targetSupIds },
          createdAt: { gte: todayStartUtc },
          ...(role === "CAT_MANAGER" ? { createdById: userId } : {}),
        },
        select: { id: true, supplierId: true, agentId: true, status: true },
        orderBy: { id: "desc" },
      })
    : [];
  const orderByTarget = new Map<string, { id: number; status: string }>();
  for (const o of todayOrders) {
    const k = `${o.supplierId}:${o.agentId ?? "none"}`;
    if (!orderByTarget.has(k)) orderByTarget.set(k, { id: o.id, status: o.status });
  }

  // Qamrovdagi SKU soni har nishon uchun (agent yoki agentsiz supplier)
  const todayAgentIds = todayAgents.map((a) => a.id);
  const todaySupIds = todaySuppliers.map((s) => s.id);
  const [agentSkuCounts, supSkuCounts] = await Promise.all([
    todayAgentIds.length
      ? prisma.product.groupBy({ by: ["agentId"], where: { agentId: { in: todayAgentIds }, archivedAt: null, ...scopeProd }, _count: { _all: true } })
      : Promise.resolve([] as { agentId: number | null; _count: { _all: number } }[]),
    todaySupIds.length
      ? prisma.product.groupBy({ by: ["supplierId"], where: { supplierId: { in: todaySupIds }, agentId: null, archivedAt: null, ...scopeProd }, _count: { _all: true } })
      : Promise.resolve([] as { supplierId: number | null; _count: { _all: number } }[]),
  ]);
  const agentSupMap = new Map(todayAgents.map((a) => [a.id, a.supplierId]));
  const skuByKey = new Map<string, number>();
  for (const g of agentSkuCounts) {
    if (g.agentId == null) continue;
    const sid = agentSupMap.get(g.agentId);
    if (sid != null) skuByKey.set(`${sid}:${g.agentId}`, g._count._all);
  }
  for (const g of supSkuCounts) if (g.supplierId != null) skuByKey.set(`${g.supplierId}:none`, g._count._all);

  // Ertangi nishonlar (agent + agentsiz supplier)
  const tomorrowTargets = [
    ...tomorrowAgents.map((a) => ({ id: `a${a.id}`, supplierId: a.supplierId, label: `${a.supplier.name} · ${a.name}` })),
    ...tomorrowSuppliers.map((s) => ({ id: `s${s.id}`, supplierId: s.id, label: s.name })),
  ].sort((a, b) => a.label.localeCompare(b.label, "uz"));

  const done = todayTargets.filter((t) => orderByTarget.has(t.key)).length;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={CalendarCheck}
        title="Bugun"
        description={`${WD_UZ[dow]}, ${todayStr} — kunlik ish navbati${role === "CAT_MANAGER" ? " (sizning kategoriyalaringiz)" : ""}`}
      />

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Bugungi zakaz kunlari" value={todayTargets.length.toLocaleString("uz-UZ")} icon={Truck}
          hint="zakaz qabul qiladigan agent/yetkazib beruvchilar" />
        <StatCard label="Zakaz berildi" value={`${done}/${todayTargets.length}`} icon={CheckCircle2}
          tone={todayTargets.length > 0 && done === todayTargets.length ? "green" : "default"}
          hint={done < todayTargets.length ? "qolganlari kutilmoqda" : "hammasi bajarildi"} />
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
            <CardTitle className="text-base">Bugun zakaz beriladigan agent / yetkazib beruvchilar</CardTitle>
            <p className="text-xs text-muted-foreground">
              Zakaz kunlari agent (yoki agentsiz SKU uchun yetkazib beruvchi) profilida belgilanadi.
              Tugma — nishon tanlangan holda tayyor zakaz oynasini ochadi.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {todayTargets.length === 0 ? (
              <p className="py-6 text-center text-sm italic text-muted-foreground">
                Bugun zakaz kuni belgilangan agent/yetkazib beruvchi yo&apos;q.
                Zakaz kunlarini <Link href="/baza/taminotchilar" className="underline underline-offset-2">yetkazib beruvchi profillarida</Link> belgilang.
              </p>
            ) : (
              todayTargets.map((t) => {
                const order = orderByTarget.get(t.key);
                return (
                  <div
                    key={t.key}
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
                        {t.label}
                        {t.rating != null && <span className="ml-1.5 text-xs text-amber-500">{"★".repeat(t.rating)}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(skuByKey.get(t.key) ?? 0).toLocaleString("uz-UZ")} SKU
                        {order && <> · zakaz <Link href={`/sotuv/sotib-olish/${order.id}`} className="underline underline-offset-2">#{order.id}</Link> berildi</>}
                      </p>
                    </div>
                    {order ? (
                      <Pill tone="green" className="text-[10px]">bajarildi</Pill>
                    ) : canCreateOrder ? (
                      <Link
                        href={t.href}
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
              {tomorrowTargets.length === 0 ? (
                <p className="py-2 text-center text-xs italic text-muted-foreground">Ertaga zakaz kuni yo&apos;q.</p>
              ) : (
                <ul className="space-y-1.5">
                  {tomorrowTargets.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <Link href={`/baza/taminotchilar/${t.supplierId}`} className="truncate hover:underline">{t.label}</Link>
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
