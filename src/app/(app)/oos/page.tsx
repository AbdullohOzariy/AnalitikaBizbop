import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getDefaultRange, ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { PackageX, AlertTriangle, Boxes, Layers, TrendingDown } from "lucide-react";
import { PageHeader, StatCard, EmptyState, Pill } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { BazaFilter } from "../baza/baza-filter";
import { BazaPagination } from "../baza/baza-pagination";

const PAGE_SIZE = 50;
type View = "oos" | "low" | "dead";

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

type Row = {
  productId: number; branchId: number;
  code: number; pname: string; bname: string; cname: string | null;
  stockQty: string | null; soldQty: string | null; amount: string; periodEnd: string | Date;
};

type Kpi = { jami: number; oos: number; low: number; dead: number; oos_amount: number };

type Filters = { startStr: string; endStr: string; branchId?: number; categoryId?: number; q: string };

// ── Eng so'nggi snapshot CTE (DISTINCT ON productId, branchId) — 731k qatorli
// ProductSales ustidan og'ir so'rov; pastdagi keshlar tufayli faqat cache-miss'da yuradi.
function latestCte(f: Filters): Prisma.Sql {
  const inner: Prisma.Sql[] = [
    Prisma.sql`ps."periodStart" >= ${f.startStr}::date`,
    Prisma.sql`ps."periodEnd" <= ${f.endStr}::date`,
  ];
  if (f.branchId) inner.push(Prisma.sql`ps."branchId" = ${f.branchId}`);
  if (f.categoryId) inner.push(Prisma.sql`p."categoryId" = ${f.categoryId}`);
  if (f.q) inner.push(Prisma.sql`(p.name ILIKE ${"%" + f.q + "%"} OR p.code::text = ${f.q})`);
  return Prisma.sql`
    latest AS (
      SELECT DISTINCT ON (ps."productId", ps."branchId")
             ps."productId", ps."branchId", ps."stockQty", ps."soldQty", ps."amount", ps."periodEnd",
             p.code, p.name AS pname, p."categoryId", b.name AS bname
      FROM "ProductSales" ps
      JOIN "Product" p ON p.id = ps."productId"
      JOIN "Branch"  b ON b.id = ps."branchId"
      WHERE ${Prisma.join(inner, " AND ")}
      ORDER BY ps."productId", ps."branchId", ps."periodEnd" DESC
    )`;
}

const VIEW_COND: Record<View, Prisma.Sql> = {
  oos:  Prisma.sql`l."stockQty" IS NOT NULL AND l."stockQty" <= 0`,
  low:  Prisma.sql`l."stockQty" > 0 AND l."soldQty" IS NOT NULL AND l."soldQty" > 0 AND l."stockQty" < l."soldQty"`,
  dead: Prisma.sql`l."stockQty" > 0 AND (l."soldQty" IS NULL OR l."soldQty" = 0)`,
};

const filterKey = (f: Filters) =>
  [f.startStr, f.endStr, f.branchId ?? "all", f.categoryId ?? "all", f.q].join("|");

// Ma'lumot faqat fayl yuklanganda o'zgaradi — kesh tag orqali invalidatsiya bo'ladi.
const cachedKpi = (f: Filters) =>
  unstable_cache(
    async (): Promise<Kpi> => {
      const res = await prisma.$queryRaw<Kpi[]>(Prisma.sql`
        WITH ${latestCte(f)}
        SELECT
          count(*)::int AS jami,
          count(*) FILTER (WHERE ${VIEW_COND.oos})::int  AS oos,
          count(*) FILTER (WHERE ${VIEW_COND.low})::int  AS low,
          count(*) FILTER (WHERE ${VIEW_COND.dead})::int AS dead,
          COALESCE(SUM(l."amount") FILTER (WHERE ${VIEW_COND.oos}), 0)::float8 AS oos_amount
        FROM latest l
      `);
      return res[0] ?? { jami: 0, oos: 0, low: 0, dead: 0, oos_amount: 0 };
    },
    ["oosKpi_v1", filterKey(f)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

const cachedRows = (f: Filters, view: View, page: number) =>
  unstable_cache(
    async (): Promise<Row[]> => {
      return prisma.$queryRaw<Row[]>(Prisma.sql`
        WITH ${latestCte(f)}
        SELECT l."productId", l."branchId", l.code, l.pname, l.bname, l."stockQty", l."soldQty", l."amount", l."periodEnd",
               c.name AS cname
        FROM latest l
        LEFT JOIN "Category" c ON c.id = l."categoryId"
        WHERE ${VIEW_COND[view]}
        ORDER BY l."amount" DESC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
      `);
    },
    ["oosRows_v1", filterKey(f), view, String(page)],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: false }
  )();

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
  const offset = (page - 1) * PAGE_SIZE;

  const def = await getDefaultRange();
  const startDate = parseDate(sp.start) ?? def.start;
  const endDate = parseDate(sp.end) ?? def.end;
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);
  const branchId = sp.branchId ? parseInt(sp.branchId) : undefined;
  const categoryId = sp.categoryId ? parseInt(sp.categoryId) : undefined;
  const q = sp.q?.trim() ?? "";

  const filters: Filters = { startStr, endStr, branchId, categoryId, q };

  // KPI + jadval keshlangan; alohida count so'rovi YO'Q — tab soni KPI'da allaqachon bor
  // (oldin bir xil og'ir CTE 3 marta yurardi: KPI, jadval, count).
  const [kpi, rows, branches, categories] = await Promise.all([
    cachedKpi(filters),
    cachedRows(filters, view, page),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
      where: { products: { some: {} } },
    }),
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

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Faol SKU (so'nggi)" value={kpi.jami.toLocaleString("uz-UZ")} icon={Layers} tone="default"
          hint="tanlangan davrdagi oxirgi snapshot" />
        <StatCard label="Tugagan (OOS)" value={kpi.oos.toLocaleString("uz-UZ")} icon={PackageX} tone="red"
          hint={`${oosRate.toFixed(1)}% · ${fmtAmount(kpi.oos_amount)} so'm savdo`} />
        <StatCard label="Tugash xavfi" value={kpi.low.toLocaleString("uz-UZ")} icon={AlertTriangle} tone="orange"
          hint="qoldiq < davr savdosi" />
        <StatCard label="O'lik qoldiq" value={kpi.dead.toLocaleString("uz-UZ")} icon={TrendingDown} tone="default"
          hint="qoldiq bor, sotuv yo'q" />
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
                      <TableRow key={`${r.productId}-${r.branchId}`} className="text-sm">
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
    </div>
  );
}
