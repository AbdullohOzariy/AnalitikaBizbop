import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseSalesWorkbook } from "../src/lib/parsers/sales";
import { parseMetricsWorkbook } from "../src/lib/parsers/metrics";
import { parseVisitsWorkbook } from "../src/lib/parsers/visits";

const CATEGORIES = [
  "BAKALEYA",
  "CHISTYASHIE SREDSTVI",
  "DETSKIY",
  "IGRUSHKI",
  "KASSA",
  "KOFE I CHAY",
  "KOLBASNIY",
  "KONFETI I SHOKOLAD",
  "KONSTOVARI",
  "MOLOCHKA",
  "MYASNOY",
  "OVOSHI I FRUKTI",
  "PARFUMERIYA",
  "SNEKI",
  "SOKI I NAPITKI",
  "SUXIE FRUKTI",
  "XLEB I KONDITERSKIY",
  "XOZ TOVARI",
];

function fmt(n: number) {
  return n.toLocaleString("uz-UZ", { maximumFractionDigits: 2 });
}

console.log("=== SALES: 29.04.xlsx (1 kun, 1 filial) ===");
{
  const buf = readFileSync("samples/29.04.xlsx");
  const r = parseSalesWorkbook(buf, CATEGORIES);
  console.log(`Period: ${r.periodStart.toISOString().slice(0, 10)} → ${r.periodEnd.toISOString().slice(0, 10)}`);
  console.log(`Qatorlar: ${r.rows.length}`);
  console.log(`Skipped (folder): ${r.skippedCategories.length}`, r.skippedCategories);
  console.log("Birinchi 5 qator:");
  for (const row of r.rows.slice(0, 5)) {
    console.log(`  ${row.branchAlias} | ${row.categoryName.padEnd(25)} | ${fmt(row.amount)}`);
  }
  const total = r.rows.reduce((s, x) => s + x.amount, 0);
  console.log(`JAMI: ${fmt(total)}`);
}

console.log("\n=== SALES: 1 (2).xlsx (29 kun, 4 filial) ===");
{
  const buf = readFileSync("samples/1 (2).xlsx");
  const r = parseSalesWorkbook(buf, CATEGORIES);
  console.log(`Period: ${r.periodStart.toISOString().slice(0, 10)} → ${r.periodEnd.toISOString().slice(0, 10)}`);
  console.log(`Qatorlar: ${r.rows.length}`);
  console.log(`Skipped (folder): ${r.skippedCategories.length}`);
  // Filial bo'yicha jami
  const byBranch = new Map<string, number>();
  for (const row of r.rows) {
    byBranch.set(row.branchAlias, (byBranch.get(row.branchAlias) ?? 0) + row.amount);
  }
  console.log("Filial bo'yicha jami:");
  for (const [alias, total] of byBranch) {
    console.log(`  ${alias.padEnd(35)} → ${fmt(total)}`);
  }
}

console.log("\n=== METRICS: sr.xlsx ===");
{
  const buf = readFileSync("samples/sr.xlsx");
  const r = parseMetricsWorkbook(buf);
  console.log(`Period: ${r.periodStart.toISOString().slice(0, 10)} → ${r.periodEnd.toISOString().slice(0, 10)}`);
  console.log(`Kunlar soni: ${r.metrics.length}`);
  const m0 = r.metrics[0];
  console.log(`Birinchi kun (${m0.date.toISOString().slice(0, 10)}):`);
  console.log(`  Cheklar: ${m0.receiptCount}`);
  console.log(`  Cheklar summasi: ${fmt(m0.receiptTotal)}`);
  console.log(`  O'rtacha mahsulot: ${m0.avgItemsPerReceipt}`);
  console.log(`  O'rtacha chek: ${fmt(m0.avgReceipt)}`);
  console.log(`  Katta xarid: ${fmt(m0.bigPurchaseLevel)}`);
  console.log(`  Mayda xarid: ${fmt(m0.smallPurchaseLevel)}`);
}

console.log("\n=== VISITS: export (1).xlsx (yil = 2026) ===");
{
  const buf = readFileSync("samples/export (1).xlsx");
  const r = parseVisitsWorkbook(buf, 2026);
  console.log(`Qatorlar: ${r.rows.length}`);
  // Filial bo'yicha jami
  const byBranch = new Map<string, number>();
  for (const row of r.rows) {
    byBranch.set(row.branchAlias, (byBranch.get(row.branchAlias) ?? 0) + row.count);
  }
  console.log("Filial bo'yicha jami:");
  for (const [alias, total] of byBranch) {
    console.log(`  ${alias.padEnd(20)} → ${fmt(total)}`);
  }
}

console.log("\n✓ All parsers OK");
