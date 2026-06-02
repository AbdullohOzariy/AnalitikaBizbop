import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CalendarDays, Target, Layers, Building2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BazaFilter } from "../baza-filter";
import { BazaPagination } from "../baza-pagination";

const PAGE_SIZE = 50;

function fmtAmount(n: unknown): string {
  const num = typeof n === "object" && n !== null && "toNumber" in n
    ? (n as { toNumber(): number }).toNumber()
    : Number(n);
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("uz-UZ").format(Math.round(num));
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const MONTH_NAMES = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

export default async function BazaRejaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "CAT_MANAGER") redirect("/dashboard");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const rejaType = sp.type === "monthly" ? "monthly" : "daily"; // default: daily
  const branchId = sp.branchId ? parseInt(sp.branchId) : undefined;
  const categoryId = sp.categoryId ? parseInt(sp.categoryId) : undefined;

  const [branches, categories] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  let totalCount = 0;
  let totalPages = 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = [];
  let totalPlan = 0;

  if (rejaType === "monthly") {
    // Oylik reja
    const year = sp.year ? parseInt(sp.year) : undefined;
    const month = sp.month ? parseInt(sp.month) : undefined;

    const where = {
      ...(branchId && { branchId }),
      ...(categoryId && { categoryId }),
      ...(year && { year }),
      ...(month && { month }),
    };

    const [cnt, data, agg] = await Promise.all([
      prisma.monthlyPlan.count({ where }),
      prisma.monthlyPlan.findMany({
        where,
        skip,
        take: PAGE_SIZE,
        orderBy: [{ year: "desc" }, { month: "desc" }, { branchId: "asc" }],
        include: {
          branch: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
        },
      }),
      prisma.monthlyPlan.aggregate({ where, _sum: { planAmount: true }, _count: true }),
    ]);

    totalCount = cnt;
    totalPages = Math.ceil(cnt / PAGE_SIZE);
    rows = data;
    totalPlan = agg._sum.planAmount ? Number(agg._sum.planAmount) : 0;
  } else {
    // Kunlik reja
    const startDate = sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start)
      ? new Date(sp.start + "T00:00:00.000Z") : undefined;
    const endDate = sp.end && /^\d{4}-\d{2}-\d{2}$/.test(sp.end)
      ? new Date(sp.end + "T00:00:00.000Z") : undefined;

    const where = {
      ...(startDate && { date: { gte: startDate } }),
      ...(endDate && { date: { lte: endDate } }),
      ...(branchId && { branchId }),
      ...(categoryId && { categoryId }),
    };

    const [cnt, data, agg] = await Promise.all([
      prisma.dailyPlan.count({ where }),
      prisma.dailyPlan.findMany({
        where,
        skip,
        take: PAGE_SIZE,
        orderBy: [{ date: "desc" }, { branchId: "asc" }],
        include: {
          branch: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
        },
      }),
      prisma.dailyPlan.aggregate({ where, _sum: { planAmount: true }, _count: true }),
    ]);

    totalCount = cnt;
    totalPages = Math.ceil(cnt / PAGE_SIZE);
    rows = data;
    totalPlan = agg._sum.planAmount ? Number(agg._sum.planAmount) : 0;
  }

  // Reja turi almashtirish URL saqlab turadi
  const basePathWithType = `/baza/reja?type=${rejaType}`;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={CalendarDays}
        title="Rejalar bazasi"
        description="Oylik va kunlik savdo rejalari — filial × kategoriya"
      >
        {/* Reja turi tanlash (client select — server action emas, link orqali) */}
        <RejaTypeSwitch current={rejaType} />
      </PageHeader>

      {/* Filtrlar */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <BazaFilter
          basePath={`/baza/reja?type=${rejaType}`}
          branches={branches}
          categories={categories}
          defaultStart={sp.start ?? ""}
          defaultEnd={sp.end ?? ""}
          defaultBranchId={sp.branchId}
          defaultCategoryId={sp.categoryId}
          showCategory
        />
      </div>

      {/* Statistika */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Jami yozuvlar"
          value={totalCount.toLocaleString("uz-UZ")}
          icon={Layers}
          tone="blue"
        />
        <StatCard
          label="Jami reja"
          value={`${fmtAmount(totalPlan)} so'm`}
          icon={Target}
          tone="green"
        />
        <StatCard
          label="Filiallar"
          value={branches.length}
          icon={Building2}
          tone="orange"
        />
      </div>

      {/* Jadval */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Hali ma'lumot yo'q"
              description="Fayllar bo'limidan reja faylini yuklang yoki Admin → Normal Reja bo'limidan kiriting."
            />
          ) : rejaType === "monthly" ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[70px]">Yil</TableHead>
                      <TableHead className="w-[90px]">Oy</TableHead>
                      <TableHead>Filial</TableHead>
                      <TableHead>Kategoriya</TableHead>
                      <TableHead className="text-right w-[150px]">Reja summasi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} className="text-sm">
                        <TableCell className="tabular-nums text-xs text-muted-foreground">{r.year}</TableCell>
                        <TableCell className="text-xs">{MONTH_NAMES[(r.month as number) - 1] ?? r.month}</TableCell>
                        <TableCell className="text-xs">{r.branch.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.category.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-medium text-primary">
                          {fmtAmount(r.planAmount)}
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
                <BazaPagination page={page} totalPages={totalPages} basePath={basePathWithType} />
              </div>
            </>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[110px]">Sana</TableHead>
                      <TableHead>Filial</TableHead>
                      <TableHead>Kategoriya</TableHead>
                      <TableHead className="text-right w-[150px]">Reja summasi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} className="text-sm">
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(r.date)}
                        </TableCell>
                        <TableCell className="text-xs">{r.branch.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.category.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-medium text-primary">
                          {fmtAmount(r.planAmount)}
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
                <BazaPagination page={page} totalPages={totalPages} basePath={basePathWithType} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Reja turini almashtiradigan oddiy link-tugmalar (server komponent)
function RejaTypeSwitch({ current }: { current: string }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-muted p-1">
      <a
        href="/baza/reja?type=daily"
        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
          current === "daily"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Kunlik
      </a>
      <a
        href="/baza/reja?type=monthly"
        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
          current === "monthly"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Oylik
      </a>
    </div>
  );
}
