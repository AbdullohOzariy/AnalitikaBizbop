import * as fs from "node:fs";
import { parseDailyPlansWorkbook } from "@/lib/parsers/daily-plans";
import { prisma } from "@/lib/prisma";

async function main() {
  const buf = fs.readFileSync("samples/aprel 2026 kunlik planlar.xlsx");
  const cats = await prisma.category.findMany({ select: { name: true } });
  const catNames = cats.map((c) => c.name);
  console.log("DB kategoriyalari:", catNames.length, "ta");

  const result = parseDailyPlansWorkbook(buf, catNames);
  console.log(`\nPeriod: ${result.periodStart.toISOString().slice(0,10)} → ${result.periodEnd.toISOString().slice(0,10)}`);
  console.log(`Jami qatorlar: ${result.rows.length}`);
  console.log(`O'tkazib yuborilgan kategoriyalar: ${result.skippedCategories.length}`);
  if (result.skippedCategories.length > 0) {
    console.log(" ", result.skippedCategories);
  }

  const byBranch = new Map<string, number>();
  const byBranchSum = new Map<string, number>();
  for (const r of result.rows) {
    byBranch.set(r.branchAlias, (byBranch.get(r.branchAlias) ?? 0) + 1);
    byBranchSum.set(r.branchAlias, (byBranchSum.get(r.branchAlias) ?? 0) + r.planAmount);
  }
  console.log("\nFilial bo'yicha:");
  for (const [b, n] of byBranch) {
    console.log(`  ${b}: ${n} qator, jami plan = ${byBranchSum.get(b)!.toLocaleString()}`);
  }

  console.log("\nDastlabki 3 qator:");
  for (const r of result.rows.slice(0, 3)) {
    console.log(`  ${r.branchAlias} | ${r.date.toISOString().slice(0,10)} | ${r.categoryAlias} | ${r.planAmount}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
