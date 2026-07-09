import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { scopeSubIds } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { getQoldiqReport, type QoldiqSort } from "@/lib/qoldiq";
import { parseDateParam, isoDay, nowTashkent } from "@/lib/date";
import { formatDateTimeUZ } from "@/lib/format";
import { Warehouse, Layers, Boxes, Database, Download } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { QoldiqFilter } from "./qoldiq-filter";
import { BazaPagination } from "../baza-pagination";

const PAGE_SIZE = 100;
const SORTS: QoldiqSort[] = ["qty", "code", "name"];

function fmtQty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "—";
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 2 }).format(n);
}

export default async function QoldiqPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const roles = session.user.roles;
  if (!canSeeAnalytics(roles)) redirect("/dashboard");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);
  // Sana — default bugungi Toshkent kuni (parseDateParam qat'iy validatsiya qiladi).
  const dayDate = parseDateParam(sp.day) ?? nowTashkent();
  const dayStr = isoDay(dayDate);
  const branchId = sp.branchId ? parseInt(sp.branchId) : undefined;
  let categoryId = sp.categoryId ? parseInt(sp.categoryId) : undefined;
  const q = sp.q?.trim() ?? "";
  const sort: QoldiqSort = SORTS.includes(sp.sort as QoldiqSort) ? (sp.sort as QoldiqSort) : "qty";

  // Kategoriya menejeri qamrovi: faqat biriktirilgan kategoriyalar ko'rinadi (Stockday bilan izchil).
  const scope = await scopeSubIds(Number(session.user.id), roles);
  if (scope && categoryId != null && !scope.includes(categoryId)) categoryId = undefined;

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
        icon={Warehouse}
        title="Qoldiq"
        description="SKU darajasida filial va markaziy sklad qoldig'i — tanlangan kun holatiga"
      >
        <QoldiqFilter
          basePath="/baza/qoldiq"
          branches={branches}
          categories={categories}
          defaultDay={dayStr}
          defaultBranchId={sp.branchId}
          defaultCategoryId={sp.categoryId}
          defaultSearch={sp.q}
          defaultSort={sort}
        />
      </PageHeader>

      {/* key: filtr/sahifa o'zgarsa skeleton qayta ko'rinadi */}
      <Suspense
        key={[dayStr, branchId ?? "all", categoryId ?? "all", q, sort, page].join("|")}
        fallback={<QoldiqDataSkeleton />}
      >
        <QoldiqData
          dayStr={dayStr}
          branchId={branchId}
          categoryId={categoryId}
          q={q}
          sort={sort}
          page={page}
          scope={scope}
          sp={sp}
        />
      </Suspense>
    </div>
  );
}

function QoldiqDataSkeleton() {
  return (
    <>
      <Skeleton className="h-4 w-56" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />)}
      </div>
      <Skeleton className="h-96 w-full rounded-2xl" />
    </>
  );
}

// Og'ir qism — statistika + jadval (keshlangan so'rov). Suspense ichida oqib keladi.
async function QoldiqData({
  dayStr, branchId, categoryId, q, sort, page, scope, sp,
}: {
  dayStr: string;
  branchId?: number;
  categoryId?: number;
  q: string;
  sort: QoldiqSort;
  page: number;
  scope: number[] | null;
  sp: Record<string, string | undefined>;
}) {
  const report = await getQoldiqReport({
    dayStr, branchId, categoryId, q, page, pageSize: PAGE_SIZE, scopeSubIds: scope, sort,
  });
  const totalPages = Math.ceil(report.total / PAGE_SIZE);

  const exportQs = (() => {
    const p = new URLSearchParams();
    p.set("day", dayStr);
    for (const k of ["branchId", "categoryId", "q", "sort"]) { const v = sp[k]; if (v) p.set(k, v); }
    return p.toString();
  })();

  return (
    <>
      {/* Holat vaqti — asOf ma'lumot bilan birga keladi, shu uchun PageHeader'dan ko'ra shu yerda */}
      <p className="text-xs text-muted-foreground">
        Holat: {report.asOf ? `${formatDateTimeUZ(report.asOf)} dagi JSON bo'yicha` : "Ma'lumot yo'q"}
      </p>

      {/* Statistika */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Jami SKU" value={report.totals.skuCount.toLocaleString("uz-UZ")} icon={Layers} tone="blue" />
        <StatCard label="Filial qoldig'i jami" value={fmtQty(report.totals.branchQtySum)} icon={Boxes} tone="green" />
        <StatCard label="Markaziy sklad jami" value={fmtQty(report.totals.warehouseQtySum)} icon={Database} tone="orange" />
      </div>

      {/* Eksport */}
      <div className="flex justify-end">
        <a href={`/api/baza/qoldiq/export?${exportQs}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary">
          <Download className="h-4 w-4" /> Excel eksport
        </a>
      </div>

      {/* Jadval */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {report.rows.length === 0 ? (
            <EmptyState
              icon={Warehouse}
              title="Tanlangan filtrlarga mos qoldiq topilmadi"
              description="Boshqa sana yoki filtr tanlang."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[90px]">Kod</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Kategoriya</TableHead>
                      <TableHead className="text-right w-[110px]">Filial qoldiq</TableHead>
                      <TableHead className="text-right w-[120px]">Markaziy sklad</TableHead>
                      <TableHead className="w-[100px]">Qoldiq sanasi</TableHead>
                      <TableHead className="w-[130px]">Vaqt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.map((r) => {
                      const catLabel = [r.groupName, r.catName, r.subName].filter(Boolean).join(" › ") || "—";
                      // qator sanasi tanlangan sanadan eski bo'lsa — shu SKU uchun tanlangan kunga
                      // aniq snapshot topilmagan, oldingi ma'lumot ko'rsatilyapti (vizual ogohlantirish).
                      const isStale = r.day < dayStr;
                      return (
                        <TableRow key={r.id} className="text-sm">
                          <TableCell className="font-mono text-xs text-muted-foreground">{r.code}</TableCell>
                          <TableCell className="max-w-[220px]">
                            <span className="line-clamp-2 leading-snug">{r.name}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{catLabel}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs font-medium">{fmtQty(r.branchQty)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{fmtQty(r.warehouseQty)}</TableCell>
                          <TableCell
                            className={cn("text-xs whitespace-nowrap", isStale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}
                            title={isStale ? "Eski snapshot — tanlangan sanadan oldingi ma'lumot" : undefined}
                          >
                            {r.day}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {r.asOf ? formatDateTimeUZ(r.asOf) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Sahifalash + info */}
              <div className="flex flex-col items-center gap-2 border-t border-border/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, report.total)} / jami {report.total.toLocaleString("uz-UZ")} SKU · {totalPages} sahifa
                </p>
                <BazaPagination page={page} totalPages={totalPages} basePath="/baza/qoldiq" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
