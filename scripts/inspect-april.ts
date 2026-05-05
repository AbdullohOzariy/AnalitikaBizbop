import { prisma } from "@/lib/prisma";

async function main() {
  const branches = await prisma.branch.findMany({ orderBy: { sortOrder: "asc" } });
  console.log("\n=== Filiallar ===");
  for (const b of branches) console.log(`  id=${b.id}  name="${b.name}"  sortOrder=${b.sortOrder}`);

  const start = new Date("2026-04-01T00:00:00.000Z");
  const end   = new Date("2026-04-30T00:00:00.000Z");

  const rows = await prisma.$queryRaw<{ branchId: number; sales: number; cost: number; rows: number }[]>`
    SELECT "branchId",
           COALESCE(SUM(amount),0)::float AS sales,
           COALESCE(SUM("costAmount"),0)::float AS cost,
           COUNT(*)::int AS rows
    FROM "CategorySales"
    WHERE "periodStart" >= ${start} AND "periodEnd" <= ${end}
    GROUP BY "branchId"
    ORDER BY "branchId"
  `;
  console.log("\n=== Aprel 2026 (CategorySales jami) ===");
  for (const r of rows) {
    const b = branches.find((x) => x.id === r.branchId);
    console.log(`  ${b?.name ?? "?"}: sales=${r.sales.toLocaleString()}  cost=${r.cost.toLocaleString()}  (${r.rows} yozuv)`);
  }

  const distinctRanges = await prisma.$queryRaw<{ periodStart: Date; periodEnd: Date; rows: number }[]>`
    SELECT "periodStart", "periodEnd", COUNT(*)::int AS rows
    FROM "CategorySales"
    WHERE "periodStart" >= ${start} AND "periodEnd" <= ${end}
    GROUP BY "periodStart", "periodEnd"
    ORDER BY "periodStart"
  `;
  console.log("\n=== Aprel davrlari (period ranges) ===");
  for (const r of distinctRanges) {
    console.log(`  ${r.periodStart.toISOString().slice(0,10)} → ${r.periodEnd.toISOString().slice(0,10)}  (${r.rows} yozuv)`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
