import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getDefaultRange } from "@/lib/analytics";
import { stockdayKpi, stockdayRows, type StockView, type SnapshotFilters } from "@/lib/snapshot-reports";
import { Hourglass, Flame, AlertTriangle, PackageCheck, Boxes, Layers, Download } from "lucide-react";
import { PageHeader, StatCard, EmptyState, Pill } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { BazaFilter } from "../baza/baza-filter";
import { BazaPagination } from "../baza/baza-pagination";

const PAGE_SIZE = 50;
type View = StockView;

function parseDate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? undefined : d;
}
function fmtQty(n: unknown): string {
  if (n == null) return "—";
  const num = Number(n);
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 2 }).format(num);
}
function fmtAmount(n: unknown): string {
  const num = Number(n);
  if (isNaN(num) || num === 0) return "—";
  return new Intl.NumberFormat("uz-UZ").format(Math.round(num));
}
function fmtDays(n: unknown): string {
  if (n == null) return "—";
  const num = Number(n);
  if (isNaN(num)) return "—";
  if (num >= 999) return "999+ kun";
  if (num > 0 && num < 1) return "<1 kun"; // bir kundan kam — zudlik bilan buyurtma
  return `${new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 1 }).format(num)} kun`;
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

  const filters: SnapshotFilters = { startStr, endStr, branchId, categoryId, q };

  // KPI + jadval keshlangan; alohida count so'rovi YO'Q — tab soni KPI'da allaqachon bor
  // (oldin bir xil og'ir CTE 3 marta yurardi: KPI, jadval, count).
  const [kpi, rows, branches, categories] = await Promise.all([
    stockdayKpi(filters),
    stockdayRows(filters, view, page, PAGE_SIZE),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
      where: { products: { some: {} } },
    }),
  ]);

  const total = kpi[view];
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const kritikRate = kpi.faol > 0 ? (kpi.kritik / kpi.faol) * 100 : 0;

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

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Faol SKU (qoldiq+sotuv)" value={kpi.faol.toLocaleString("uz-UZ")} icon={Layers} tone="default"
          hint="qoldiq va davr sotuvi bor" />
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

      {/* Jadval */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={Hourglass}
              title="Bu oraliqda tovar yo'q"
              description="Boshqa davr/filtr yoki tab tanlang. Zaxira kunlari faqat qoldig'i va sotuvi bor SKU'lar uchun hisoblanadi."
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
                      <TableHead className="text-right w-[110px]">Sotuv/kun</TableHead>
                      <TableHead className="text-right w-[120px]">Zaxira kunlari</TableHead>
                      <TableHead className="text-right w-[130px]">Qoldiq qiymati</TableHead>
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
                        <TableCell className="text-right tabular-nums text-xs">{fmtQty(r.stockQty)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{fmtQty(r.avgDaily)}</TableCell>
                        <TableCell className="text-right">
                          <Pill tone={VIEW_META[view].pill}>{fmtDays(r.stockDays)}</Pill>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{fmtAmount(r.stockValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col items-center gap-2 border-t border-border/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {offset + 1}–{Math.min(page * PAGE_SIZE, total)} / jami {total.toLocaleString("uz-UZ")} ta · {totalPages} sahifa
                </p>
                <BazaPagination page={page} totalPages={totalPages} basePath="/stockday" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
