import "dotenv/config";
import * as fs from "node:fs";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseSalesWorkbook } from "./src/lib/parsers/sales";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
(async () => {
  const cats = await prisma.category.findMany({ where: { code: { not: null } }, select: { code: true } });
  const codes = new Set<number>(cats.map((c) => c.code!));
  const buf = fs.readFileSync("ShablonSotuv.xlsx");
  const res = parseSalesWorkbook(buf, [], undefined, codes);
  if (res.version !== "v3") { console.log("version:", res.version); return; }
  const skus = new Set(res.productRows.map((p) => p.productCode));
  const noCat = res.productRows.filter((p) => p.parentCategoryCode == null).length;
  const byBranch: Record<string, number> = {};
  for (const p of res.productRows) byBranch[p.branchAlias] = (byBranch[p.branchAlias] ?? 0) + p.amount;
  console.log("RESULT_OK rows=" + res.productRows.length + " groups=" + res.categoryRowCount + " skus=" + skus.size + " noCat=" + noCat);
  console.log("branchSums=" + JSON.stringify(Object.fromEntries(Object.entries(byBranch).map(([k, v]) => [k, Math.round(v)]))));
})().catch((e) => { console.error("FAIL: " + e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
