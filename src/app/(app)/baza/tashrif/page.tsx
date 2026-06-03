import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultRange } from "@/lib/analytics";
import { Footprints, Users, Layers, TrendingUp } from "lucide-react";
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
import { BazaFilter } from "../baza-filter";
import { BazaPagination } from "../baza-pagination";

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
  const role = session.user.role;
  if (role !== "ADMIN") redirect("/dashboard-v2");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const def = await getDefaultRange();
  const startDate = parseDate(sp.start) ?? def.start;
  const endDate = parseDate(sp.end) ?? def.end;
  const branchId = sp.branchId ? parseInt(sp.branchId) : undefined;

  // Faqat belgilangan period (period berilmasa — standart davr)
  const where = {
    date: { gte: startDate, lte: endDate },
    ...(branchId && { branchId }),
  };

  const [totalCount, rows, branches, agg] = await Promise.all([
    prisma.dailyVisits.count({ where }),
    prisma.dailyVisits.findMany({
      where,
      skip,
      take: PAGE_SIZE,
      orderBy: [{ date: "desc" }, { branchId: "asc" }],
      include: { branch: { select: { id: true, name: true } } },
    }),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.dailyVisits.aggregate({
      where,
      _sum: { visitCount: true },
      _avg: { visitCount: true },
      _count: true,
    }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const totalVisits = agg._sum.visitCount ?? 0;
  const avgVisits = agg._avg.visitCount ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Footprints}
        title="Tashriflar bazasi"
        description="Kunlik tashrif ma'lumotlari — filial × sana (export fayllaridan)"
      >
        <BazaFilter
          basePath="/baza/tashrif"
          branches={branches}
          defaultStart={sp.start ?? fmtDate(def.start)}
          defaultEnd={sp.end ?? fmtDate(def.end)}
          defaultBranchId={sp.branchId}
        />
      </PageHeader>

      {/* Statistika */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Jami yozuvlar"
          value={totalCount.toLocaleString("uz-UZ")}
          icon={Layers}
          tone="blue"
        />
        <StatCard
          label="Jami tashriflar"
          value={totalVisits.toLocaleString("uz-UZ")}
          icon={Users}
          tone="green"
        />
        <StatCard
          label="O'rtacha kunlik"
          value={Math.round(avgVisits).toLocaleString("uz-UZ")}
          icon={TrendingUp}
          tone="orange"
          hint="Bir yozuv bo'yicha"
        />
      </div>

      {/* Jadval */}
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
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(r.date)}
                        </TableCell>
                        <TableCell className="text-sm">{r.branch.name}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-primary">
                          {r.visitCount.toLocaleString("uz-UZ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col items-center gap-2 border-t border-border/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} / jami {totalCount.toLocaleString("uz-UZ")} qator · {totalPages} sahifa
                </p>
                <BazaPagination page={page} totalPages={totalPages} basePath="/baza/tashrif" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
