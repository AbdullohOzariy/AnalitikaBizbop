/**
 * Bir martalik: spisaniya (bizbop) chiqim yozuvlarini Iyerarxiya SUBKATGA qayta kategoriyalash.
 *
 * 1) Analitika DB'dan 118 subkat (dublikat nom → ota-kategoriya bilan farqlanadi).
 * 2) bizbop "kategoriyalar": eskisini o'chirib, 118 subkat label sinxron.
 * 3) Analitika "SpisaniyaCategoryLink": label → subkat id (sof foyda uchun).
 * 4) bizbop "yozuvlar": har mahsulotni AI (Claude) eng mos subkatga biriktiradi (batch).
 *
 * Ishga: railway run node scripts/spisaniya-subcat-backfill.mjs
 * Kerakli env: DATABASE_URL (analitika), BOT_DATABASE_URL (bizbop), ANTHROPIC_API_KEY.
 */
import pg from "pg";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5";
const BATCH = 40;

const A = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
const B = new pg.Client({ connectionString: process.env.BOT_DATABASE_URL });
const ai = new Anthropic();

function disambiguate(subcats) {
  const cnt = {};
  for (const s of subcats) cnt[s.name] = (cnt[s.name] || 0) + 1;
  for (const s of subcats) {
    s.label = (cnt[s.name] > 1 ? `${s.name} (${s.catName})` : s.name).slice(0, 100);
  }
  return subcats;
}

async function main() {
  await A.connect();
  await B.connect();

  // 1) Subkatlar (parentId != null) + ota-kategoriya + bo'lim
  const { rows: subcats } = await A.query(`
    SELECT sub.id, sub.name,
           par.name AS "catName",
           grp.name AS "groupName"
    FROM "Category" sub
    JOIN "Category" par ON par.id = sub."parentId"
    LEFT JOIN "CategoryGroup" grp ON grp.id = par."groupId"
    WHERE sub."parentId" IS NOT NULL
    ORDER BY grp."sortOrder", par."sortOrder", sub."sortOrder"
  `);
  disambiguate(subcats);
  console.log(`Subkatlar: ${subcats.length} ta`);
  const idToLabel = new Map(subcats.map((s) => [s.id, s.label]));
  const validIds = new Set(subcats.map((s) => s.id));

  // 2) bizbop kategoriyalar — eskisini o'chirib, 118 label
  await B.query("BEGIN");
  await B.query(`DELETE FROM kategoriyalar`);
  for (const s of subcats) {
    await B.query(`INSERT INTO kategoriyalar (nomi) VALUES ($1) ON CONFLICT (nomi) DO NOTHING`, [s.label]);
  }
  await B.query("COMMIT");
  console.log("bizbop kategoriyalar sinxronlandi.");

  // 3) SpisaniyaCategoryLink — label → subkat id
  await A.query(`DELETE FROM "SpisaniyaCategoryLink"`);
  for (const s of subcats) {
    await A.query(
      `INSERT INTO "SpisaniyaCategoryLink" ("botName","categoryId","updatedAt")
       VALUES ($1,$2,now()) ON CONFLICT ("botName") DO UPDATE SET "categoryId"=$2, "updatedAt"=now()`,
      [s.label, s.id]
    );
  }
  console.log("SpisaniyaCategoryLink to'ldirildi.");

  // 4) Backfill — barcha yozuvlar (tovar bo'yicha)
  const { rows: yoz } = await B.query(`SELECT id, tovar FROM yozuvlar WHERE tovar IS NOT NULL AND tovar <> '' ORDER BY id`);
  console.log(`Yozuvlar: ${yoz.length} ta — AI bilan kategoriyalanmoqda...`);

  const subcatListText = subcats.map((s) => `${s.id}. ${s.groupName ?? "-"} › ${s.catName} › ${s.name}`).join("\n");
  const SYSTEM =
    "Sen do'kon chiqim (hisobdan chiqarilgan) mahsulotlarini mavjud SUBKATEGORIYALARGA biriktiruvchisisan. " +
    "Senga mahsulot nomi va subkategoriyalar ro'yxati (id bilan) beriladi. Har mahsulot uchun ENG MOS subkat id'sini qaytar. " +
    "YANGI kategoriya YARATMA — faqat ro'yxatdagi id'lardan birini tanla. Agar umuman mos kelmasa, id=null. " +
    "Faqat JSON qaytar.\n\nSubkategoriyalar:\n" + subcatListText;

  let done = 0, matched = 0;
  for (let i = 0; i < yoz.length; i += BATCH) {
    const batch = yoz.slice(i, i + BATCH);
    const prods = batch.map((r, j) => `${j}. ${r.tovar}`).join("\n");
    let results = [];
    try {
      const msg = await ai.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          content: `Mahsulotlar:\n${prods}\n\nJSON: {"results":[{"i":raqam,"id":subkat_id_yoki_null}]}`,
        }],
      });
      const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      results = JSON.parse(json).results ?? [];
    } catch (e) {
      console.error(`  batch ${i} xato:`, e.message.split("\n")[0]);
      continue;
    }
    for (const r of results) {
      const rec = batch[r.i];
      if (!rec) continue;
      if (r.id != null && validIds.has(Number(r.id))) {
        await B.query(`UPDATE yozuvlar SET kategoriya=$1 WHERE id=$2`, [idToLabel.get(Number(r.id)), rec.id]);
        matched++;
      }
    }
    done += batch.length;
    process.stdout.write(`\r  ${done}/${yoz.length} (biriktirildi: ${matched})`);
  }
  console.log(`\nTayyor. Jami: ${yoz.length}, biriktirildi: ${matched}, mos kelmadi: ${yoz.length - matched}.`);

  await A.end(); await B.end();
}

main().catch((e) => { console.error("XATO:", e); process.exit(1); });
