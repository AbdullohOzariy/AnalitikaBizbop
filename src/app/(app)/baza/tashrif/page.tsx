import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminTier, isSystemAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getDefaultRange } from "@/lib/analytics";
import { Footprints, TrendingUp, Layers, Users } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BazaFilter } from "../baza-filter";
import { BazaPagination } from "../baza-pagination";
import { ReceiptMetricsEditor } from "./metrika-editor";
import { getMonthlySalesByBranch, type ReceiptMetricCell } from "./metrika-actions";

const PAGE_SIZE = 50;

function parseDate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? undefined : d;
}
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function BazaTashrifPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!isAdminTier(session.user.role)) redirect("/dashboard-v2");
  const canEdit = isSystemAdmin(session.user.role);

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const activeTab = sp.tab === "metrika" ? "metrika" : "tashrif";

  const def = await getDefaultRange();
  const startDate = parseDate(sp.start) ?? def.start;
  const endDate = parseDate(sp.end) ?? def.end;
  const branchId = sp.branchId ? parseInt(sp.branchId) : undefined;
  const where = { date: { gte: startDate, lte: endDate }, ...(branchId && { branchId }) };

  // Kunlik metrikalar — joriy oy (editor ichida o'zgartiriladi)
  const now = new Date();
  const mYear = now.getUTCFullYear();
  const mMonth = now.getUTCMonth() + 1;
  const mStart = new Date(Date.UTC(mYear, mMonth - 1, 1));
  const mEnd = new Date(Date.UTC(mYear, mMonth, 0));

  const [branches, totalCount, rows, agg, metricRows, initialSales] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.dailyVisits.count({ where }),
    prisma.dailyVisits.findMany({
      where, skip, take: PAGE_SIZE,
      orderBy: [{ date: "desc" }, { branchId: "asc" }],
      include: { branch: { select: { id: true, name: true } } },
    }),
    prisma.dailyVisits.aggregate({ where, _sum: { visitCount: true }, _avg: { visitCount: true }, _count: true }),
    prisma.dailyReceiptMetric.findMany({
      where: { date: { gte: mStart, lte: mEnd } },
      select: { branchId: true, date: true, receiptCount: true, itemsPerReceipt: true },
    }),
    getMonthlySalesByBranch(mYear, mMonth),
  ]);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const totalVisits = agg._sum.visitCount ?? 0;
  const avgVisits = agg._avg.visitCount ?? 0;

  const initialMetrics: Record<string, ReceiptMetricCell> = {};
  for (const r of metricRows) {
    initialMetrics[`${r.branchId}_${fmtDate(r.date)}`] = {
      receiptCount: r.receiptCount,
      itemsPerReceipt: Number(r.itemsPerReceipt),
    };
  }

  const filterProps = {
    basePath: "/baza/tashrif",
    branches,
    defaultStart: sp.start ?? fmtDate(def.start),
    defaultEnd: sp.end ?? fmtDate(def.end),
    defaultBranchId: sp.branchId,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Footprints}
        title="Tashriflar bazasi"
        description="Kunlik tashriflar va qo'lda kiritiladigan chek metrikalari"
      />

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="tashrif">Tashriflar</TabsTrigger>
          <TabsTrigger value="metrika">Kunlik metrikalar</TabsTrigger>
        </TabsList>

        {/* ── Tashriflar ── */}
        <TabsContent value="tashrif" className="space-y-4">
          <BazaFilter {...filterProps} />

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Jami yozuvlar" value={totalCount.toLocaleString("uz-UZ")} icon={Layers} tone="blue" />
            <StatCard label="Jami tashriflar" value={totalVisits.toLocaleString("uz-UZ")} icon={Users} tone="green" />
            <StatCard label="O'rtacha kunlik" value={Math.round(avgVisits).toLocaleString("uz-UZ")} icon={TrendingUp} tone="orange" hint="Bir yozuv bo'yicha" />
          </div>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <EmptyState
                  icon={Footprints}
                  title="Tanlangan davrda ma'lumot yo'q"
                  description="Boshqa davr tanlang yoki Fayllar bo'limidan tashriflar faylini yuklang."
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="w-[120px]">Sana</TableHead>
                          <TableHead>Filial</TableHead>
                          <TableHead className="text-right w-[120px]">Tashriflar soni</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow key={r.id} className="text-sm">
                            <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                            <TableCell className="text-sm">{r.branch.name}</TableCell>
                            <TableCell className="text-right tabular-nums font-semibold text-primary">{r.visitCount.toLocaleString("uz-UZ")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex flex-col items-center gap-2 border-t border-border/60 px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} / jami{" "}
                      {totalCount.toLocaleString("uz-UZ")} qator · {totalPages} sahifa
                    </p>
                    <BazaPagination page={page} totalPages={totalPages} basePath="/baza/tashrif" />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Kunlik metrikalar (qo'lda) ── */}
        <TabsContent value="metrika">
          <ReceiptMetricsEditor
            branches={branches}
            initialYear={mYear}
            initialMonth={mMonth}
            initialData={initialMetrics}
            initialSales={initialSales}
            canEdit={canEdit}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
