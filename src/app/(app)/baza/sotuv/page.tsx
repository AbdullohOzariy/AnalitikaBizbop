import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getDefaultRange } from "@/lib/analytics";
import type { FilterGroup } from "../category-tree-filter";
import { Database, ShoppingBag, Layers, TrendingUp, Boxes, Download, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { BazaFilter } from "../baza-filter";
import { BazaPagination } from "../baza-pagination";

const PAGE_SIZE = 50;

// Kategoriya iyerarxiyasi (filtr daraxti) — kam o'zgaradi, keshlaymiz ("iyerarxiya" tegi).
const getCategoryTree = unstable_cache(
  async (): Promise<FilterGroup[]> => {
    const groups = await prisma.categoryGroup.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, name: true,
        categories: {
          where: { parentId: null },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, children: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } },
        },
      },
    });
    return groups.map((g) => ({
      id: g.id, name: g.name,
      cats: g.categories.map((c) => ({ id: c.id, name: c.name, subs: c.children.map((s) => ({ id: s.id, name: s.name })) })),
    }));
  },
  ["sotuv-category-tree"],
  { tags: ["iyerarxiya"], revalidate: 300 }
);

// Saralanadigan ustunlar → SQL ifoda (raw ORDER BY uchun; barchasi fiksirlangan — xavfsiz)
const MARJA_SQL = `(CASE WHEN ps."costAmount" IS NOT NULL AND ps."amount" > 0 THEN (ps."amount" - ps."costAmount") / ps."amount" * 100 ELSE NULL END)`;
const SORT_SQL: Record<string, string> = {
  code: 'p."code"',
  name: 'p."name"',
  period: 'ps."periodStart"',
  stockQty: 'ps."stockQty"',
  soldQty: 'ps."soldQty"',
  amount: 'ps."amount"',
  costAmount: 'ps."costAmount"',
  marja: MARJA_SQL,
};

type SalesRow = {
  id: number; pcode: number; pname: string; cname: string | null; bname: string;
  periodStart: string; periodEnd: string;
  stockQty: string | null; soldQty: string | null; amount: string; costAmount: string | null;
};

/** Saralash uchun ustun sarlavhasi — joriy filtrlarni saqlab, yo'nalishni almashtiradi. */
function SortHead({ col, label, sp, sort, dir, align }: {
  col: string; label: string; sp: Record<string, string | undefined>;
  sort: string; dir: "asc" | "desc"; align?: "right";
}) {
  const active = sort === col;
  const nextDir = active && dir === "desc" ? "asc" : "desc";
  const p = new URLSearchParams();
  for (const k of ["start", "end", "branchId", "cats", "q", "mmin", "mmax"]) { const v = sp[k]; if (v) p.set(k, v); }
  p.set("sort", col); p.set("dir", nextDir);
  const Icon = active ? (dir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <Link href={`/baza/sotuv?${p.toString()}`} scroll={false}
      className={cn("inline-flex items-center gap-1 hover:text-foreground", align === "right" && "w-full justify-end")}>
      {label}
      <Icon className={cn("h-3 w-3", active ? "text-foreground" : "text-muted-foreground/40")} />
    </Link>
  );
}

function parseDate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? undefined : d;
}

function fmtAmount(n: unknown): string {
  const num = typeof n === "object" && n !== null && "toNumber" in n
    ? (n as { toNumber(): number }).toNumber()
    : Number(n);
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("uz-UZ").format(Math.round(num));
}

function fmtQty(n: unknown): string {
  const num = typeof n === "object" && n !== null && "toNumber" in n
    ? (n as { toNumber(): number }).toNumber()
    : Number(n);
  if (isNaN(num) || num === 0) return "—";
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 2 }).format(num);
}

export default async function BazaSotuvPage({
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
  const catIds = sp.cats ? sp.cats.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  const q = sp.q?.trim() ?? "";
  const mmin = sp.mmin != null && sp.mmin !== "" && !isNaN(Number(sp.mmin)) ? Number(sp.mmin) : undefined;
  const mmax = sp.mmax != null && sp.mmax !== "" && !isNaN(Number(sp.mmax)) ? Number(sp.mmax) : undefined;

  const startStr = sp.start ?? startDate.toISOString().slice(0, 10);
  const endStr = sp.end ?? endDate.toISOString().slice(0, 10);

  // Saralash
  const sort = sp.sort && SORT_SQL[sp.sort] ? sp.sort : "";
  const dirSql = sp.dir === "asc" ? "ASC" : "DESC";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const orderRaw = sort
    ? Prisma.raw(`${SORT_SQL[sort]} ${dirSql} NULLS LAST`)
    : Prisma.raw(`ps."periodStart" DESC, ps."amount" DESC`);

  // Filtr (raw — marja hisoblangan ustun bo'lgani uchun WHERE'da SQL ifoda kerak)
  const conds: Prisma.Sql[] = [
    Prisma.sql`ps."periodStart" >= ${startStr}::date`,
    Prisma.sql`ps."periodEnd" <= ${endStr}::date`,
  ];
  if (branchId) conds.push(Prisma.sql`ps."branchId" = ${branchId}`);
  if (catIds.length > 0) conds.push(Prisma.sql`p."categoryId" IN (${Prisma.join(catIds)})`);
  if (q) conds.push(Prisma.sql`(p."name" ILIKE ${"%" + q + "%"} OR p."code"::text = ${q})`);
  if (mmin != null) conds.push(Prisma.sql`${Prisma.raw(MARJA_SQL)} >= ${mmin}`);
  if (mmax != null) conds.push(Prisma.sql`${Prisma.raw(MARJA_SQL)} <= ${mmax}`);
  const baseFrom = Prisma.sql`
    FROM "ProductSales" ps
    JOIN "Product" p ON p.id = ps."productId"
    JOIN "Branch" b ON b.id = ps."branchId"
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    WHERE ${Prisma.join(conds, " AND ")}`;

  const [rows, countRes, aggRes, branches, catGroups] = await Promise.all([
    prisma.$queryRaw<SalesRow[]>(Prisma.sql`
      SELECT ps.id, p."code" AS pcode, p."name" AS pname, c."name" AS cname, b."name" AS bname,
             ps."periodStart"::text AS "periodStart", ps."periodEnd"::text AS "periodEnd",
             ps."stockQty", ps."soldQty", ps."amount", ps."costAmount"
      ${baseFrom}
      ORDER BY ${orderRaw}
      LIMIT ${PAGE_SIZE} OFFSET ${skip}`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS n ${baseFrom}`),
    prisma.$queryRaw<{ amount: number; cost: number; sold: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(ps."amount"),0)::float8 AS amount,
             COALESCE(SUM(ps."costAmount"),0)::float8 AS cost,
             COALESCE(SUM(ps."soldQty"),0)::float8 AS sold
      ${baseFrom}`),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    getCategoryTree(),
  ]);

  const totalCount = countRes[0]?.n ?? 0;
  const totalAmount = aggRes[0]?.amount ?? 0;
  const totalCost = aggRes[0]?.cost ?? 0;
  const totalSold = aggRes[0]?.sold ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const margin = totalAmount > 0 ? ((totalAmount - totalCost) / totalAmount) * 100 : 0;

  const exportQs = (() => {
    const p = new URLSearchParams();
    for (const k of ["start", "end", "branchId", "cats", "q", "mmin", "mmax", "sort", "dir"]) { const v = sp[k]; if (v) p.set(k, v); }
    return p.toString();
  })();

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Database}
        title="Sotuv bazasi"
        description="Mahsulot darajasida barcha sotuv yozuvlari (SKU × filial × davr)"
      >
        <BazaFilter
          basePath="/baza/sotuv"
          branches={branches}
          categoryGroups={catGroups}
          defaultStart={startStr}
          defaultEnd={endStr}
          defaultBranchId={sp.branchId}
          defaultSearch={sp.q}
          defaultMarjaMin={sp.mmin}
          defaultMarjaMax={sp.mmax}
          showCategory
          showSearch
          showMargin
        />
      </PageHeader>

      {/* Statistika */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Jami qatorlar"
          value={totalCount.toLocaleString("uz-UZ")}
          icon={Layers}
          tone="blue"
          hint={`Sahifada: ${rows.length}`}
        />
        <StatCard
          label="Sotilgan (dona)"
          value={fmtQty(totalSold)}
          icon={Boxes}
          tone="default"
        />
        <StatCard
          label="Savdo summasi"
          value={`${fmtAmount(totalAmount)} so'm`}
          icon={ShoppingBag}
          tone="green"
        />
        <StatCard
          label="Tannarx"
          value={`${fmtAmount(totalCost)} so'm`}
          icon={Database}
          tone="orange"
        />
        <StatCard
          label="Marja"
          value={totalAmount > 0 ? `${margin.toFixed(1)}%` : "—"}
          icon={TrendingUp}
          tone={margin >= 15 ? "green" : margin > 0 ? "orange" : "default"}
        />
      </div>

      {/* Eksport */}
      <div className="flex justify-end">
        <a href={`/api/baza/sotuv/export?${exportQs}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary">
          <Download className="h-4 w-4" /> Excel eksport
        </a>
      </div>

      {/* Jadval */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={Database}
              title="Tanlangan davrda ma'lumot yo'q"
              description="Boshqa davr tanlang yoki Fayllar bo'limidan sotuv faylini yuklang."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[90px]"><SortHead col="code" label="Kod" sp={sp} sort={sort} dir={dir} /></TableHead>
                      <TableHead><SortHead col="name" label="Mahsulot" sp={sp} sort={sort} dir={dir} /></TableHead>
                      <TableHead>Kategoriya</TableHead>
                      <TableHead>Filial</TableHead>
                      <TableHead className="w-[100px]"><SortHead col="period" label="Davr" sp={sp} sort={sort} dir={dir} /></TableHead>
                      <TableHead className="text-right w-[90px]"><SortHead col="stockQty" label="Qoldiq" sp={sp} sort={sort} dir={dir} align="right" /></TableHead>
                      <TableHead className="text-right w-[90px]"><SortHead col="soldQty" label="Sotilgan" sp={sp} sort={sort} dir={dir} align="right" /></TableHead>
                      <TableHead className="text-right w-[130px]"><SortHead col="amount" label="Savdo" sp={sp} sort={sort} dir={dir} align="right" /></TableHead>
                      <TableHead className="text-right w-[140px]"><SortHead col="costAmount" label="Tannarx" sp={sp} sort={sort} dir={dir} align="right" /></TableHead>
                      <TableHead className="text-right w-[80px]"><SortHead col="marja" label="Marja%" sp={sp} sort={sort} dir={dir} align="right" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const amt = Number(r.amount);
                      const cost = r.costAmount != null ? Number(r.costAmount) : null;
                      const sold = r.soldQty != null ? Number(r.soldQty) : 0;
                      const mj = cost !== null && amt > 0 ? ((amt - cost) / amt * 100) : null;
                      const unitPrice = sold > 0 ? amt / sold : null; // bir dona narxi
                      const unitCost = cost !== null && sold > 0 ? cost / sold : null; // bir dona tannarxi
                      const mjColor =
                        mj === null ? "text-muted-foreground" :
                        mj >= 15 ? "text-primary font-medium" :
                        mj > 0 ? "text-amber-600 dark:text-amber-400" :
                        "text-destructive";
                      const isOos = r.stockQty != null && Number(r.stockQty) <= 0;
                      return (
                        <TableRow key={r.id} className={cn("text-sm", isOos && "bg-destructive/5")}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{r.pcode}</TableCell>
                          <TableCell className="max-w-[200px]">
                            <span className="line-clamp-2 leading-snug">{r.pname}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.cname ?? "—"}</TableCell>
                          <TableCell className="text-xs">{r.bname}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {r.periodStart}
                            {r.periodStart !== r.periodEnd && <> → {r.periodEnd}</>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{fmtQty(r.stockQty)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{fmtQty(r.soldQty)}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs font-medium">
                            {fmtAmount(r.amount)}
                            {unitPrice != null && <div className="text-[10px] font-normal text-muted-foreground">({fmtAmount(unitPrice)}/dona)</div>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                            {cost !== null ? fmtAmount(cost) : "—"}
                            {unitCost != null && <div className="text-[10px] text-muted-foreground/80">({fmtAmount(unitCost)}/dona)</div>}
                          </TableCell>
                          <TableCell className={`text-right align-top tabular-nums text-xs ${mjColor}`}>
                            {mj !== null ? `${mj.toFixed(1)}%` : "—"}
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
                  {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} / jami {totalCount.toLocaleString("uz-UZ")} qator · {totalPages} sahifa
                </p>
                <BazaPagination page={page} totalPages={totalPages} basePath="/baza/sotuv" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
