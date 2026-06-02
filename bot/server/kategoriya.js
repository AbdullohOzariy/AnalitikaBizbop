// AI mahsulot kategoriyalash moduli.
// Tovar nomiga qarab Claude Haiku yordamida kategoriya tanlaydi yoki yangi yaratadi.
// Yozuv DB ga saqlangandan keyin fonda (async) chaqiriladi.

const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');

const MODEL = 'claude-haiku-4-5';

// API key bo'lmasa client null bo'ladi — modul jim ravishda o'chadi.
const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic()  // ANTHROPIC_API_KEY env'dan o'qiladi
  : null;

// Barqaror tizim ko'rsatmasi — prompt cache shu yerda (o'zgarmaydi).
// Mavjud kategoriyalar va tovar nomi (o'zgaruvchan) user xabarida yuboriladi.
const SYSTEM_PROMPT = `Sen oziq-ovqat va chakana savdo do'koni uchun mahsulotlarni
kategoriyalashtiruvchi yordamchisan. Senga tovar nomi va mavjud kategoriyalar ro'yxati
beriladi. Vazifang — tovarga eng mos kategoriyani aniqlash.

Qoidalar:
- Agar mavjud kategoriyalardan biri tovarga mos kelsa, ANIQ o'sha nomni qaytar (yangi yaratma).
- Agar hech qaysi mos kelmasa, qisqa (1-2 so'z), umumiy va o'zbek tilidagi yangi kategoriya yarat.
  Masalan: "Sut mahsulotlari", "Sabzavotlar", "Mevalar", "Ichimliklar", "Go'sht mahsulotlari",
  "Non va un mahsulotlari", "Shirinliklar", "Bakaleya", "Tozalik vositalari".
- Kategoriya nomini Bosh harf bilan boshla. Tovar markasi yoki o'lchamini kategoriya qilma.
- Kategoriya nomi 100 belgidan oshmasin.
- Faqat so'ralgan JSON formatida javob ber.`;

const SCHEMA = {
  type: 'object',
  properties: {
    kategoriya: { type: 'string', description: 'Tanlangan yoki yangi yaratilgan kategoriya nomi' },
  },
  required: ['kategoriya'],
  additionalProperties: false,
};

// Claude'dan tovar uchun kategoriya nomini oladi.
async function aiKategoriyaAniqla(tovar, mavjudKategoriyalar) {
  const royxat = mavjudKategoriyalar.length
    ? mavjudKategoriyalar.map(k => `- ${k}`).join('\n')
    : '(hozircha kategoriya yo\'q)';

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content:
          `Mavjud kategoriyalar:\n${royxat}\n\n` +
          `Tovar nomi: "${tovar}"\n\n` +
          `Shu tovar uchun eng mos kategoriyani tanla yoki yangi yarat.`,
      },
    ],
  });

  const matn = msg.content.find(b => b.type === 'text')?.text || '{}';
  const kat = JSON.parse(matn).kategoriya?.trim();
  if (!kat) throw new Error('AI bo\'sh kategoriya qaytardi');
  return kat.slice(0, 100);
}

// Yozuvni kategoriyalab DB ga yozadi. Xato bo'lsa faqat log qiladi (yozuvni buzmaydi).
async function kategoriyalashtirish(yozuvId, tovar) {
  if (!client) {
    console.warn('[kategoriya] ANTHROPIC_API_KEY yo\'q — kategoriyalash o\'tkazib yuborildi');
    return;
  }
  try {
    const { rows } = await db.query('SELECT nomi FROM kategoriyalar ORDER BY nomi');
    const mavjud = rows.map(r => r.nomi);

    const kategoriya = await aiKategoriyaAniqla(tovar, mavjud);

    await db.query(
      'INSERT INTO kategoriyalar (nomi) VALUES ($1) ON CONFLICT (nomi) DO NOTHING',
      [kategoriya]
    );
    await db.query('UPDATE yozuvlar SET kategoriya=$1 WHERE id=$2', [kategoriya, yozuvId]);

    console.log(`[kategoriya] Yozuv #${yozuvId} "${tovar}" → "${kategoriya}"`);
  } catch (err) {
    console.error(`[kategoriya] Yozuv #${yozuvId} xato:`, err.message);
  }
}

// Kategoriyasi yo'q yozuvlarni ketma-ket kategoriyalaydi (eski ma'lumotlar uchun).
// limit — bir martada nechta yozuv (xarajatni cheklash uchun). Soni qaytadi.
async function backfill(limit = 200) {
  if (!client) return { ok: false, xato: 'ANTHROPIC_API_KEY yo\'q' };
  const { rows } = await db.query(
    `SELECT id, tovar FROM yozuvlar
     WHERE kategoriya IS NULL OR kategoriya=''
     ORDER BY vaqt DESC LIMIT $1`,
    [limit]
  );
  let soni = 0;
  for (const r of rows) {
    await kategoriyalashtirish(r.id, r.tovar);
    soni++;
  }
  return { ok: true, kategoriyalandi: soni };
}

module.exports = { kategoriyalashtirish, backfill };
