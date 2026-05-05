import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

type Target = { branchName: string; sales: number; cost: number };

const TARGETS: Target[] = [
  { branchName: "Mega Center", sales: 8_491_752_597.96, cost: 6_769_692_153.08 },
  { branchName: "Gold Mart",   sales: 3_668_477_428.38, cost: 2_814_744_516.03 },
  { branchName: "Oila SM",     sales: 2_634_739_440.30, cost: 2_019_492_464.64 },
  { branchName: "Smart City",  sales: 1_290_572_891.63, cost: 1_054_448_932.79 },
];

const APRIL_START = new Date("2026-04-01T00:00:00.000Z");
const APRIL_END   = new Date("2026-04-30T00:00:00.000Z");

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const branches = await prisma.branch.findMany();
  const byName = new Map(branches.map((b) => [b.name, b]));

  await prisma.$transaction(async (tx) => {
    for (const t of TARGETS) {
      const branch = byName.get(t.branchName);
      if (!branch) throw new Error(`Filial topilmadi: ${t.branchName}`);

      const rows = await tx.categorySales.findMany({
        where: {
          branchId: branch.id,
          periodStart: { gte: APRIL_START },
          periodEnd:   { lte: APRIL_END },
        },
        orderBy: { id: "asc" },
      });
      if (rows.length === 0) {
        console.warn(`  ${t.branchName}: aprel uchun yozuv yo'q — o'tkazib yuborildi`);
        continue;
      }

      const currentSales = rows.reduce((a, r) => a + Number(r.amount), 0);
      if (currentSales <= 0) {
        throw new Error(`${t.branchName}: joriy sotuv 0 — proporsional qayta taqsimlab bo'lmaydi`);
      }
      const salesScale = t.sales / currentSales;
      const costRatio  = t.cost  / t.sales;

      let salesRunning = 0;
      let costRunning  = 0;
      const updates = rows.map((r, i) => {
        const isLast = i === rows.length - 1;
        let newAmount: number;
        let newCost: number;
        if (isLast) {
          newAmount = round2(t.sales - salesRunning);
          newCost   = round2(t.cost  - costRunning);
        } else {
          newAmount = round2(Number(r.amount) * salesScale);
          newCost   = round2(newAmount * costRatio);
          salesRunning = round2(salesRunning + newAmount);
          costRunning  = round2(costRunning  + newCost);
        }
        return { id: r.id, newAmount, newCost };
      });

      for (const u of updates) {
        await tx.categorySales.update({
          where: { id: u.id },
          data: {
            amount:     new Prisma.Decimal(u.newAmount.toFixed(2)),
            costAmount: new Prisma.Decimal(u.newCost.toFixed(2)),
          },
        });
      }

      console.log(`  ${t.branchName}: ${rows.length} yozuv yangilandi  (sales=${t.sales.toLocaleString()}, cost=${t.cost.toLocaleString()})`);
    }
  });

  console.log("\n=== Tasdiqlash: yangi jami summalar ===");
  for (const t of TARGETS) {
    const b = byName.get(t.branchName)!;
    const r = await prisma.$queryRaw<{ s: number; c: number }[]>`
      SELECT COALESCE(SUM(amount),0)::float AS s,
             COALESCE(SUM("costAmount"),0)::float AS c
      FROM "CategorySales"
      WHERE "branchId" = ${b.id}
        AND "periodStart" >= ${APRIL_START} AND "periodEnd" <= ${APRIL_END}
    `;
    console.log(`  ${t.branchName}: sales=${r[0].s.toLocaleString()}  cost=${r[0].c.toLocaleString()}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
