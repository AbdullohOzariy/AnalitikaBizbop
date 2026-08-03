// Moliya ma'lumotnomasi seed'i — kassa/bank hisoblari, xarajat markazlari va
// DDS modda ierarxiyasi (bo'lim → guruh → modda).
//
// Manba: "Копия Касса-Асосий" Google Sheet, `info` varag'i (~68 modda + qisqa nom lug'ati).
// Batafsil tahlil va qarorlar: MOLIYA_PLAN.md
//
// Ishga tushirish:  npm run db:seed-moliya
// Idempotent — qayta ishga tushirsa mavjud yozuvlarni YANGILAYDI, dublikat yaratmaydi.
//
// ⚠️ TASNIF TAKLIF SIFATIDA BERILGAN. Moliyachi bilan birga ko'rib chiqilishi shart —
// ayniqsa `needsReview: true` bilan belgilangan moddalar.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  CashAccountKind,
  CashArticleDirection,
  CashFlowSection,
  CostCenterKind,
} from "../src/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const { OPERATING, INVESTING, FINANCING, TECHNICAL } = CashFlowSection;
const { IN_ONLY, OUT_ONLY, BOTH } = CashArticleDirection;

// ─── Xarajat markazlari ───────────────────────────────────────────────────────
// PROJECT = alohida biznes/loyiha: ularga ketgan xarajat alohida ko'rinishi shart
// (loyiha egasining qarori, MOLIYA_PLAN.md 13-band).

const COST_CENTERS: {
  name: string;
  kind: CostCenterKind;
  branchName?: string;
  sortOrder: number;
}[] = [
  { name: "Мега маркет", kind: CostCenterKind.BRANCH, branchName: "Mega Center", sortOrder: 1 },
  { name: "Голд маркет", kind: CostCenterKind.BRANCH, branchName: "Gold Mart", sortOrder: 2 },
  { name: "Оила маркет", kind: CostCenterKind.BRANCH, branchName: "Oila SM", sortOrder: 3 },
  { name: "Смарт", kind: CostCenterKind.BRANCH, branchName: "Smart City", sortOrder: 4 },
  // Quyidagilar Branch jadvalida YO'Q — savdo nuqtasi, lekin analitikaga kirmaydi
  // (loyiha egasi: "hozircha kerak emas"). branchId = null.
  { name: "Кафе Мега", kind: CostCenterKind.BRANCH, sortOrder: 5 },
  { name: "Оила кафе", kind: CostCenterKind.BRANCH, sortOrder: 6 },
  { name: "Эддо (DIETO кафе)", kind: CostCenterKind.BRANCH, sortOrder: 7 },
  { name: "Маззона", kind: CostCenterKind.BRANCH, sortOrder: 8 },
  { name: "O'yingoh 3-этаж", kind: CostCenterKind.BRANCH, sortOrder: 9 },
  { name: "O'yingoh 4-этаж", kind: CostCenterKind.BRANCH, sortOrder: 10 },
  // Alohida biznes / loyihalar
  { name: "Зарафшон Малл", kind: CostCenterKind.PROJECT, sortOrder: 20 },
  { name: "Навоий Малл", kind: CostCenterKind.PROJECT, sortOrder: 21 },
  { name: "Молхона", kind: CostCenterKind.PROJECT, sortOrder: 22 },
  { name: "Кассобхона", kind: CostCenterKind.PROJECT, sortOrder: 23 },
  { name: "Нонвойхона", kind: CostCenterKind.PROJECT, sortOrder: 24 },
  // Umumkorporativ
  { name: "Офис", kind: CostCenterKind.COMPANY, sortOrder: 30 },
];

// ─── Kassa / bank hisoblari ───────────────────────────────────────────────────
// Nomlar manbadagi kirillcha yozuvda (kanonik) — import moslashtirish uchun.

const ACCOUNTS: {
  name: string;
  kind: CashAccountKind;
  branchName?: string;
  costCenterName?: string;
  sortOrder: number;
  aliases?: string[];
}[] = [
  { name: "Мега маркет", kind: CashAccountKind.CASH, branchName: "Mega Center", costCenterName: "Мега маркет", sortOrder: 1 },
  { name: "Голд маркет", kind: CashAccountKind.CASH, branchName: "Gold Mart", costCenterName: "Голд маркет", sortOrder: 2 },
  { name: "Оила маркет", kind: CashAccountKind.CASH, branchName: "Oila SM", costCenterName: "Оила маркет", sortOrder: 3 },
  { name: "Смарт", kind: CashAccountKind.CASH, branchName: "Smart City", costCenterName: "Смарт", sortOrder: 4, aliases: ["SMART", "Смарт Учкудук"] },
  { name: "Кафе Мега", kind: CashAccountKind.CASH, costCenterName: "Кафе Мега", sortOrder: 5 },
  { name: "Оила кафе", kind: CashAccountKind.CASH, costCenterName: "Оила кафе", sortOrder: 6 },
  { name: "Эддо", kind: CashAccountKind.CASH, costCenterName: "Эддо (DIETO кафе)", sortOrder: 7 },
  { name: "Маззона", kind: CashAccountKind.CASH, costCenterName: "Маззона", sortOrder: 8 },
  { name: "3-этаж", kind: CashAccountKind.CASH, costCenterName: "O'yingoh 3-этаж", sortOrder: 9 },
  { name: "4-этаж", kind: CashAccountKind.CASH, costCenterName: "O'yingoh 4-этаж", sortOrder: 10 },
  { name: "Офис", kind: CashAccountKind.CASH, costCenterName: "Офис", sortOrder: 11 },
  // ⚠️ Manbada YO'Q, biz qo'shamiz: inkassatsiya qarshi tomoni.
  // Loyiha egasi tasdiqladi — "Инкасса bank hisobiga ketadi".
  // Bank nomi aniqlanishi kerak (jurnalda izoh sifatida "Модерн" uchraydi).
  { name: "Bank hisobi", kind: CashAccountKind.BANK, costCenterName: "Офис", sortOrder: 40 },
  { name: "Plastik (ekvayring)", kind: CashAccountKind.CARD, costCenterName: "Офис", sortOrder: 41 },
];

// ─── Modda ierarxiyasi ────────────────────────────────────────────────────────

type ArticleSeed = {
  code: string;
  name: string; // manbadagi KANONIK nom — o'zgartirilmaydi
  direction?: CashArticleDirection;
  isNeutral?: boolean;
  isTransfer?: boolean;
  aliases?: string[];
  note?: string;
};

type GroupSeed = {
  code: string;
  name: string;
  section: CashFlowSection;
  sortOrder: number;
  articles: ArticleSeed[];
};

const GROUPS: GroupSeed[] = [
  // ══ OPERATSION — daromad ══
  {
    code: "OP_SALES",
    name: "Savdo tushumi",
    section: OPERATING,
    sortOrder: 1,
    articles: [
      { code: "OP_SALES_MEGA", name: "Савдо тушуми MEGA Market", direction: IN_ONLY, aliases: ["Савдо тушуми"] },
      { code: "OP_SALES_GOLD", name: "Савдо тушуми GOLD Market", direction: IN_ONLY },
      { code: "OP_SALES_OILA", name: "Савдо тушуми OILA Market", direction: IN_ONLY },
      { code: "OP_SALES_SMART", name: "Савдо тушуми SMART Market (Uchquduq)", direction: IN_ONLY },
      { code: "OP_SALES_MAZZONA", name: "Савдо тушуми MAZZONA", direction: IN_ONLY },
      { code: "OP_SALES_KAFE_MEGA", name: "Савдо тушуми MEGA KAFE", direction: IN_ONLY },
      { code: "OP_SALES_KAFE_OILA", name: "Савдо тушуми OILA KAFE", direction: IN_ONLY },
      { code: "OP_SALES_KAFE_SMART", name: "Савдо тушуми SMART KAFE", direction: IN_ONLY },
      { code: "OP_SALES_KAFE_EDDO", name: "Савдо тушуми DIETO (EDDO) KAFE", direction: IN_ONLY },
      { code: "OP_SALES_PLAY3", name: "Савдо тушуми MEGA O'yingoh 3", direction: IN_ONLY },
      { code: "OP_SALES_PLAY4", name: "Савдо тушуми MEGA O'yingoh 4", direction: IN_ONLY },
      { code: "OP_SALES_PLAY_SMART", name: "Савдо тушуми SMART O'yingoh", direction: IN_ONLY },
    ],
  },
  {
    code: "OP_OTHER_INCOME",
    name: "Boshqa operatsion daromad",
    section: OPERATING,
    sortOrder: 2,
    articles: [
      { code: "OP_INC_RENT", name: "Ижарачилардан тушум", direction: IN_ONLY },
      { code: "OP_INC_SECURITY", name: "Охрана савдо", direction: IN_ONLY },
      { code: "OP_INC_PAPER", name: "Макалатура", direction: IN_ONLY, aliases: ["Маклатура"] },
    ],
  },

  // ══ OPERATSION — xarajat ══
  {
    code: "OP_SUPPLIER",
    name: "Ta'minotchiga to'lov",
    section: OPERATING,
    sortOrder: 10,
    articles: [
      { code: "OP_SUPPLIER_PAY", name: "Таьминотчига тулов", direction: OUT_ONLY },
    ],
  },
  {
    code: "OP_PAYROLL",
    name: "Xodim xarajatlari",
    section: OPERATING,
    sortOrder: 11,
    articles: [
      {
        code: "OP_PAYROLL_WAGE",
        name: "Иш хаки харажатлари",
        direction: OUT_ONLY,
        aliases: ["Ойлик"],
        note: "DIQQAT: manbada bu moddaning 76% i hisobdor shaxsga (podotchyot) berilgan yirik summalar edi. Yangi tizimda ular ADVANCE moddasiga o'tishi kerak — aks holda qo'sh hisob.",
      },
      { code: "OP_PAYROLL_BONUS", name: "Мукофот ва бонуслар", direction: OUT_ONLY, aliases: ["Бонус"] },
      { code: "OP_PAYROLL_TAX", name: "Ижтимоий солик ва ажратмалар", direction: OUT_ONLY },
      { code: "OP_PAYROLL_UNIFORM", name: "Иш кийими (форма)", direction: OUT_ONLY },
      { code: "OP_PAYROLL_MEAL", name: "Ходимларни овкатланиш харажатлари", direction: OUT_ONLY },
      { code: "OP_PAYROLL_TRAIN", name: "Ходимларни ўкитиш ва тренинг харажатлари", direction: OUT_ONLY },
      { code: "OP_PAYROLL_TRIP", name: "Хизмат сафари харажатлари", direction: OUT_ONLY },
    ],
  },
  {
    code: "OP_RENT_UTIL",
    name: "Ijara va kommunal",
    section: OPERATING,
    sortOrder: 12,
    articles: [
      { code: "OP_RENT", name: "Ижара тўлови", direction: OUT_ONLY, aliases: ["Ижара"] },
      { code: "OP_UTIL_POWER", name: "Электр энергияси", direction: OUT_ONLY, aliases: ["Камунал"] },
      { code: "OP_UTIL_WATER", name: "Сув ва канализация", direction: OUT_ONLY },
      { code: "OP_UTIL_GAS", name: "Газ таъминоти", direction: OUT_ONLY },
      { code: "OP_UTIL_WASTE", name: "Чикиндиларни олиб чикиш хизмати", direction: OUT_ONLY },
    ],
  },
  {
    code: "OP_LOGISTICS",
    name: "Logistika va transport",
    section: OPERATING,
    sortOrder: 13,
    articles: [
      { code: "OP_LOG_FREIGHT", name: "Юк ташиш (транспорт харажатлари)", direction: OUT_ONLY, aliases: ["Логистика"] },
      { code: "OP_LOG_LOADING", name: "Юклаш-тушириш хизматлари", direction: OUT_ONLY },
      { code: "OP_LOG_FUEL", name: "Ёнилги харажатлари (Метан газ, пропан, бензин)", direction: OUT_ONLY, aliases: ["Салярка"] },
      { code: "OP_LOG_MAINT", name: "Транспорт техник хизмати", direction: OUT_ONLY },
      { code: "OP_LOG_TAXI", name: "Такси", direction: OUT_ONLY },
      { code: "OP_LOG_PARKING", name: "Стоянка ва арава", direction: OUT_ONLY },
    ],
  },
  {
    code: "OP_ADMIN",
    name: "Ma'muriy va ofis",
    section: OPERATING,
    sortOrder: 14,
    articles: [
      { code: "OP_ADM_PACKAGING", name: "Кадоклаш материаллари (пакет, коп ва х.к.)", direction: OUT_ONLY },
      { code: "OP_ADM_STATIONERY", name: "Канцелярия товарлари (когоз, ручка ва х.к.)", direction: OUT_ONLY },
      { code: "OP_ADM_TELECOM", name: "Интернет ва телефон харажатлари", direction: OUT_ONLY, aliases: ["Абонент туловлар", "Call Center"] },
      { code: "OP_ADM_BANK", name: "Банк хизматлари (комиссиялар)", direction: OUT_ONLY },
      { code: "OP_ADM_SOFTWARE", name: "Дастурий таъминот (1С, CRM, POS тизимлар)", direction: OUT_ONLY },
      { code: "OP_ADM_OFFICE", name: "Офис харажатлари", direction: OUT_ONLY },
      { code: "OP_ADM_OTHER", name: "Бошка харажатлар", direction: BOTH, note: "Chelak modda — muntazam ko'rib, aniq moddalarga ajratilsin." },
    ],
  },
  {
    code: "OP_MAINT",
    name: "Ta'mir va xo'jalik",
    section: OPERATING,
    sortOrder: 15,
    articles: [
      { code: "OP_MNT_REPAIR", name: "Ремонт", direction: OUT_ONLY },
      { code: "OP_MNT_HOUSE", name: "Хужалик харажатлари", direction: OUT_ONLY },
      { code: "OP_MNT_FRIDGE", name: "Совутгичлар таъмири", direction: OUT_ONLY },
      { code: "OP_MNT_POS", name: "Касса ва POS терминаллар хизматлари", direction: OUT_ONLY },
    ],
  },
  {
    code: "OP_MARKETING",
    name: "Marketing",
    section: OPERATING,
    sortOrder: 16,
    articles: [
      { code: "OP_MKT_GENERAL", name: "Маркетинг харажатлари", direction: OUT_ONLY, aliases: ["Маркетинг реклама"] },
      { code: "OP_MKT_SOCIAL", name: "Ижтимоий тармокларда реклама ёки азолик тўлови", direction: OUT_ONLY },
    ],
  },
  {
    code: "OP_PRODUCTION",
    name: "Ishlab chiqarish sexlari",
    section: OPERATING,
    sortOrder: 17,
    articles: [
      { code: "OP_PRD_FARM", name: "Молхона харажатлари", direction: OUT_ONLY, aliases: ["Молхона"] },
      { code: "OP_PRD_BUTCHER", name: "Кассобхона харажатлари", direction: OUT_ONLY },
      { code: "OP_PRD_BAKERY", name: "Нонвойхона харажатлари", direction: OUT_ONLY },
    ],
  },
  {
    code: "OP_OTHER",
    name: "Boshqa operatsion",
    section: OPERATING,
    sortOrder: 18,
    articles: [
      { code: "OP_OTH_FINE", name: "Жарималар ва пенялар", direction: OUT_ONLY },
      { code: "OP_OTH_CHARITY", name: "Хайрия", direction: OUT_ONLY },
    ],
  },

  // ══ INVESTITSION ══
  {
    code: "INV_PROJECT",
    name: "Loyiha va kapital qurilish",
    section: INVESTING,
    sortOrder: 30,
    articles: [
      { code: "INV_ZARAFSHON", name: "Зарафшон Малл курилиш хараражатлари", direction: OUT_ONLY, aliases: ["Курилиш Зарафшон"] },
      { code: "INV_NAVOIY", name: "Навоий Малл курилиш хараражатлари", direction: OUT_ONLY, aliases: ["Курилиш Навои"] },
      { code: "INV_LAND", name: "Аукцион ер хараражатлари", direction: OUT_ONLY },
    ],
  },

  // ══ MOLIYAVIY ══
  {
    code: "FIN_OWNER",
    name: "Egasi bilan hisob-kitob",
    section: FINANCING,
    sortOrder: 40,
    articles: [
      {
        code: "FIN_OWNER_IN",
        name: "Молиявий ёрдам",
        direction: BOTH,
        note: "Egadan kiritilgan pul. Namunada 5 kunda 280 mln — savdo tushumi bilan bir ustunda bo'lgani uchun tushum 25% ga shishardi.",
      },
      { code: "FIN_DIVIDEND", name: "Дивидент", direction: OUT_ONLY },
      { code: "FIN_CAPITAL", name: "Устав фондини шакллантириш учун", direction: OUT_ONLY },
    ],
  },
  {
    code: "FIN_DEBT",
    name: "Qarz va kredit",
    section: FINANCING,
    sortOrder: 41,
    articles: [
      { code: "FIN_LOAN", name: "Карз", direction: BOTH },
      { code: "FIN_CREDIT_PAY", name: "Кредит тўловлари", direction: OUT_ONLY },
    ],
  },

  // ══ TEXNIK (neytral) ══
  {
    code: "TECH_TRANSFER",
    name: "Ko'chirish va inkassatsiya",
    section: TECHNICAL,
    sortOrder: 50,
    articles: [
      {
        code: "TECH_INKASSA",
        name: "Инкасса",
        direction: BOTH,
        isNeutral: true,
        isTransfer: true,
        note: "Naqd → Bank hisobi. Namunada 5 kunda 609.5 mln, ya'ni jami chiqimning 42.5% i — xarajat EMAS.",
      },
      { code: "TECH_PEREBROS", name: "Переброс", direction: BOTH, isNeutral: true, isTransfer: true },
      { code: "TECH_OBMEN", name: "Обмен", direction: BOTH, isNeutral: true, isTransfer: true },
    ],
  },
  {
    code: "TECH_BALANCE",
    name: "Qoldiq, farq va tuzatish",
    section: TECHNICAL,
    sortOrder: 51,
    articles: [
      {
        code: "TECH_OPENING",
        name: "Остатка",
        direction: BOTH,
        isNeutral: true,
        note: "Davr boshi qoldig'i. Yangi tizimda CashTxn EMAS — CashAccountOpening'ga yoziladi.",
      },
      { code: "TECH_BALANCE_LEFT", name: "Касса колдик", direction: BOTH, isNeutral: true },
      { code: "TECH_DIFF", name: "Касса фарк", direction: BOTH, isNeutral: true },
      { code: "TECH_RESERVE", name: "Захира учун", direction: BOTH, isNeutral: true },
      {
        code: "TECH_RETURN",
        name: "Возврат",
        direction: BOTH,
        isNeutral: true,
        note: "⚠️ TEKSHIRILSIN: mijozga qaytarilgan pulmi (daromadni kamaytiradi) yoki berilgan pulning qaytishimi (neytral)? Hozircha neytral deb belgilandi.",
      },
    ],
  },
];

// ─── Ishga tushirish ──────────────────────────────────────────────────────────

async function main() {
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  const branchId = new Map(branches.map((b) => [b.name, b.id]));

  // 1) Xarajat markazlari
  const costCenterId = new Map<string, number>();
  for (const cc of COST_CENTERS) {
    const bid = cc.branchName ? branchId.get(cc.branchName) ?? null : null;
    if (cc.branchName && bid === null) {
      console.warn(`  ⚠️  Filial topilmadi: "${cc.branchName}" — "${cc.name}" bog'lanmasdan qoldi`);
    }
    const row = await prisma.costCenter.upsert({
      where: { name: cc.name },
      create: { name: cc.name, kind: cc.kind, branchId: bid, sortOrder: cc.sortOrder },
      update: { kind: cc.kind, branchId: bid, sortOrder: cc.sortOrder },
    });
    costCenterId.set(cc.name, row.id);
  }
  console.log(`✓ Xarajat markazlari: ${COST_CENTERS.length}`);

  // 2) Kassa / bank hisoblari
  for (const acc of ACCOUNTS) {
    const bid = acc.branchName ? branchId.get(acc.branchName) ?? null : null;
    const ccid = acc.costCenterName ? costCenterId.get(acc.costCenterName) ?? null : null;
    const row = await prisma.cashAccount.upsert({
      where: { name: acc.name },
      create: { name: acc.name, kind: acc.kind, branchId: bid, costCenterId: ccid, sortOrder: acc.sortOrder },
      update: { kind: acc.kind, branchId: bid, costCenterId: ccid, sortOrder: acc.sortOrder },
    });
    for (const alias of acc.aliases ?? []) {
      await prisma.cashAccountAlias.upsert({
        where: { alias },
        create: { alias, accountId: row.id },
        update: { accountId: row.id },
      });
    }
  }
  console.log(`✓ Hisoblar: ${ACCOUNTS.length} (naqd ${ACCOUNTS.filter((a) => a.kind === "CASH").length}, bank 1, plastik 1)`);

  // 3) Modda ierarxiyasi
  let articleCount = 0;
  let aliasCount = 0;
  for (const g of GROUPS) {
    const group = await prisma.cashFlowGroup.upsert({
      where: { code: g.code },
      create: { code: g.code, name: g.name, section: g.section, sortOrder: g.sortOrder },
      update: { name: g.name, section: g.section, sortOrder: g.sortOrder },
    });

    for (const [i, a] of g.articles.entries()) {
      const article = await prisma.cashFlowArticle.upsert({
        where: { code: a.code },
        create: {
          code: a.code,
          name: a.name,
          groupId: group.id,
          direction: a.direction ?? BOTH,
          isNeutral: a.isNeutral ?? false,
          isTransfer: a.isTransfer ?? false,
          sortOrder: i + 1,
          note: a.note ?? null,
        },
        update: {
          name: a.name,
          groupId: group.id,
          direction: a.direction ?? BOTH,
          isNeutral: a.isNeutral ?? false,
          isTransfer: a.isTransfer ?? false,
          sortOrder: i + 1,
          note: a.note ?? null,
        },
      });
      articleCount++;

      for (const alias of a.aliases ?? []) {
        await prisma.cashFlowArticleAlias.upsert({
          where: { alias },
          create: { alias, articleId: article.id },
          update: { articleId: article.id },
        });
        aliasCount++;
      }
    }
  }

  const neutral = GROUPS.flatMap((g) => g.articles).filter((a) => a.isNeutral).length;
  const needsReview = GROUPS.flatMap((g) => g.articles).filter((a) => a.note).length;

  console.log(`✓ Guruhlar: ${GROUPS.length}`);
  console.log(`✓ Moddalar: ${articleCount} (neytral ${neutral}, alias ${aliasCount})`);
  console.log("");
  console.log(`⚠️  ${needsReview} ta moddada izoh bor — moliyachi bilan ko'rib chiqilsin:`);
  for (const g of GROUPS) {
    for (const a of g.articles) {
      if (a.note) console.log(`     · ${a.name}`);
    }
  }
  console.log("");
  console.log('⚠️  "Bank hisobi" nomi vaqtinchalik — real bank nomi aniqlangach o\'zgartirilsin.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
