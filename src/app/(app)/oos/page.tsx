import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getDefaultRange } from "@/lib/analytics";
import { oosKpi, oosRows, type OosView, type SnapshotFilters } from "@/lib/snapshot-reports";
import { scopeSubIds } from "@/lib/scope";
import { PackageX, AlertTriangle, Boxes, Layers, TrendingDown } from "lucide-react";
import { PageHeader, StatCard, EmptyState, Pill } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { skuRowBg } from "@/lib/sku-rang";
import { BazaFilter } from "../baza/baza-filter";
import { BazaPagination } from "../baza/baza-pagination";

const PAGE_SIZE = 50;
type View = OosView;

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
function fmtQty(n: unknown): string {
  if (n == null) return "—";
  const num = Number(n);
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 2 }).format(num);
}

const VIEW_META: Record<View, { label: string; icon: typeof PackageX; tone: "red" | "orange" | "default" }> = {
  oos:  { label: "Tugagan (OOS)",   icon: PackageX,      tone: "red" },
  low:  { label: "Tugash xavfi",    icon: AlertTriangle, tone: "orange" },
  dead: { label: "O'lik qoldiq",    icon: Boxes,         tone: "default" },
};

// So'rovlar (keshlangan) lib'da — src/lib/snapshot-reports.ts (kesh isitish ham o'shandan foydalanadi).

export default async function OosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (!canSeeAnalytics(role)) redirect("/dashboard");

  const sp = await searchParams;
  const view: View = sp.view === "low" || sp.view === "dead" ? sp.view : "oos";
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);

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
  // URL orqali qamrovdan tashqari kategoriya so'ralsa — e'tiborsiz (xavfsizlik)
  if (scope && categoryId != null && !scope.includes(categoryId)) categoryId = undefined;

  const filters: SnapshotFilters = { startStr, endStr, branchId, categoryId, q, scopeSubIds: scope };

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
        icon={PackageX}
        title="OOS"
        description="Qoldiq (Остаток) asosida tugagan, tugash xavfi va o'lik qoldiq tovarlar"
      >
        <BazaFilter
          basePath="/oos"
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

      {/* key: filtr/tab/sahifa o'zgarsa skeleton qayta ko'rinadi (aks holda eski
          ma'lumot indikatorsiz qotib turardi) */}
      <Suspense
        key={[startStr, endStr, branchId ?? "all", categoryId ?? "all", q, view, page].join("|")}
        fallback={<OosDataSkeleton />}
      >
        <OosData filters={filters} view={view} page={page} sp={sp} />
      </Suspense>
    </div>
  );
}

function OosDataSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />)}
      </div>
      <Skeleton className="h-9 w-72 rounded-xl" />
      <Skeleton className="h-96 w-full rounded-2xl" />
    </>
  );
}

// Og'ir qism — KPI + tablar + jadval (keshlangan so'rovlar). Suspense ichida oqib keladi.
async function OosData({
  filters, view, page, sp,
}: {
  filters: SnapshotFilters; view: View; page: number; sp: Record<string, string | undefined>;
}) {
  const offset = (page - 1) * PAGE_SIZE;
  const [kpi, rows] = await Promise.all([
    oosKpi(filters),
    oosRows(filters, view, page, PAGE_SIZE),
  ]);

  const total = view === "oos" ? kpi.oos : view === "low" ? kpi.low : kpi.dead;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const oosRate = kpi.jami > 0 ? (kpi.oos / kpi.jami) * 100 : 0;

  // View tab havolalari (joriy filtrlarni saqlab)
  const tabHref = (v: View) => {
    const p = new URLSearchParams();
    if (sp.start) p.set("start", sp.start);
    if (sp.end) p.set("end", sp.end);
    if (sp.branchId) p.set("branchId", sp.branchId);
    if (sp.categoryId) p.set("categoryId", sp.categoryId);
    if (sp.q) p.set("q", sp.q);
    p.set("view", v);
    return `/oos?${p.toString()}`;
  };
  const tabCount: Record<View, number> = { oos: kpi.oos, low: kpi.low, dead: kpi.dead };

  return (
    <>
      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Faol SKU (so'nggi)" value={kpi.jami.toLocaleString("uz-UZ")} icon={Layers} tone="default"
          hint="tanlangan davrdagi oxirgi snapshot" />
        <StatCard label="Tugagan (OOS)" value={kpi.oos.toLocaleString("uz-UZ")} icon={PackageX} tone="red"
          hint={`${oosRate.toFixed(1)}% · ${fmtAmount(kpi.oos_amount)} so'm savdo`} />
        <StatCard label="Tugash xavfi" value={kpi.low.toLocaleString("uz-UZ")} icon={AlertTriangle} tone="orange"
          hint="qoldiq < davr savdosi" />
        <StatCard label="O'lik qoldiq" value={kpi.dead.toLocaleString("uz-UZ")} icon={TrendingDown} tone="default"
          hint="butun davrda sotuv 0 · ≥2 yuklash" />
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

      {/* Jadval */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="Bu kategoriyada tovar yo'q"
              description="Boshqa davr/filtr tanlang. Ma'lumot bo'lmasa — Fayllar bo'limidan SKU (Остаток ustunli) sotuv faylini yuklang."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[90px]">Kod</TableHead>
                      <TableHead>Mahsulot</TableHead>
                      <TableHead>Kategoriya</TableHead>
                      <TableHead>Filial</TableHead>
                      <TableHead className="w-[100px]">Snapshot</TableHead>
                      <TableHead className="text-right w-[90px]">Qoldiq</TableHead>
                      <TableHead className="text-right w-[90px]">Sotilgan</TableHead>
                      <TableHead className="text-right w-[130px]">Savdo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      // Fon — SKU'ning ABC×XYZ matritsa holatiga ko'ra
                      <TableRow key={`${r.productId}-${r.branchId}`} className={cn("text-sm", skuRowBg(r.abc, r.xyz))}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.code}</TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="line-clamp-2 leading-snug">{r.pname}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.cname ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.bname}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {String(r.periodEnd).slice(0, 10)}
                        </TableCell>
                        <TableCell className="text-right">
                          {view === "oos" ? (
                            <Pill tone="red">{fmtQty(r.stockQty)}</Pill>
                          ) : (
                            <span className={cn("tabular-nums text-xs", view === "low" && "font-medium text-amber-600 dark:text-amber-400")}>
                              {fmtQty(r.stockQty)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{fmtQty(r.soldQty)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-medium">{fmtAmount(r.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col items-center gap-2 border-t border-border/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {offset + 1}–{Math.min(page * PAGE_SIZE, total)} / jami {total.toLocaleString("uz-UZ")} ta · {totalPages} sahifa
                </p>
                <BazaPagination page={page} totalPages={totalPages} basePath="/oos" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
