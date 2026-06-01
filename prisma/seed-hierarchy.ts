/**
 * Iyerarxiya seed — 1C KOD asosida.
 *
 * Manba: repo ildizidagi `Iyerarxiya.xlsx` (ustunlar: KOD|BO'LIM|KOD|Categories|KOD|Subcategories|"1c da bo'ldi").
 * Kod = identifikator (Category.code @unique). Fayldagi takror kodlar overrides bilan tuzatiladi.
 *
 * - Guruhlar (FRESH/FOOD/NON-FOOD) code bo'yicha upsert.
 * - 21 kategoriya: eski ruscha nomli kategoriya bo'lsa — joyida qayta nomlanadi (id, 90 sotuv FK saqlanadi),
 *   eski nom CategoryAlias bo'lib qoladi. Aks holda yangi yaratiladi.
 * - Subkategoriyalar code bo'yicha upsert, parentId bilan.
 * - KASSA / SUXIE FRUKTI — yashirin (groupId=null) holda qoldiriladi.
 *
 * Idempotent: code bo'yicha upsert. Qayta ishga tushirish xavfsiz.
 */

import "dotenv/config";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeName } from "../src/lib/parsers/utils";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ─── Kod tuzatishlari (fayldagi takror/yetishmagan kodlar) ────────────────────
// kalit: "<KATEGORIYA NOMI>|<SUB NOMI>"
const CODE_OVERRIDES: Record<string, number> = {
  "SUT MAHSULOTLARI|PISHLOQ": 50791,
  "SUT MAHSULOTLARI|MARGARIN": 30,
  "SHIRINLIKLAR|PECHENIE": 54926,
  "O'YINCHOQLAR|BOLALAR UCHUN": 53202,
  "PARFUMERIYA|GIGIYENA": 54912,
  "ZOOTOVARLAR|GIGIYENA": 50813,
  "ZAMOROZKA|MUZLATILGAN MEVALAR": 50820,
};

// ─── Eski ruscha nom → yangi o'zbekcha top-level nom (90 sotuvni saqlash uchun) ─
const OLD_TO_NEW: Record<string, string> = {
  "MOLOCHKA": "SUT MAHSULOTLARI",
  "MYASNOY": "GO'SHT BO'LIMI",
  "OVOSHI I FRUKTI": "MEVA VA SABZAVOTLAR",
  "KOLBASNIY": "KOLBASA MAHSULOTLARI",
  "XLEB I KONDITERSKIY": "NON VA PISHIRIQLAR",
  "BAKALEYA": "BAQQOLLIK",
  "KOFE I CHAY": "KOFE VA CHOY",
  "KONFETI I SHOKOLAD": "SHIRINLIKLAR",
  "SNEKI": "SNEK&QURUQ MEVALAR",
  "SOKI I NAPITKI": "ICHIMLIKLAR",
  "CHISTYASHIE SREDSTVI": "TOZALIK VOSITALARI",
  "DETSKIY": "BOLALAR UCHUN",
  "IGRUSHKI": "O'YINCHOQLAR",
  "KONSTOVARI": "O'QUV QUROLLARI",
  "PARFUMERIYA": "PARFUMERIYA",
  "XOZ TOVARI": "XO'JALIK MOLLARI",
};
// yangi nom → eski nom (alias uchun)
const NEW_TO_OLD: Record<string, string> = Object.fromEntries(
  Object.entries(OLD_TO_NEW).map(([o, n]) => [n, o])
);

const KEEP_HIDDEN = ["KASSA", "SUXIE FRUKTI"];

const GROUP_SORT: Record<string, number> = { FRESH: 1, FOOD: 2, "NON-FOOD": 3 };

function toCode(v: unknown): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

type GroupRow = { code: number; name: string };
type CatRow = { code: number; name: string; groupName: string; sortOrder: number };
type SubRow = { code: number; name: string; parentName: string; sortOrder: number };

function parseHierarchy() {
  const file = path.join(process.cwd(), "Iyerarxiya.xlsx");
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: "",
  });

  const groups: GroupRow[] = [];
  const cats: CatRow[] = [];
  const subs: SubRow[] = [];
  let curGroup = "";
  let curCat = "";
  let catOrder = 0;
  let subOrder = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const gCode = toCode(r[0]);
    const gName = String(r[1] ?? "").trim();
    const cCode = toCode(r[2]);
    const cName = String(r[3] ?? "").trim();
    const sCodeRaw = toCode(r[4]);
    const sName = String(r[5] ?? "").trim();

    if (gName) {
      curGroup = gName;
      if (gCode) groups.push({ code: gCode, name: gName });
    }
    if (cName) {
      curCat = cName;
      catOrder += 1;
      subOrder = 0;
      if (cCode) cats.push({ code: cCode, name: cName, groupName: curGroup, sortOrder: catOrder });
      else console.warn(`⚠ Kategoriya kodsiz: "${cName}"`);
    }
    if (sName) {
      subOrder += 1;
      const override = CODE_OVERRIDES[`${curCat}|${sName}`];
      const code = override ?? sCodeRaw;
      if (code == null) {
        console.warn(`⚠ Subkategoriya kodsiz, o'tkazildi: "${sName}" [${curCat}]`);
        continue;
      }
      subs.push({ code, name: sName, parentName: curCat, sortOrder: subOrder });
    }
  }
  return { groups, cats, subs };
}

function assertUniqueCodes(cats: CatRow[], subs: SubRow[]) {
  const seen = new Map<number, string>();
  const dups: string[] = [];
  for (const c of cats) {
    if (seen.has(c.code)) dups.push(`${c.code}: "${seen.get(c.code)}" & "${c.name}"`);
    else seen.set(c.code, c.name);
  }
  for (const s of subs) {
    if (seen.has(s.code)) dups.push(`${s.code}: "${seen.get(s.code)}" & "${s.name} [${s.parentName}]"`);
    else seen.set(s.code, s.name);
  }
  if (dups.length) {
    throw new Error(`Takror kodlar topildi (Category.code @unique buziladi):\n  ${dups.join("\n  ")}`);
  }
}

async function main() {
  const { groups, cats, subs } = parseHierarchy();
  console.log(`Fayl: ${groups.length} guruh, ${cats.length} kategoriya, ${subs.length} subkategoriya`);
  assertUniqueCodes(cats, subs);

  // 1) Guruhlar
  const groupIdByName = new Map<string, number>();
  for (const g of groups) {
    const grp = await prisma.categoryGroup.upsert({
      where: { code: g.code },
      update: { name: g.name, sortOrder: GROUP_SORT[g.name] ?? 0 },
      create: { code: g.code, name: g.name, sortOrder: GROUP_SORT[g.name] ?? 0 },
    });
    groupIdByName.set(g.name, grp.id);
    console.log(`  ✓ guruh ${g.name} (code=${g.code}, id=${grp.id})`);
  }

  // 2) Top-level kategoriyalar
  const catIdByName = new Map<string, number>();
  for (const c of cats) {
    const groupId = groupIdByName.get(c.groupName) ?? null;
    const existingByCode = await prisma.category.findUnique({ where: { code: c.code } });

    if (existingByCode) {
      await prisma.category.update({
        where: { code: c.code },
        data: { name: c.name, groupId, parentId: null, sortOrder: c.sortOrder },
      });
      catIdByName.set(c.name, existingByCode.id);
    } else {
      // Eski ruscha nomli kategoriya bormi? — bo'lsa joyida qayta nomlash (sotuv FK saqlanadi)
      const oldName = NEW_TO_OLD[c.name];
      const oldRow = oldName
        ? await prisma.category.findFirst({ where: { name: oldName, code: null } })
        : null;

      if (oldRow) {
        await prisma.category.update({
          where: { id: oldRow.id },
          data: { name: c.name, code: c.code, groupId, parentId: null, sortOrder: c.sortOrder },
        });
        catIdByName.set(c.name, oldRow.id);
        // eski nomni alias qilib saqlash (matching uchun)
        if (normalizeName(oldName!) !== normalizeName(c.name)) {
          await prisma.categoryAlias
            .upsert({
              where: { alias: normalizeName(oldName!) },
              update: { categoryId: oldRow.id },
              create: { categoryId: oldRow.id, alias: normalizeName(oldName!) },
            })
            .catch(() => null);
        }
        console.log(`  ✓ "${oldName}" → "${c.name}" (code=${c.code}, sotuv saqlandi)`);
      } else {
        const created = await prisma.category.create({
          data: { name: c.name, code: c.code, groupId, parentId: null, sortOrder: c.sortOrder },
        });
        catIdByName.set(c.name, created.id);
        console.log(`  ✓ yangi kategoriya "${c.name}" (code=${c.code})`);
      }
    }
  }

  // 3) Subkategoriyalar
  let subCount = 0;
  for (const s of subs) {
    const parentId = catIdByName.get(s.parentName);
    if (!parentId) {
      console.warn(`  ⚠ Parent topilmadi: "${s.parentName}" — "${s.name}" o'tkazildi`);
      continue;
    }
    await prisma.category.upsert({
      where: { code: s.code },
      update: { name: s.name, parentId, groupId: null, sortOrder: s.sortOrder },
      create: { name: s.name, code: s.code, parentId, groupId: null, sortOrder: s.sortOrder },
    });
    subCount += 1;
  }
  console.log(`  ✓ ${subCount} subkategoriya`);

  // 4) Yashirin kategoriyalar
  for (const name of KEEP_HIDDEN) {
    const row = await prisma.category.findFirst({ where: { name } });
    if (row) {
      await prisma.category.update({
        where: { id: row.id },
        data: { groupId: null, parentId: null, sortOrder: 0 },
      });
      console.log(`  ✓ yashirin: "${name}"`);
    }
  }

  console.log("\n✓ Iyerarxiya seed yakunlandi.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
