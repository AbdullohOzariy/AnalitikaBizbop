/**
 * 1C OData BAZASINI O'RGANISH — faqat O'QIYDI, hech narsa yozmaydi.
 *
 *   npx tsx scripts/1c-explore.ts                 # obyektlar ro'yxati
 *   npx tsx scripts/1c-explore.ts Catalog_Номенклатура        # namuna yozuvlar
 *   npx tsx scripts/1c-explore.ts Catalog_Номенклатура --n 3  # nechta yozuv
 *
 * `.env` da bo'lishi kerak (qiymatlar kodga YOZILMAYDI):
 *   ODATA_URL=https://server/base/odata/standard.odata
 *   ODATA_USER=analitika_api
 *   ODATA_PASS=...
 *
 * NEGA ALOHIDA SKRIPT: 1C konfiguratsiyalari har xil — obyekt nomlari
 * («ПоступлениеТоваровУслуг» vs «ПриходнаяНакладная»), maydon tarkibi va hatto
 * sotuv qayerda turishi (hujjatdami, registrdami) bazadan bazaga farq qiladi.
 * Integratsiya shartnomasini TAXMIN bilan yozib bo'lmaydi — avval ko'rish kerak.
 */
import "dotenv/config";

const URL_BASE = (process.env.ODATA_URL || "").replace(/\/+$/, "");
const USER = process.env.ODATA_USER || "";
const PASS = process.env.ODATA_PASS || "";

if (!URL_BASE || !USER || !PASS) {
  console.error(
    "❌ .env da ODATA_URL, ODATA_USER, ODATA_PASS bo'lishi kerak.\n" +
      "   Namuna: ODATA_URL=https://server/base/odata/standard.odata"
  );
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

async function ol(yol: string): Promise<{ status: number; text: string }> {
  const r = await fetch(`${URL_BASE}${yol}`, {
    headers: { Authorization: auth, Accept: "application/json" },
  });
  return { status: r.status, text: await r.text() };
}

/** `$metadata` XML'idan EntitySet nomlarini ajratadi (to'liq XML parseri shart emas). */
function entitySetlar(xml: string): string[] {
  const out = new Set<string>();
  for (const m of xml.matchAll(/<EntitySet\s+Name="([^"]+)"/g)) out.add(m[1]);
  return [...out].sort();
}

/** Obyekt turi bo'yicha guruhlash — 1C nomlash konvensiyasi prefiks bilan. */
const TUR: [string, string][] = [
  ["Catalog_", "Ma'lumotnomalar (Справочники)"],
  ["Document_", "Hujjatlar (Документы)"],
  ["AccumulationRegister_", "To'planish registrlari (Регистры накопления)"],
  ["InformationRegister_", "Ma'lumot registrlari (Регистры сведений)"],
  ["DocumentJournal_", "Hujjat jurnallari"],
  ["ChartOfCharacteristicTypes_", "Xarakteristika turlari"],
  ["Constant_", "Konstantalar"],
  ["Enum_", "Sanab o'tilganlar (Перечисления)"],
];

async function royxat() {
  console.log(`🔗 ${URL_BASE}\n`);
  const meta = await ol("/$metadata");
  if (meta.status === 401) {
    console.error("❌ 401 — login/parol noto'g'ri yoki foydalanuvchida OData huquqi yo'q.");
    console.error("   1C: foydalanuvchiga «Право на использование стандартного интерфейса OData» kerak.");
    process.exit(1);
  }
  if (meta.status === 404) {
    console.error("❌ 404 — OData publikatsiyasi yoqilmagan yoki URL noto'g'ri.");
    console.error("   1C: publikatsiyada «Публиковать стандартный интерфейс OData» belgilansin.");
    process.exit(1);
  }
  if (meta.status !== 200) {
    console.error(`❌ HTTP ${meta.status}\n${meta.text.slice(0, 400)}`);
    process.exit(1);
  }

  const setlar = entitySetlar(meta.text);
  console.log(`✅ Ulanish ishladi — ${setlar.length} ta obyekt ochiq.\n`);

  const korilgan = new Set<string>();
  for (const [prefiks, nom] of TUR) {
    const guruh = setlar.filter((s) => s.startsWith(prefiks));
    guruh.forEach((s) => korilgan.add(s));
    if (guruh.length === 0) continue;
    console.log(`── ${nom} (${guruh.length})`);
    for (const s of guruh) console.log(`   ${s}`);
    console.log();
  }
  const qolgan = setlar.filter((s) => !korilgan.has(s));
  if (qolgan.length > 0) {
    console.log(`── Boshqa (${qolgan.length})`);
    for (const s of qolgan) console.log(`   ${s}`);
    console.log();
  }

  // Bizga eng kerakli obyektlar bormi — nomlar konfiguratsiyaga qarab farq qiladi,
  // shuning uchun KALIT SO'Z bo'yicha qidiramiz.
  const kerak: [string, RegExp][] = [
    ["Nomenklatura (SKU katalogi)", /Номенклатур/i],
    ["Skladlar / do'konlar", /Склад|Магазин/i],
    ["Kontragentlar (ta'minotchi)", /Контрагент/i],
    ["PRIXOD (kelib tushish)", /Поступление|ПриходнаяНакладная/i],
    ["PEREMESHENIYE (ko'chirish)", /Перемещени/i],
    ["Sotuv", /Продаж|РозничнойПродаж|ЧекККМ/i],
    ["Qoldiq registri", /ТоварыНаСклад|ОстаткиТоваров/i],
    ["Zakaz (ta'minotchiga)", /ЗаказПоставщику/i],
  ];
  console.log("── BIZGA KERAKLI OBYEKTLAR (kalit so'z bo'yicha)");
  for (const [nom, re] of kerak) {
    const topildi = setlar.filter((s) => re.test(s));
    console.log(`   ${topildi.length > 0 ? "✅" : "❌"} ${nom.padEnd(30)} ${topildi.join(", ") || "topilmadi"}`);
  }
  console.log("\nKeyingi qadam: `npx tsx scripts/1c-explore.ts <ObyektNomi>` — namuna yozuvlar va maydonlar.");
}

async function namuna(entity: string, n: number) {
  const yol = `/${encodeURIComponent(entity)}?$top=${n}&$format=json`;
  const r = await ol(yol);
  if (r.status !== 200) {
    console.error(`❌ HTTP ${r.status}\n${r.text.slice(0, 600)}`);
    process.exit(1);
  }
  let data: { value?: Record<string, unknown>[] };
  try {
    data = JSON.parse(r.text);
  } catch {
    console.error("❌ JSON emas (javob boshi):\n" + r.text.slice(0, 400));
    process.exit(1);
    return;
  }
  const rows = data.value ?? [];
  if (rows.length === 0) {
    console.log("Yozuv yo'q (bo'sh obyekt yoki huquq yetmaydi).");
    return;
  }

  console.log(`── ${entity}: ${rows.length} ta namuna\n`);
  console.log("MAYDONLAR:");
  for (const [k, v] of Object.entries(rows[0])) {
    const tur = v === null ? "null" : Array.isArray(v) ? "massiv" : typeof v;
    const qiymat = typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 60);
    console.log(`   ${k.padEnd(40)} ${tur.padEnd(8)} ${qiymat}`);
  }
  console.log("\nTO'LIQ YOZUVLAR:");
  for (const row of rows) console.log(JSON.stringify(row, null, 2));
}

const arg = process.argv[2];
const nIdx = process.argv.indexOf("--n");
const n = nIdx > 0 ? Math.max(1, Math.min(20, Number(process.argv[nIdx + 1]) || 3)) : 3;

(arg && !arg.startsWith("--") ? namuna(arg, n) : royxat()).catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
