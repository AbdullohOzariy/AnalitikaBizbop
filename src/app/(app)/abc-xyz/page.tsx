import { Fragment, Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getDefaultRange } from "@/lib/analytics";
import {
  computeAbcXyz, buildAnalizTree, buildMatrix, stripSkus,
  ABC_A_LIMIT, ABC_B_LIMIT, XYZ_X_LIMIT, XYZ_Y_LIMIT,
  type AbcClass, type XyzClass,
} from "@/lib/abc-xyz";
import { LayoutGrid, BarChart3, Activity, Layers, AlertTriangle, CalendarRange } from "lucide-react";
import { PageHeader, StatCard, EmptyState, Pill } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { BazaFilter } from "../baza/baza-filter";
import { AnalizTree } from "./analiz-tree";

export const dynamic = "force-dynamic";

type Tab = "abc" | "xyz" | "matritsa";

const TAB_META: Record<Tab, { label: string; icon: typeof BarChart3 }> = {
  abc:      { label: "ABC",      icon: BarChart3 },
  xyz:      { label: "XYZ",      icon: Activity },
  matritsa: { label: "Matritsa", icon: LayoutGrid },
};

function parseDate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? undefined : d;
}

function pct(v: number, digits = 1): string {
  return (v * 100).toFixed(digits) + "%";
}

// ABC×XYZ matritsa katagi ohanglari: yashil — barqaror daromad, qizil — muammoli zona
const CELL_TONE: Record<AbcClass, Record<XyzClass, string>> = {
  A: {
    X: "border-emerald-500/40 bg-emerald-500/10",
    Y: "border-emerald-500/30 bg-emerald-500/5",
    Z: "border-amber-500/40 bg-amber-500/10",
  },
  B: {
    X: "border-emerald-500/30 bg-emerald-500/5",
    Y: "border-amber-500/30 bg-amber-500/5",
    Z: "border-orange-500/40 bg-orange-500/10",
  },
  C: {
    X: "border-amber-500/30 bg-amber-500/5",
    Y: "border-orange-500/40 bg-orange-500/10",
    Z: "border-destructive/40 bg-destructive/10",
  },
};

const CELL_HINT: Record<AbcClass, Record<XyzClass, string>> = {
  A: {
    X: "Oltin fond — doimo zaxirada, avtomatik buyurtma",
    Y: "Yuqori daromad, o'zgaruvchan — bufer zaxira bilan",
    Z: "Yuqori daromad, notekis — qo'lda nazorat, aksiya tahlili",
  },
  B: {
    X: "Barqaror o'rtacha — avtomatik buyurtma",
    Y: "Standart nazorat",
    Z: "Notekis o'rtacha — buyurtmani ehtiyotkor rejalashtirish",
  },
  C: {
    X: "Kam, lekin barqaror — minimal zaxira",
    Y: "Kam va o'zgaruvchan — minimal e'tibor",
    Z: "Assortimentdan chiqarish nomzodi",
  },
};

export default async function AbcXyzPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeAnalytics(session.user.role)) redirect("/dashboard");

  const sp = await searchParams;
  const tab: Tab = sp.tab === "xyz" || sp.tab === "matritsa" ? sp.tab : "abc";

  // Default davr: ma'lumotli oxirgi oy + undan oldingi 2 oy (XYZ uchun tarix kerak)
  const def = await getDefaultRange();
  const defStart = new Date(Date.UTC(def.end.getUTCFullYear(), def.end.getUTCMonth() - 2, 1));
  const startDate = parseDate(sp.start) ?? defStart;
  const endDate = parseDate(sp.end) ?? def.end;
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);
  const branchId = sp.branchId ? parseInt(sp.branchId) : undefined;

  // Yengil so'rov (filtr ro'yxati) — shell darhol; og'ir hisob Suspense'da oqib keladi.
  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });

  return (
    <div className="space-y-5">
      <PageHeader
        icon={LayoutGrid}
        title="ABC / XYZ tahlili"
        description="SKU bo'yicha daromad ulushi (ABC) va talab barqarorligi (XYZ) — to'liq iyerarxik ko'rinishda"
      >
        <BazaFilter
          basePath="/abc-xyz"
          branches={branches}
          defaultStart={startStr}
          defaultEnd={endStr}
          defaultBranchId={sp.branchId}
        />
      </PageHeader>

      {/* key: filtr/tab o'zgarsa skeleton qayta ko'rinadi */}
      <Suspense
        key={[startStr, endStr, branchId ?? "all", tab].join("|")}
        fallback={<AbcDataSkeleton />}
      >
        <AbcData startStr={startStr} endStr={endStr} branchId={branchId} tab={tab} sp={sp} />
      </Suspense>
    </div>
  );
}

function AbcDataSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />)}
      </div>
      <Skeleton className="h-9 w-64 rounded-xl" />
      <Skeleton className="h-96 w-full rounded-2xl" />
    </>
  );
}

// Og'ir qism — hisob + KPI + tablar + daraxt/matritsa. Suspense ichida oqib keladi.
async function AbcData({
  startStr, endStr, branchId, tab, sp,
}: {
  startStr: string; endStr: string; branchId?: number; tab: Tab;
  sp: Record<string, string | undefined>;
}) {
  const result = await computeAbcXyz(startStr, endStr, branchId);
  // SKU'lar payload'ga kirmaydi (minglab qator) — subkat ochilganda action yuklaydi.
  const tree = stripSkus(buildAnalizTree(result));
  const matrix = buildMatrix(result);

  // KPI: sinflar bo'yicha SKU soni va savdo ulushi
  const stat = (cls: AbcClass | XyzClass) => {
    let n = 0, sum = 0;
    for (const r of result.rows) {
      if (r.abc === cls || r.xyz === cls) { n++; sum += r.total; }
    }
    return { n, share: result.totalAmount > 0 ? sum / result.totalAmount : 0 };
  };
  const a = stat("A");
  const ax = matrix.A.X;

  const tabHref = (t: Tab) => {
    const p = new URLSearchParams();
    if (sp.start) p.set("start", sp.start);
    if (sp.end) p.set("end", sp.end);
    if (sp.branchId) p.set("branchId", sp.branchId);
    p.set("tab", t);
    return `/abc-xyz?${p.toString()}`;
  };

  return (
    <>
      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tahlildagi SKU" value={result.rows.length.toLocaleString("uz-UZ")} icon={Layers}
          hint="davrda savdosi bo'lganlar" />
        <StatCard label="Davrlar soni" value={result.nPeriods.toLocaleString("uz-UZ")} icon={CalendarRange}
          tone={result.nPeriods < 3 ? "orange" : "default"}
          hint={result.nPeriods < 3 ? "XYZ uchun kamida 3 davr tanlang" : "yuklash davrlari (XYZ asosi)"} />
        <StatCard label="A sinf" value={a.n.toLocaleString("uz-UZ")} icon={BarChart3} tone="green"
          hint={`savdoning ${pct(a.share)} qismi`} />
        <StatCard label="AX (oltin fond)" value={ax.count.toLocaleString("uz-UZ")} icon={LayoutGrid} tone="green"
          hint={`savdoning ${pct(ax.share)} qismi · barqaror`} />
      </div>

      {result.nPeriods > 0 && result.nPeriods < 3 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Tanlangan davrda atigi {result.nPeriods} ta yuklash davri bor — XYZ (barqarorlik) bahosi ishonchli emas.
          Kamida 3 davrni qamraydigan oraliq tanlang.
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" className="flex flex-wrap gap-2">
        {(Object.keys(TAB_META) as Tab[]).map((t) => {
          const m = TAB_META[t];
          const active = t === tab;
          const Icon = m.icon;
          return (
            <Link key={t} href={tabHref(t)} scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
                active ? "border-primary bg-primary text-primary-foreground shadow-sm"
                       : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}>
              <Icon className="h-4 w-4" />
              {m.label}
            </Link>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {result.rows.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title="Tanlangan davrda savdo ma'lumoti yo'q"
              description="Boshqa davr/filial tanlang yoki Fayllar bo'limidan SKU sotuv faylini yuklang."
            />
          ) : tab === "matritsa" ? (
            <div className="space-y-5 p-4 sm:p-6">
              {/* 3×3 matritsa */}
              <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2">
                <div />
                {(["X", "Y", "Z"] as const).map((xc) => (
                  <div key={xc} className="text-center text-xs font-semibold text-muted-foreground">
                    {xc} — {xc === "X" ? `barqaror (CV ≤ ${XYZ_X_LIMIT * 100}%)` : xc === "Y" ? `o'rtacha (≤ ${XYZ_Y_LIMIT * 100}%)` : `notekis (> ${XYZ_Y_LIMIT * 100}%)`}
                  </div>
                ))}
                {(["A", "B", "C"] as const).map((ac) => (
                  <Fragment key={ac}>
                    <div className="flex items-center pr-1 text-xs font-semibold text-muted-foreground">
                      {ac} — {ac === "A" ? `top ${ABC_A_LIMIT * 100}%` : ac === "B" ? `keyingi ${(ABC_B_LIMIT - ABC_A_LIMIT) * 100}%` : "qolgan"}
                    </div>
                    {(["X", "Y", "Z"] as const).map((xc) => {
                      const cell = matrix[ac][xc];
                      return (
                        <div
                          key={xc}
                          title={CELL_HINT[ac][xc]}
                          className={cn("rounded-xl border p-3 text-center", CELL_TONE[ac][xc])}
                        >
                          <div className="text-lg font-bold tabular-nums">{cell.count.toLocaleString("uz-UZ")}</div>
                          <div className="text-[11px] text-muted-foreground">SKU</div>
                          <div className="mt-1 text-xs font-medium tabular-nums">{formatUZS(cell.total, { compact: true })}</div>
                          <div className="text-[11px] tabular-nums text-muted-foreground">{pct(cell.share)}</div>
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>

              {/* Strategiya izohi */}
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <Pill tone="green" className="mb-1.5">AX · AY · BX</Pill>
                  <p>Asosiy daromad, bashorat qilinadigan talab — doimo zaxirada bo'lishi shart, avtomatik buyurtma.</p>
                </div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <Pill tone="amber" className="mb-1.5">AZ · BY · BZ · CX</Pill>
                  <p>O'rtacha yoki o'zgaruvchan — bufer zaxira va qo'lda nazorat; AZ'da aksiya/mavsum ta'sirini tekshiring.</p>
                </div>
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <Pill tone="red" className="mb-1.5">CY · CZ</Pill>
                  <p>Kam daromad, notekis talab — minimal zaxira; CZ — assortimentdan chiqarish nomzodlari.</p>
                </div>
              </div>
            </div>
          ) : (
            <AnalizTree groups={tree} mode={tab} ctx={{ start: startStr, end: endStr, branchId }} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
