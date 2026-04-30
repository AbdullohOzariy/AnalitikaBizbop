import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { FileType, AliasSource, UploadStatus } from "../src/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";
import { sha256 } from "../src/lib/parsers/utils";
import { parseSalesWorkbook } from "../src/lib/parsers/sales";
import { parseMetricsWorkbook } from "../src/lib/parsers/metrics";
import { parseVisitsWorkbook } from "../src/lib/parsers/visits";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("No admin user");

  // Tozalash (testni qayta-qayta ishlatish uchun)
  await prisma.categorySales.deleteMany();
  await prisma.dailyMetrics.deleteMany();
  await prisma.dailyVisits.deleteMany();
  await prisma.uploadedFile.deleteMany();

  const cats = await prisma.category.findMany();
  const catMap = new Map(cats.map((c) => [c.name, c.id]));

  // === SALES (period file: 1 (2).xlsx) ===
  console.log("\n→ Uploading SALES (1 (2).xlsx) ...");
  {
    const buf = readFileSync("samples/1 (2).xlsx");
    const hash = sha256(buf);
    const r = parseSalesWorkbook(buf, [...catMap.keys()]);
    const aliases = [...new Set(r.rows.map((x) => x.branchAlias))];
    const aliasMap = new Map<string, number>();
    for (const a of aliases) {
      const al = await prisma.branchAlias.findUnique({
        where: { alias_source: { alias: a, source: AliasSource.SALES } },
      });
      if (!al) throw new Error(`Alias not found: ${a}`);
      aliasMap.set(a, al.branchId);
    }

    await prisma.$transaction(async (tx) => {
      const created = await tx.uploadedFile.create({
        data: {
          label: "Aprel — barcha filiallar",
          originalName: "1 (2).xlsx",
          fileHash: hash,
          fileType: FileType.SALES,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          rowCount: r.rows.length,
          status: UploadStatus.SUCCESS,
          uploadedById: admin.id,
        },
      });
      for (const row of r.rows) {
        await tx.categorySales.create({
          data: {
            uploadedFileId: created.id,
            branchId: aliasMap.get(row.branchAlias)!,
            categoryId: catMap.get(row.categoryName)!,
            periodStart: r.periodStart,
            periodEnd: r.periodEnd,
            amount: new Prisma.Decimal(row.amount),
          },
        });
      }
    });
  }

  // === SALES (single day: 29.04.xlsx) ===
  console.log("→ Uploading SALES (29.04.xlsx) ...");
  {
    const buf = readFileSync("samples/29.04.xlsx");
    const hash = sha256(buf);
    const r = parseSalesWorkbook(buf, [...catMap.keys()]);
    const aliases = [...new Set(r.rows.map((x) => x.branchAlias))];
    const aliasMap = new Map<string, number>();
    for (const a of aliases) {
      const al = await prisma.branchAlias.findUnique({
        where: { alias_source: { alias: a, source: AliasSource.SALES } },
      });
      aliasMap.set(a, al!.branchId);
    }
    await prisma.$transaction(async (tx) => {
      const created = await tx.uploadedFile.create({
        data: {
          label: "29.04 — Mega kunlik",
          originalName: "29.04.xlsx",
          fileHash: hash,
          fileType: FileType.SALES,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          rowCount: r.rows.length,
          status: UploadStatus.SUCCESS,
          uploadedById: admin.id,
        },
      });
      for (const row of r.rows) {
        await tx.categorySales.create({
          data: {
            uploadedFileId: created.id,
            branchId: aliasMap.get(row.branchAlias)!,
            categoryId: catMap.get(row.categoryName)!,
            periodStart: r.periodStart,
            periodEnd: r.periodEnd,
            amount: new Prisma.Decimal(row.amount),
          },
        });
      }
    });
  }

  // === METRICS ===
  console.log("→ Uploading METRICS (sr.xlsx, branch=Mega Center) ...");
  {
    const buf = readFileSync("samples/sr.xlsx");
    const hash = sha256(buf);
    const branch = await prisma.branch.findUnique({ where: { name: "Mega Center" } });
    const r = parseMetricsWorkbook(buf);
    await prisma.$transaction(async (tx) => {
      const created = await tx.uploadedFile.create({
        data: {
          label: "Aprel — Mega chek",
          originalName: "sr.xlsx",
          fileHash: hash,
          fileType: FileType.METRICS,
          branchId: branch!.id,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          rowCount: r.metrics.length,
          status: UploadStatus.SUCCESS,
          uploadedById: admin.id,
        },
      });
      for (const m of r.metrics) {
        await tx.dailyMetrics.create({
          data: {
            uploadedFileId: created.id,
            branchId: branch!.id,
            date: m.date,
            receiptCount: m.receiptCount,
            receiptTotal: new Prisma.Decimal(m.receiptTotal),
            avgItemsPerReceipt: new Prisma.Decimal(m.avgItemsPerReceipt),
            avgReceipt: new Prisma.Decimal(m.avgReceipt),
            bigPurchaseLevel: new Prisma.Decimal(m.bigPurchaseLevel),
            smallPurchaseLevel: new Prisma.Decimal(m.smallPurchaseLevel),
          },
        });
      }
    });
  }

  // === VISITS ===
  console.log("→ Uploading VISITS (export (1).xlsx, year=2026) ...");
  {
    const buf = readFileSync("samples/export (1).xlsx");
    const hash = sha256(buf);
    const r = parseVisitsWorkbook(buf, 2026);
    const aliases = [...new Set(r.rows.map((x) => x.branchAlias))];
    const aliasMap = new Map<string, number>();
    for (const a of aliases) {
      const al = await prisma.branchAlias.findUnique({
        where: { alias_source: { alias: a, source: AliasSource.VISITS } },
      });
      aliasMap.set(a, al!.branchId);
    }
    const dates = r.rows.map((x) => x.date.getTime());
    await prisma.$transaction(async (tx) => {
      const created = await tx.uploadedFile.create({
        data: {
          label: "Aprel — tashriflar",
          originalName: "export (1).xlsx",
          fileHash: hash,
          fileType: FileType.VISITS,
          periodStart: new Date(Math.min(...dates)),
          periodEnd: new Date(Math.max(...dates)),
          yearOverride: 2026,
          rowCount: r.rows.length,
          status: UploadStatus.SUCCESS,
          uploadedById: admin.id,
        },
      });
      for (const row of r.rows) {
        await tx.dailyVisits.create({
          data: {
            uploadedFileId: created.id,
            branchId: aliasMap.get(row.branchAlias)!,
            date: row.date,
            visitCount: row.count,
          },
        });
      }
    });
  }

  // === VERIFY ===
  console.log("\n=== Verification ===");
  console.log("Files:", await prisma.uploadedFile.count());
  console.log("CategorySales:", await prisma.categorySales.count());
  console.log("DailyMetrics:", await prisma.dailyMetrics.count());
  console.log("DailyVisits:", await prisma.dailyVisits.count());

  const branchTotals = await prisma.$queryRaw<{ name: string; total: number }[]>`
    SELECT b.name, COALESCE(SUM(cs.amount), 0)::float8 AS total
    FROM "Branch" b
    LEFT JOIN "CategorySales" cs ON cs."branchId" = b.id
      AND cs."periodStart" = '2026-04-01' AND cs."periodEnd" = '2026-04-29'
    GROUP BY b.name ORDER BY b.name;
  `;
  console.log("\nFilial bo'yicha aprel sotuvi:");
  for (const r of branchTotals) {
    console.log(`  ${r.name.padEnd(15)} → ${Number(r.total).toLocaleString("uz-UZ")}`);
  }

  console.log("\n✓ Upload flow OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
