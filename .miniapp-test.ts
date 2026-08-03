import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { kassaYozuvYarat } from "./src/lib/moliya/yozuv";
import { moliyaUserByTelegramId } from "./src/lib/moliya/ruxsat";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const d = (s: string) => new Date(s + "T00:00:00.000Z");
const KUN = d("2026-08-04");

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "SYSTEM_ADMIN" }, select: { id: true, telegramId: true } });
  const mega = await prisma.cashAccount.findFirstOrThrow({ where: { name: "Мега маркет" } });
  const sales = await prisma.cashFlowArticle.findUniqueOrThrow({ where: { code: "OP_SALES_MEGA" } });   // IN_ONLY
  const wage  = await prisma.cashFlowArticle.findUniqueOrThrow({ where: { code: "OP_PAYROLL_WAGE" } }); // OUT_ONLY
  const ink   = await prisma.cashFlowArticle.findUniqueOrThrow({ where: { code: "TECH_INKASSA" } });    // transfer

  const baza = { businessDate: KUN, accountId: mega.id, direction: "OUT" as const, amount: 100_000, source: "MINIAPP" as const, createdById: admin.id };

  console.log("=== MINIAPP YO'LI — qoidalar web bilan bir xilmi ===");
  const r1 = await kassaYozuvYarat({ ...baza, articleId: sales.id });
  console.log("1) kirim moddasini CHIQIMga:", r1.ok ? "❌ o'tib ketdi" : "✅ " + r1.error);

  const r2 = await kassaYozuvYarat({ ...baza, articleId: ink.id });
  console.log("2) transfer moddasi oddiy yozuvda:", r2.ok ? "❌ o'tib ketdi" : "✅ " + r2.error.slice(0, 60));

  const r3 = await kassaYozuvYarat({ ...baza, articleId: wage.id, amount: 9_000_000 });
  console.log("3) 9 mln kontragentsiz:", r3.ok ? "❌ o'tib ketdi" : "✅ " + r3.error);

  const r4 = await kassaYozuvYarat({ ...baza, articleId: wage.id, amount: 250_000 });
  console.log("4) to'g'ri yozuv:", r4.ok ? "✅ yaratildi #" + r4.id : "❌ " + r4.error);

  // Kunni yopib, qayta urinamiz
  await prisma.cashDayClose.create({ data: { accountId: mega.id, onDate: KUN, expected: 0, counted: 0, diff: 0 } });
  const r5 = await kassaYozuvYarat({ ...baza, articleId: wage.id, amount: 50_000 });
  console.log("5) YOPILGAN kunga yozuv:", r5.ok ? "❌ o'tib ketdi" : "✅ " + r5.error);

  console.log("\n=== RUXSAT ===");
  const tg = admin.telegramId ? Number(admin.telegramId) : null;
  if (tg) {
    const u = await moliyaUserByTelegramId(tg);
    console.log("SYSTEM_ADMIN telegramId bilan:", u ? `✅ ${u.name}, hisoblar: ${u.accountIds.length || "cheklovsiz"}` : "❌ topilmadi");
  } else console.log("(adminda telegramId yo'q — tekshirilmadi)");
  console.log("noma'lum ID (999999):", (await moliyaUserByTelegramId(999999)) ? "❌ o'tdi" : "✅ rad etildi");

  // Tozalash
  await prisma.cashDayClose.deleteMany({ where: { onDate: KUN } });
  await prisma.cashTxn.deleteMany({ where: { businessDate: KUN } });
  console.log("\ntozalandi, test yozuvi:", await prisma.cashTxn.count({ where: { businessDate: KUN } }));
  await prisma.$disconnect();
}
main();
