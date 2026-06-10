import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getDefaultRange } from "@/lib/analytics";
import { stockdayKpi, stockdayTreeAgg, buildSnapshotTree, type StockView, type SnapshotFilters } from "@/lib/snapshot-reports";
import { SnapshotTree, type SnapCol } from "@/components/common/snapshot-tree";
import { stockdayLeavesAction } from "./actions";
import { scopeSubIds } from "@/lib/scope";
import { Hourglass, Flame, AlertTriangle, PackageCheck, Boxes, Layers, Download, TimerOff } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { BazaFilter } from "../baza/baza-filter";

type View = StockView;

function parseDate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? undefined : d;
}
function fmtAmount(n: unknown): string {
  const num = Number(n);
  if (isNaN(num) || num === 0) return "—";
  return new Intl.NumberFormat("uz-UZ").format(Math.round(num));
}

const VIEW_META: Record<View, {
  label: string; short: string; icon: typeof Flame; tone: "red" | "orange" | "green" | "blue";
  pill: "red" | "amber" | "green" | "blue";
}> = {
  kritik:   { label: "Kritik (≤3 kun)",    short: "Kritik",   icon: Flame,         tone: "red",    pill: "red" },
  kam:      { label: "Kam (4–7 kun)",      short: "Kam",      icon: AlertTriangle, tone: "orange", pill: "amber" },
  normal:   { label: "Normal (8–30 kun)",  short: "Normal",   icon: PackageCheck,  tone: "green",  pill: "green" },
  ortiqcha: { label: "Ortiqcha (>30 kun)", short: "Ortiqcha", icon: Boxes,         tone: "blue",   pill: "blue" },
};


// So'rovlar (keshlangan) lib'da — src/lib/snapshot-reports.ts (kesh isitish ham o'shandan foydalanadi).

export default async function StockdayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (!canSeeAnalytics(role)) redirect("/dashboard");

  const sp = await searchParams;
  const view: View =
    sp.view === "kam" || sp.view === "normal" || sp.view === "ortiqcha" ? sp.view : "kritik";

  const def = await getDefaultRange();
  const startDate = parseDate(sp.start) ?? def.start;
  const endDate = parseDate(sp.end) ?? def.end;
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);
  const branchId = sp.branchId ? parseInt(sp.branchId) : undefined;
  let categoryId = sp.categoryId ? parseInt(sp.categoryId) : undefined;
  const q = sp.q?.trim() ?? "";

  // Kategoriya menejeri qamrovi: faqat biriktirilgan kategoriyalar ko'rinadi
  const scope = await scopeSubIds(Number(session.user.id), role);
  if (scope && categoryId != null && !scope.includes(categoryId)) categoryId = undefined;

  const filters: SnapshotFilters = { startStr, endStr, branchId, categoryId, q, scopeSubIds: scope };
  // Kechikish xavfi "bugun"ga bog'liq (keyingi zakaz kunigacha hisob) — kunlik kesh kaliti
  const todayStr = new Date().toISOString().slice(0, 10);

  // Yengil so'rovlar (filtr ro'yxatlari) — shell darhol chiqadi; og'ir qism Suspense'da oqib keladi.
  const [branches, categories] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
      where: { products: { some: {} }, ...(scope ? { id: { in: scope } } : {}) },
    }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Hourglass}
        title="Stockday"
        description="Qoldiq o'rtacha kunlik sotuvga necha kun yetishi — qachon buyurtma berish kerakligi signali"
      >
        <BazaFilter
          basePath="/stockday"
          branches={branches}
          categories={categories}
          defaultStart={startStr}
          defaultEnd={endStr}
          defaultBranchId={sp.branchId}
          defaultCategoryId={sp.categoryId}
          defaultSearch={sp.q}
          showCategory
          showSearch
        />
      </PageHeader>

      {/* key: filtr/tab/sahifa o'zgarsa skeleton qayta ko'rinadi */}
      <Suspense
        key={[startStr, endStr, branchId ?? "all", categoryId ?? "all", q, view].join("|")}
        fallback={<StockdayDataSkeleton />}
      >
        <StockdayData filters={filters} view={view} sp={sp} todayStr={todayStr} />
      </Suspense>
    </div>
  );
}

function StockdayDataSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />)}
      </div>
      <Skeleton className="h-9 w-96 rounded-xl" />
      <Skeleton className="h-96 w-full rounded-2xl" />
    </>
  );
}

// Og'ir qism — KPI + tablar + jadval (keshlangan so'rovlar). Suspense ichida oqib keladi.
async function StockdayData({
  filters, view, sp, todayStr,
}: {
  filters: SnapshotFilters; view: View; sp: Record<string, string | undefined>;
  todayStr: string;
}) {
  const [kpi, treeAgg] = await Promise.all([
    stockdayKpi(filters, todayStr),
    stockdayTreeAgg(filters, view, todayStr),
  ]);
  const tree = buildSnapshotTree(treeAgg);
  const kritikRate = kpi.faol > 0 ? (kpi.kritik / kpi.faol) * 100 : 0;

  // Ustunlar — barglar (SKU×filial) uchun; har birida saralash + filtr
  const cols: SnapCol[] = [
    { key: "bname", label: "Filial", type: "text", filter: "select", width: "w-[130px]" },
    { key: "periodEnd", label: "Snapshot", type: "date", width: "w-[95px]" },
    { key: "stockQty", label: "Qoldiq", type: "num", filter: "range", width: "w-[95px]" },
    { key: "avgDaily", label: "Sotuv/kun", type: "num", filter: "range", width: "w-[100px]" },
    { key: "stockDays", label: "Zaxira kunlari", type: "days", filter: "range", pill: true, width: "w-[120px]" },
    { key: "arrivalDays", label: "Keladi", type: "days", filter: "range", risk: true, width: "w-[100px]" },
    { key: "stockValue", label: "Qoldiq qiymati", type: "money", filter: "range", width: "w-[130px]" },
  ];

  // View tab havolalari (joriy filtrlarni saqlab)
  const tabHref = (v: View) => {
    const p = new URLSearchParams();
    if (sp.start) p.set("start", sp.start);
    if (sp.end) p.set("end", sp.end);
    if (sp.branchId) p.set("branchId", sp.branchId);
    if (sp.categoryId) p.set("categoryId", sp.categoryId);
    if (sp.q) p.set("q", sp.q);
    p.set("view", v);
    return `/stockday?${p.toString()}`;
  };
  const tabCount: Record<View, number> = { kritik: kpi.kritik, kam: kpi.kam, normal: kpi.normal, ortiqcha: kpi.ortiqcha };

  const exportQs = (() => {
    const p = new URLSearchParams();
    for (const k of ["start", "end", "branchId", "categoryId", "q", "view"]) { const v = sp[k]; if (v) p.set(k, v); }
    return p.toString();
  })();

  return (
    <>
      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Faol SKU (qoldiq+sotuv)" value={kpi.faol.toLocaleString("uz-UZ")} icon={Layers} tone="default"
          hint="qoldiq va davr sotuvi bor" />
        <StatCard label="Kechikish xavfi" value={kpi.xavf.toLocaleString("uz-UZ")} icon={TimerOff}
          tone={kpi.xavf > 0 ? "red" : "default"}
          hint="keyingi zakazda ham yetib kelguncha tugaydi" />
        <StatCard label="Kritik (≤3 kun)" value={kpi.kritik.toLocaleString("uz-UZ")} icon={Flame} tone="red"
          hint={`${kritikRate.toFixed(1)}% · zudlik bilan buyurtma`} />
        <StatCard label="Kam (4–7 kun)" value={kpi.kam.toLocaleString("uz-UZ")} icon={AlertTriangle} tone="orange"
          hint="tez orada buyurtma kerak" />
        <StatCard label="Ortiqcha (>30 kun)" value={kpi.ortiqcha.toLocaleString("uz-UZ")} icon={Boxes} tone="blue"
          hint={kpi.ortiqcha_value > 0 ? `≈ ${fmtAmount(kpi.ortiqcha_value)} so'm muzlagan kapital` : "zaxira ko'p · sekin aylanma"} />
      </div>

      {/* View tabs */}
      <div role="tablist" className="flex flex-wrap gap-2">
        {(Object.keys(VIEW_META) as View[]).map((v) => {
          const m = VIEW_META[v];
          const active = v === view;
          const Icon = m.icon;
          return (
            <Link key={v} href={tabHref(v)} scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
                active ? "border-primary bg-primary text-primary-foreground shadow-sm"
                       : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}>
              <Icon className="h-4 w-4" />
              {m.label}
              <span className={cn("rounded-full px-1.5 py-0.5 text-xs",
                active ? "bg-primary-foreground/20" : "bg-muted")}>
                {tabCount[v].toLocaleString("uz-UZ")}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Eksport */}
      <div className="flex justify-end">
        <a href={`/api/stockday/export?${exportQs}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary">
          <Download className="h-4 w-4" /> Excel eksport
        </a>
      </div>

      {/* Iyerarxik jadval */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {tree.length === 0 ? (
            <EmptyState
              icon={Hourglass}
              title="Bu oraliqda tovar yo'q"
              description="Boshqa davr/filtr yoki tab tanlang. Zaxira kunlari faqat qoldig'i va sotuvi bor SKU'lar uchun hisoblanadi."
            />
          ) : (
            <SnapshotTree
              groups={tree}
              cols={cols}
              ctx={{ startStr: filters.startStr, endStr: filters.endStr, branchId: filters.branchId, q: filters.q, view, todayStr }}
              loadLeaves={stockdayLeavesAction as never}
              pillTone={VIEW_META[view].pill}
              totalLabel="qoldiq qiymati"
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
