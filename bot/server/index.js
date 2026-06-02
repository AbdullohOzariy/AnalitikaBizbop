require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const XLSX = require('xlsx');
const bot = require('../bot');
const db = require('../db');
const { kategoriyalashtirish, backfill } = require('./kategoriya');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000  // 8 soat
  }
}));

// Serve Mini App (Vite build output)
app.use('/miniapp', express.static(path.join(__dirname, '../miniapp/dist'), {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// SPA fallback for /miniapp routes
app.get('/miniapp/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../miniapp/dist/index.html'));
});

// PANEL_PATH — secret prefix, masalan "panel-a3f9k2".
// Railway Variables'da PANEL_PATH=panel-xxxxxx qilib qo'ying.
const PANEL_PATH = process.env.PANEL_PATH || 'panel';

// Root redirect
app.get('/', (req, res) => res.redirect('/miniapp'));

// ─── Panel middleware & routes ─────────────────────────────────────
const fs = require('fs');

function panelAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  const t = process.env.PANEL_TOKEN ? `?t=${process.env.PANEL_TOKEN}` : '';
  res.redirect(`/${PANEL_PATH}/login${t}`);
}

// Panel sessiyasi YOKI server-server token (Analitika "Hisobdan chiqarish" uchun).
function panelOrInternal(req, res, next) {
  const token = process.env.INTERNAL_API_TOKEN;
  if (token && req.headers['x-internal-token'] === token) {
    req.internalUser = req.headers['x-internal-user'] || 'Analitika';
    return next();
  }
  return panelAuth(req, res, next);
}

function servePanel(file, res) {
  const html = fs.readFileSync(path.join(__dirname, '../panel', file), 'utf8')
    .replace(/\/panel-assets/g, `/${PANEL_PATH}-assets`)
    .replace(/\/panel\/login/g, `/${PANEL_PATH}/login`)
    .replace(/\/panel\/logout/g, `/${PANEL_PATH}/logout`)
    .replace(/window\.location\.href\s*=\s*'\/panel'/g, `window.location.href='/${PANEL_PATH}'`)
    .replace(/href="\/panel"/g, `href="/${PANEL_PATH}"`);
  res.type('html').send(html);
}

app.use(`/${PANEL_PATH}-assets`, express.static(path.join(__dirname, '../panel')));

app.get(`/${PANEL_PATH}/login`, (req, res) => {
  const token = process.env.PANEL_TOKEN;
  if (token && req.query.t !== token) return res.status(404).send('Not Found');
  if (req.session && req.session.admin) return res.redirect(`/${PANEL_PATH}`);
  servePanel('login.html', res);
});

app.post(`/${PANEL_PATH}/login`, (req, res) => {
  const { login, parol } = req.body;
  if (login === (process.env.PANEL_USERNAME || 'admin') &&
      parol === (process.env.PANEL_PASSWORD || 'admin123')) {
    req.session.admin = true;
    req.session.adminIsm = login;
    res.json({ ok: true });
  } else {
    res.status(401).json({ xato: 'Noto\'g\'ri login yoki parol' });
  }
});

app.post(`/${PANEL_PATH}/logout`, (req, res) => {
  req.session.destroy(() => res.redirect(`/${PANEL_PATH}/login`));
});

app.get(`/${PANEL_PATH}`, panelAuth, (req, res) => servePanel('index.html', res));

app.get('/api/me', panelAuth, (req, res) => {
  res.json({ ism: req.session.adminIsm || 'Admin' });
});

app.get('/api/panel-path', panelAuth, (req, res) => {
  res.json({ path: PANEL_PATH });
});

// ─── Rasm preview ──────────────────────────────────────────────────
app.get('/api/rasm-preview/:fileId', panelAuth, async (req, res) => {
  try {
    const file = await bot.telegram.getFile(req.params.fileId);
    res.redirect(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`);
  } catch {
    res.status(404).send('Rasm topilmadi');
  }
});

// ─── Filialar ro'yxati (Mini App uchun — auth shart emas) ──────────
app.get('/api/filialar', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT nomi FROM filialar WHERE aktiv = true ORDER BY nomi'
    );
    res.json(rows.map(r => r.nomi));
  } catch (err) {
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

// ─── Sozlamalar API (panel auth kerak) ────────────────────────────

// Sozlamalar jadvali mavjudligini ta'minlash
async function sozlamalarJadvalYarat() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS sozlamalar (
      kalit TEXT PRIMARY KEY,
      qiymat TEXT NOT NULL,
      yangilangan TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // filialar jadvaliga topic_id ustuni qo'shish (agar yo'q bo'lsa)
  await db.query(`
    ALTER TABLE filialar ADD COLUMN IF NOT EXISTS topic_id BIGINT
  `).catch(() => {});
  // yozuvlar_tur_check constraintini ovqatlanish bilan yangilash
  await db.query(`
    ALTER TABLE yozuvlar DROP CONSTRAINT IF EXISTS yozuvlar_tur_check
  `).catch(() => {});
  await db.query(`
    ALTER TABLE yozuvlar ADD CONSTRAINT yozuvlar_tur_check
      CHECK (tur IN ('spisaniya','vozvrat','kafe','ovqatlanish'))
  `).catch(() => {});
  // Kategoriyalar jadvali (AI avtomatik to'ldiradi) + yozuvlarga kategoriya ustuni
  await db.query(`
    CREATE TABLE IF NOT EXISTS kategoriyalar (
      id        SERIAL PRIMARY KEY,
      nomi      VARCHAR(100) NOT NULL UNIQUE,
      yaratilgan TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  await db.query(`
    ALTER TABLE yozuvlar ADD COLUMN IF NOT EXISTS kategoriya VARCHAR(100)
  `).catch(() => {});
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_yozuvlar_kategoriya ON yozuvlar(kategoriya)
  `).catch(() => {});
}

// Filialar CRUD
app.get('/api/sozlamalar/filialar', panelAuth, async (req, res) => {
  try {
    await sozlamalarJadvalYarat();
    const { rows } = await db.query(
      'SELECT id, nomi, aktiv, topic_id FROM filialar ORDER BY nomi'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

app.post('/api/sozlamalar/filialar', panelAuth, async (req, res) => {
  const { nomi } = req.body;
  if (!nomi?.trim()) return res.status(400).json({ xato: 'Filial nomi kerak' });
  try {
    const { rows } = await db.query(
      'INSERT INTO filialar (nomi, aktiv) VALUES ($1, true) RETURNING id, nomi, aktiv, topic_id',
      [nomi.trim()]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ xato: 'Bunday filial allaqachon mavjud' });
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

app.patch('/api/sozlamalar/filialar/:id', panelAuth, async (req, res) => {
  const { id } = req.params;
  const { nomi, aktiv, topic_id } = req.body;
  try {
    const sets = [];
    const vals = [];
    let i = 1;
    if (nomi !== undefined)     { sets.push(`nomi=$${i++}`);     vals.push(nomi.trim()); }
    if (aktiv !== undefined)    { sets.push(`aktiv=$${i++}`);    vals.push(aktiv); }
    if (topic_id !== undefined) { sets.push(`topic_id=$${i++}`); vals.push(topic_id || null); }
    if (!sets.length) return res.status(400).json({ xato: 'Hech narsa o\'zgartirilmadi' });
    vals.push(id);
    const { rows } = await db.query(
      `UPDATE filialar SET ${sets.join(',')} WHERE id=$${i} RETURNING id, nomi, aktiv, topic_id`,
      vals
    );
    if (!rows.length) return res.status(404).json({ xato: 'Topilmadi' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

app.delete('/api/sozlamalar/filialar/:id', panelAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM filialar WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ xato: 'Topilmadi' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ xato: 'Bu filialda yozuvlar mavjud, o\'chirib bo\'lmaydi' });
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

// Guruh sozlamalari (GROUP_CHAT_ID)
app.get('/api/sozlamalar/guruh', panelAuth, async (req, res) => {
  try {
    await sozlamalarJadvalYarat();
    const { rows } = await db.query(
      "SELECT qiymat FROM sozlamalar WHERE kalit='GROUP_CHAT_ID'"
    );
    res.json({ chat_id: rows[0]?.qiymat || process.env.GROUP_CHAT_ID || '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

app.post('/api/sozlamalar/guruh', panelAuth, async (req, res) => {
  const { chat_id } = req.body;
  if (!chat_id?.toString().trim()) return res.status(400).json({ xato: 'Chat ID kerak' });
  try {
    await db.query(`
      INSERT INTO sozlamalar (kalit, qiymat, yangilangan)
      VALUES ('GROUP_CHAT_ID', $1, NOW())
      ON CONFLICT (kalit) DO UPDATE SET qiymat=$1, yangilangan=NOW()
    `, [chat_id.toString().trim()]);
    process.env.GROUP_CHAT_ID = chat_id.toString().trim();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

// Parol o'zgartirish
app.post('/api/sozlamalar/parol', panelAuth, async (req, res) => {
  const { joriy, yangi } = req.body;
  if (!joriy || !yangi) return res.status(400).json({ xato: 'Joriy va yangi parol kerak' });
  if (yangi.length < 6) return res.status(400).json({ xato: 'Yangi parol kamida 6 ta belgi bo\'lishi kerak' });
  try {
    await sozlamalarJadvalYarat();
    const { rows } = await db.query("SELECT qiymat FROM sozlamalar WHERE kalit='PANEL_PASSWORD'");
    const joriyParol = rows[0]?.qiymat || process.env.PANEL_PASSWORD || 'admin123';
    if (joriy !== joriyParol) return res.status(401).json({ xato: 'Joriy parol noto\'g\'ri' });
    await db.query(`
      INSERT INTO sozlamalar (kalit, qiymat, yangilangan)
      VALUES ('PANEL_PASSWORD', $1, NOW())
      ON CONFLICT (kalit) DO UPDATE SET qiymat=$1, yangilangan=NOW()
    `, [yangi]);
    process.env.PANEL_PASSWORD = yangi;
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

// Startup: DB dan sozlamalarni yuklash
async function sozlamalarYukla() {
  try {
    await sozlamalarJadvalYarat();
    const { rows } = await db.query("SELECT kalit, qiymat FROM sozlamalar WHERE kalit IN ('GROUP_CHAT_ID','PANEL_PASSWORD')");
    rows.forEach(r => { process.env[r.kalit] = r.qiymat; });
    if (rows.length) console.log(`[sozlamalar] DB dan yuklandi: ${rows.map(r => r.kalit).join(', ')}`);
  } catch (err) {
    console.error('[sozlamalar] Yuklab bo\'lmadi:', err.message);
  }
}

// ─── Rasm yuklash (Telegram'ga) ────────────────────────────────────
app.post('/api/rasm-yukla', upload.single('rasm'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ xato: 'Rasm topilmadi' });

    const chatId = process.env.GROUP_CHAT_ID;
    if (!chatId) return res.status(500).json({ xato: 'GROUP_CHAT_ID sozlanmagan' });

    // Guruhga vaqtinchalik yuborib file_id olamiz, so'ng o'chiramiz
    const result = await bot.telegram.sendPhoto(
      chatId,
      { source: req.file.buffer, filename: req.file.originalname || 'rasm.jpg' }
    );
    await bot.telegram.deleteMessage(chatId, result.message_id).catch(() => {});

    const fileId = result.photo[result.photo.length - 1].file_id;
    res.json({ file_id: fileId });
  } catch (err) {
    console.error('Rasm yuklash xatosi:', err.message);
    res.status(500).json({ xato: 'Rasm yuklanmadi: ' + err.message });
  }
});

// ─── Yangi yozuv saqlash ───────────────────────────────────────────
app.post('/api/yozuv', async (req, res) => {
  const d = req.body;

  if (!d.tovar || !d.miqdor || !d.summa || !d.filial || !d.tur) {
    return res.status(400).json({ xato: 'Majburiy maydonlar to\'ldirilmagan' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO yozuvlar
        (tur, tovar, miqdor, birlik, summa, sabab, filial,
         firma, kafe_nomi, xodim_ism, xodim_username, xodim_id, rasm_file_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        d.tur, d.tovar, d.miqdor, d.birlik || 'kg', d.summa,
        d.sabab || null, d.filial, d.firma || null, d.kafe_nomi || null,
        d.xodim_ism, d.xodim_username || null, d.xodim_id, d.rasm_file_id
      ]
    );
    const yozuvId = rows[0].id;

    if (d.tur === 'vozvrat') {
      await client.query(
        `INSERT INTO vozvrat_nazorat (yozuv_id, status) VALUES ($1, 'kutilmoqda')`,
        [yozuvId]
      );
    }

    await client.query('COMMIT');

    guruhgaYuborish(d, yozuvId).catch(console.error);
    // AI fonda kategoriyalaydi — yozuv javobini kechiktirmaydi.
    kategoriyalashtirish(yozuvId, d.tovar).catch(console.error);

    res.json({ ok: true, id: yozuvId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[yozuv] DB xato:', err.message, err.detail || '');
    res.status(500).json({ xato: err.message });
  } finally {
    client.release();
  }
});

// ─── Yozuv tahrirlash ─────────────────────────────────────────────
app.patch('/api/yozuv/:id', panelAuth, async (req, res) => {
  const { id } = req.params;
  const { tur, tovar, miqdor, birlik, summa, sabab, filial, firma } = req.body;

  const turlar = ['spisaniya', 'vozvrat', 'kafe', 'ovqatlanish'];
  if (tur && !turlar.includes(tur))
    return res.status(400).json({ xato: 'Noto\'g\'ri tur' });

  try {
    const sets = [];
    const vals = [];
    let i = 1;
    if (tur    !== undefined) { sets.push(`tur=$${i++}`);    vals.push(tur); }
    if (tovar  !== undefined) { sets.push(`tovar=$${i++}`);  vals.push(tovar.trim()); }
    if (miqdor !== undefined) { sets.push(`miqdor=$${i++}`); vals.push(Number(miqdor)); }
    if (birlik !== undefined) { sets.push(`birlik=$${i++}`); vals.push(birlik); }
    if (summa  !== undefined) { sets.push(`summa=$${i++}`);  vals.push(Number(summa)); }
    if (sabab  !== undefined) { sets.push(`sabab=$${i++}`);  vals.push(sabab || null); }
    if (filial !== undefined) { sets.push(`filial=$${i++}`); vals.push(filial); }
    if (firma  !== undefined) { sets.push(`firma=$${i++}`);  vals.push(firma || null); }

    if (!sets.length) return res.status(400).json({ xato: 'Hech narsa o\'zgartirilmadi' });
    vals.push(id);

    const { rows } = await db.query(
      `UPDATE yozuvlar SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ xato: 'Topilmadi' });
    // Tovar nomi o'zgargan bo'lsa — kategoriyani fonda qayta aniqlaymiz.
    if (tovar !== undefined) {
      kategoriyalashtirish(rows[0].id, rows[0].tovar).catch(console.error);
    }
    res.json({ ok: true, yozuv: rows[0] });
  } catch (err) {
    console.error('[tahrir] xato:', err.message);
    res.status(500).json({ xato: err.message });
  }
});

// ─── Yozuv o'chirish ───────────────────────────────────────────────
app.delete('/api/yozuv/:id', panelAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM yozuvlar WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ xato: 'Topilmadi' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[ochir] xato:', err.message);
    res.status(500).json({ xato: err.message });
  }
});

// ─── Vozvrat status yangilash ──────────────────────────────────────
app.patch('/api/vozvrat/:id', panelOrInternal, async (req, res) => {
  const { id } = req.params;
  const { status, firma_javob } = req.body;
  // Panel admin'ida raqamli Telegram ID yo'q — yangilagan_id (BIGINT) null bo'ladi,
  // kim yangilagani yangilagan_ism (matn) orqali saqlanadi.
  const yangilagan_id  = null;
  const yangilagan_ism = (req.session && req.session.adminIsm) || req.internalUser || 'Admin';

  const validStatuslar = ['kutilmoqda', 'jarayonda', 'bajarildi', 'rad_etildi'];
  if (!validStatuslar.includes(status)) {
    return res.status(400).json({ xato: 'Noto\'g\'ri status' });
  }

  try {
    const { rows } = await db.query(
      `UPDATE vozvrat_nazorat
       SET status=$1, firma_javob=$2, yangilagan_id=$3,
           yangilagan_ism=$4, yangilangan_vaqt=NOW()
       WHERE yozuv_id=$5
       RETURNING *`,
      [status, firma_javob || null, yangilagan_id, yangilagan_ism, id]
    );

    if (!rows.length) return res.status(404).json({ xato: 'Topilmadi' });

    const { rows: tovarRows } = await db.query(
      'SELECT tovar, firma FROM yozuvlar WHERE id=$1', [id]
    );

    const statusEmoji = { kutilmoqda: '⏳', jarayonda: '🔄', bajarildi: '✅', rad_etildi: '❌' };
    const statusUz = { kutilmoqda: 'Kutilmoqda', jarayonda: 'Jarayonda', bajarildi: 'Bajarildi', rad_etildi: 'Rad etildi' };

    if (tovarRows.length) {
      const t = tovarRows[0];
      await bot.telegram.sendMessage(
        process.env.GROUP_CHAT_ID,
        `♻️ Qayta ishlash yangilandi\n` +
        `Tovar: ${t.tovar}${t.firma ? ` (${t.firma})` : ''}\n` +
        `Holat: ${statusEmoji[status]} ${statusUz[status]}\n` +
        `Yangiladi: ${yangilagan_ism}\n` +
        `Vaqt: ${new Date().toLocaleString('uz-UZ')}`
      ).catch(console.error);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

// ─── Panel uchun yozuvlar ro'yxati ─────────────────────────────────
app.get('/api/yozuvlar', panelAuth, async (req, res) => {
  const { tur, filial, sana_dan, sana_gacha, status, page = 1, limit = 50 } = req.query;
  let where = [];
  let params = [];
  let i = 1;
  
  const offset = (Math.max(1, page) - 1) * limit;

  if (tur)        { where.push(`y.tur=$${i++}`);        params.push(tur); }
  if (filial)     { where.push(`y.filial=$${i++}`);     params.push(filial); }
  if (sana_dan)   { where.push(`y.vaqt>=$${i++}`);      params.push(sana_dan); }
  if (sana_gacha) { where.push(`y.vaqt<=$${i++}`);      params.push(sana_gacha + ' 23:59:59'); }
  if (status)     { where.push(`vn.status=$${i++}`);    params.push(status); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const { rows } = await db.query(
      `SELECT y.*, vn.status as vozvrat_status, vn.firma_javob,
              vn.yangilagan_ism, vn.yangilangan_vaqt
       FROM yozuvlar y
       LEFT JOIN vozvrat_nazorat vn ON vn.yozuv_id = y.id
       ${whereStr}
       ORDER BY y.vaqt DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );
    
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM yozuvlar y LEFT JOIN vozvrat_nazorat vn ON vn.yozuv_id = y.id ${whereStr}`,
      params
    );
    
    res.set('X-Total-Count', countResult.rows[0].total);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

// ─── Statistika (filtr parametrlariga bog'liq) ─────────────────────
app.get('/api/statistika', panelAuth, async (req, res) => {
  const { filial, sana_dan, sana_gacha } = req.query;
  let where = [];
  let params = [];
  let i = 1;

  if (filial)     { where.push(`filial=$${i++}`);            params.push(filial); }
  if (sana_dan)   { where.push(`vaqt>=$${i++}`);             params.push(sana_dan); }
  if (sana_gacha) { where.push(`vaqt<=$${i++}`);             params.push(sana_gacha + ' 23:59:59'); }
  if (!sana_dan && !sana_gacha) { where.push(`vaqt >= NOW() - INTERVAL '30 days'`); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const { rows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE tur='vozvrat')      AS vozvrat_soni,
         COUNT(*) FILTER (WHERE tur='kafe')         AS kafe_soni,
         COUNT(*) FILTER (WHERE tur='ovqatlanish')  AS ovqatlanish_soni,
         COUNT(*) FILTER (WHERE tur='spisaniya')    AS spisaniya_soni,
         COALESCE(SUM(summa) FILTER (WHERE tur='vozvrat'),     0) AS vozvrat_summa,
         COALESCE(SUM(summa) FILTER (WHERE tur='kafe'),        0) AS kafe_summa,
         COALESCE(SUM(summa) FILTER (WHERE tur='ovqatlanish'), 0) AS ovqatlanish_summa,
         COALESCE(SUM(summa) FILTER (WHERE tur='spisaniya'),   0) AS spisaniya_summa,
         COUNT(*) FILTER (
           WHERE tur='vozvrat' AND
           EXISTS (SELECT 1 FROM vozvrat_nazorat vn
                   WHERE vn.yozuv_id=yozuvlar.id AND vn.status='kutilmoqda')
         ) AS kutilayotgan_vozvratlar,
         COUNT(*) FILTER (
           WHERE tur='vozvrat' AND
           EXISTS (SELECT 1 FROM vozvrat_nazorat vn
                   WHERE vn.yozuv_id=yozuvlar.id AND vn.status='kutilmoqda'
                   AND yozuvlar.vaqt < NOW() - INTERVAL '3 days')
         ) AS muddati_ogoh
       FROM yozuvlar
       ${whereStr}`,
      params
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

// ─── Kategoriyalar CRUD (panel sozlamalari) ───────────────────────
app.get('/api/sozlamalar/kategoriyalar', panelAuth, async (req, res) => {
  try {
    await sozlamalarJadvalYarat();
    const { rows } = await db.query(
      `SELECT k.id, k.nomi,
              COUNT(y.id) AS soni
       FROM kategoriyalar k
       LEFT JOIN yozuvlar y ON y.kategoriya = k.nomi
       GROUP BY k.id, k.nomi
       ORDER BY k.nomi`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

app.post('/api/sozlamalar/kategoriyalar', panelAuth, async (req, res) => {
  const nomi = req.body?.nomi?.trim();
  if (!nomi) return res.status(400).json({ xato: 'Kategoriya nomi kerak' });
  try {
    const { rows } = await db.query(
      'INSERT INTO kategoriyalar (nomi) VALUES ($1) RETURNING id, nomi',
      [nomi.slice(0, 100)]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ xato: 'Bunday kategoriya allaqachon mavjud' });
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

app.patch('/api/sozlamalar/kategoriyalar/:id', panelAuth, async (req, res) => {
  const nomi = req.body?.nomi?.trim();
  if (!nomi) return res.status(400).json({ xato: 'Kategoriya nomi kerak' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT nomi FROM kategoriyalar WHERE id=$1', [req.params.id]
    );
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ xato: 'Topilmadi' }); }
    const eski = rows[0].nomi;
    const { rows: yangi } = await client.query(
      'UPDATE kategoriyalar SET nomi=$1 WHERE id=$2 RETURNING id, nomi',
      [nomi.slice(0, 100), req.params.id]
    );
    // Yozuvlardagi eski nomni ham yangilaymiz (denormalizatsiya).
    await client.query('UPDATE yozuvlar SET kategoriya=$1 WHERE kategoriya=$2', [yangi[0].nomi, eski]);
    await client.query('COMMIT');
    res.json(yangi[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ xato: 'Bunday kategoriya allaqachon mavjud' });
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  } finally {
    client.release();
  }
});

app.delete('/api/sozlamalar/kategoriyalar/:id', panelAuth, async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT nomi FROM kategoriyalar WHERE id=$1', [req.params.id]);
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ xato: 'Topilmadi' }); }
    // Yozuvlarda bu kategoriyani bo'shatamiz (yozuvlar o'chmaydi).
    await client.query('UPDATE yozuvlar SET kategoriya=NULL WHERE kategoriya=$1', [rows[0].nomi]);
    await client.query('DELETE FROM kategoriyalar WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  } finally {
    client.release();
  }
});

// ─── Kategoriyasi yo'q eski yozuvlarni AI bilan to'ldirish ─────────
app.post('/api/kategoriya/backfill', panelAuth, async (req, res) => {
  try {
    const natija = await backfill(Number(req.body?.limit) || 200);
    res.status(natija.ok ? 200 : 400).json(natija);
  } catch (err) {
    console.error('[backfill] xato:', err.message);
    res.status(500).json({ xato: err.message });
  }
});

// ─── Dashboard: kategoriya / filial kesimida amallar bo'yicha ──────
app.get('/api/dashboard', panelAuth, async (req, res) => {
  const { filial, sana_dan, sana_gacha } = req.query;
  const where = [];
  const params = [];
  let i = 1;

  if (filial)     { where.push(`filial=$${i++}`);  params.push(filial); }
  if (sana_dan)   { where.push(`vaqt>=$${i++}`);    params.push(sana_dan); }
  if (sana_gacha) { where.push(`vaqt<=$${i++}`);    params.push(sana_gacha + ' 23:59:59'); }
  if (!sana_dan && !sana_gacha) { where.push(`vaqt >= NOW() - INTERVAL '30 days'`); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  // Tur bo'yicha summa/son ustunlari — ham kategoriya, ham filial uchun bir xil.
  const aggregat = `
    COUNT(*)                                              AS soni,
    COALESCE(SUM(summa), 0)                               AS summa,
    COUNT(*) FILTER (WHERE tur='spisaniya')               AS spisaniya_soni,
    COUNT(*) FILTER (WHERE tur='vozvrat')                 AS vozvrat_soni,
    COUNT(*) FILTER (WHERE tur='kafe')                    AS kafe_soni,
    COUNT(*) FILTER (WHERE tur='ovqatlanish')             AS ovqatlanish_soni,
    COALESCE(SUM(summa) FILTER (WHERE tur='spisaniya'),0) AS spisaniya_summa,
    COALESCE(SUM(summa) FILTER (WHERE tur='vozvrat'),0)   AS vozvrat_summa,
    COALESCE(SUM(summa) FILTER (WHERE tur='kafe'),0)      AS kafe_summa,
    COALESCE(SUM(summa) FILTER (WHERE tur='ovqatlanish'),0) AS ovqatlanish_summa`;

  try {
    const [kategoriyalar, filiallar] = await Promise.all([
      db.query(
        `SELECT COALESCE(NULLIF(kategoriya,''), 'Aniqlanmagan') AS kategoriya, ${aggregat}
         FROM yozuvlar ${whereStr}
         GROUP BY 1 ORDER BY summa DESC`,
        params
      ),
      db.query(
        `SELECT filial, ${aggregat}
         FROM yozuvlar ${whereStr}
         GROUP BY filial ORDER BY summa DESC`,
        params
      ),
    ]);
    res.json({ kategoriyalar: kategoriyalar.rows, filiallar: filiallar.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

// ─── Excel Eksport ─────────────────────────────────────────────────
app.get('/api/eksport', panelAuth, async (req, res) => {
  const { filial, sana_dan, sana_gacha, tur } = req.query;
  let where = [];
  let params = [];
  let i = 1;

  if (tur)        { where.push(`y.tur=$${i++}`);        params.push(tur); }
  if (filial)     { where.push(`y.filial=$${i++}`);     params.push(filial); }
  if (sana_dan)   { where.push(`y.vaqt>=$${i++}`);      params.push(sana_dan); }
  if (sana_gacha) { where.push(`y.vaqt<=$${i++}`);      params.push(sana_gacha + ' 23:59:59'); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const { rows } = await db.query(
      `SELECT y.id, y.vaqt, y.tur, y.tovar, y.kategoriya, y.miqdor, y.birlik, y.summa,
              y.sabab, y.filial, y.firma, y.xodim_ism, y.xodim_username,
              vn.status as vozvrat_status, vn.firma_javob
       FROM yozuvlar y
       LEFT JOIN vozvrat_nazorat vn ON vn.yozuv_id = y.id
       ${whereStr}
       ORDER BY y.vaqt DESC`,
      params
    );

    const turUz = { spisaniya: 'Spisaniya', vozvrat: 'Qayta ishlash', kafe: 'Kafe', ovqatlanish: 'Ovqatlanish' };
    const statusUz = { kutilmoqda: 'Kutilmoqda', jarayonda: 'Jarayonda', bajarildi: 'Bajarildi', rad_etildi: 'Rad etildi' };

    const wb = XLSX.utils.book_new();

    // ── Barcha yozuvlar (asosiy varaq) ──
    const asosiyHeaders = ['#', 'Vaqt', 'Tur', 'Tovar', 'Kategoriya', 'Miqdor', 'Birlik', 'Summa (so\'m)', 'Sabab', 'Filial', 'Firma', 'Xodim', 'Username', 'Qayta ishlash holati', 'Firma javobi'];
    const asosiyData = rows.map(r => [
      r.id,
      new Date(r.vaqt).toLocaleString('uz-UZ'),
      turUz[r.tur] || r.tur,
      r.tovar,
      r.kategoriya || '',
      Number(r.miqdor),
      r.birlik,
      Number(r.summa),
      r.sabab || '',
      r.filial,
      r.firma || '',
      r.xodim_ism,
      r.xodim_username ? '@' + r.xodim_username : '',
      r.vozvrat_status ? statusUz[r.vozvrat_status] || r.vozvrat_status : '',
      r.firma_javob || '',
    ]);

    const asosiyWs = XLSX.utils.aoa_to_sheet([asosiyHeaders, ...asosiyData]);
    asosiyWs['!cols'] = [4,18,14,24,18,8,7,14,20,16,16,18,14,14,20].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, asosiyWs, 'Barcha yozuvlar');

    // ── Tur bo'yicha alohida varaqlar ──
    const turlar = [
      { key: 'kafe',        nom: 'Kafe',        headers: ['#', 'Vaqt', 'Tovar', 'Miqdor', 'Birlik', 'Summa (so\'m)', 'Sabab', 'Filial', 'Xodim'] },
      { key: 'ovqatlanish', nom: 'Ovqatlanish', headers: ['#', 'Vaqt', 'Tovar', 'Miqdor', 'Birlik', 'Summa (so\'m)', 'Sabab', 'Filial', 'Xodim'] },
      { key: 'spisaniya',   nom: 'Spisaniya',   headers: ['#', 'Vaqt', 'Tovar', 'Miqdor', 'Birlik', 'Summa (so\'m)', 'Sabab', 'Filial', 'Xodim'] },
      { key: 'vozvrat',     nom: 'Qayta ishlash', headers: ['#', 'Vaqt', 'Tovar', 'Miqdor', 'Birlik', 'Summa (so\'m)', 'Filial', 'Firma', 'Xodim', 'Holat', 'Firma javobi'] },
    ];

    for (const t of turlar) {
      const tRows = rows.filter(r => r.tur === t.key);
      const data = tRows.map(r => {
        const base = [
          r.id,
          new Date(r.vaqt).toLocaleString('uz-UZ'),
          r.tovar,
          Number(r.miqdor),
          r.birlik,
          Number(r.summa),
        ];
        if (t.key === 'vozvrat') {
          return [...base, r.filial, r.firma || '', r.xodim_ism,
            r.vozvrat_status ? statusUz[r.vozvrat_status] || r.vozvrat_status : '',
            r.firma_javob || ''];
        }
        return [...base, r.sabab || '', r.filial, r.xodim_ism];
      });
      const ws = XLSX.utils.aoa_to_sheet([t.headers, ...data]);
      ws['!cols'] = t.headers.map((_, idx) => ({ wch: [4,18,24,8,7,14,20,16,18,14,20][idx] || 14 }));
      XLSX.utils.book_append_sheet(wb, ws, t.nom);
    }

    // ── Filial bo'yicha statistika varaqi ──
    const filialMap = {};
    rows.forEach(r => {
      if (!filialMap[r.filial]) filialMap[r.filial] = { kafe:0, ovqatlanish:0, spisaniya:0, vozvrat:0, jami:0 };
      filialMap[r.filial][r.tur] = (filialMap[r.filial][r.tur] || 0) + Number(r.summa);
      filialMap[r.filial].jami += Number(r.summa);
    });
    const statHeaders = ['Filial', 'Kafe (so\'m)', 'Ovqatlanish (so\'m)', 'Spisaniya (so\'m)', 'Qayta ishlash (so\'m)', 'Jami (so\'m)'];
    const statData = Object.entries(filialMap).map(([nom, s]) => [
      nom, s.kafe, s.ovqatlanish, s.spisaniya, s.vozvrat, s.jami
    ]);
    // Jami qatori
    const jami = statData.reduce((acc, r) => { r.slice(1).forEach((v,i) => acc[i] = (acc[i]||0)+v); return acc; }, []);
    statData.push(['JAMI', ...jami]);

    const statWs = XLSX.utils.aoa_to_sheet([statHeaders, ...statData]);
    statWs['!cols'] = [18,16,18,16,16,16].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, statWs, 'Filial statistika');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const sana = new Date().toISOString().slice(0, 10);
    const fayl = tur ? `${turUz[tur] || tur}-${sana}.xlsx` : `BizBop-${sana}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fayl}"`);
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  }
});

// ─── Muddati o'tgan qayta ishlash tekshiruvi (har 6 soatda) ────────
setInterval(async () => {
  try {
    const { rows } = await db.query(
      `SELECT y.id, y.tovar, y.firma, y.filial, y.vaqt
       FROM yozuvlar y
       JOIN vozvrat_nazorat vn ON vn.yozuv_id = y.id
       WHERE vn.status = 'kutilmoqda'
         AND y.vaqt < NOW() - INTERVAL '7 days'`
    );
    for (const r of rows) {
      await bot.telegram.sendMessage(
        process.env.GROUP_CHAT_ID,
        `🔴 Qayta ishlash 7 kun javobsiz!\n` +
        `Tovar: ${r.tovar}\n` +
        `Firma: ${r.firma || '—'}\n` +
        `Filial: ${r.filial}\n` +
        `Yuborilgan: ${new Date(r.vaqt).toLocaleDateString('uz-UZ')}`
      ).catch(console.error);
    }
  } catch (err) {
    console.error('Interval xatosi:', err);
  }
}, 6 * 60 * 60 * 1000);

// ─── Telegram Webhook ──────────────────────────────────────────────
app.post(`/webhook/${process.env.BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// ─── Filial → Topic ID (DB dan) ───────────────────────────────────
async function filialTopicId(filial) {
  try {
    const { rows } = await db.query(
      'SELECT topic_id FROM filialar WHERE nomi=$1 AND aktiv=true LIMIT 1',
      [filial]
    );
    return rows[0]?.topic_id ? Number(rows[0].topic_id) : null;
  } catch {
    return null;
  }
}

// ─── Guruhga xabar yuborish funksiyasi ────────────────────────────
async function guruhgaYuborish(d, yozuvId) {
  const chatId = process.env.GROUP_CHAT_ID;
  if (!chatId) {
    console.error('[guruh] GROUP_CHAT_ID env o\'zgaruvchisi yo\'q!');
    return;
  }

  const threadId = await filialTopicId(d.filial);
  const vaqt = new Date().toLocaleString('uz-UZ');
  const turEmoji = { spisaniya: '🗑', vozvrat: '↩️', kafe: '☕', ovqatlanish: '🍽' };
  const turUz    = { spisaniya: 'SPISANIYA', vozvrat: 'QAYTA ISHLASH', kafe: 'KAFE', ovqatlanish: 'OVQATLANISH' };

  let matn =
    `${turEmoji[d.tur] || '📦'} <b>${turUz[d.tur] || d.tur.toUpperCase()}</b>\n\n` +
    `📦 <b>Tovar:</b> ${d.tovar}\n` +
    `📏 <b>Miqdor:</b> ${d.miqdor} ${d.birlik || 'dona'}\n` +
    `💰 <b>Summa:</b> ${Number(d.summa).toLocaleString('uz-UZ')} so'm\n`;

  if (d.sabab)  matn += `📝 <b>Sabab:</b> ${d.sabab}\n`;
  if (d.firma)  matn += `🏢 <b>Firma:</b> ${d.firma}\n`;

  matn +=
    `📍 <b>Filial:</b> ${d.filial}\n` +
    `👤 <b>Xodim:</b> ${d.xodim_ism}${d.xodim_username ? ` (@${d.xodim_username})` : ''}\n` +
    `🕐 <b>Vaqt:</b> ${vaqt}`;

  const opts = { parse_mode: 'HTML', ...(threadId ? { message_thread_id: threadId } : {}) };

  try {
    let msg;
    if (d.rasm_file_id) {
      msg = await bot.telegram.sendPhoto(chatId, d.rasm_file_id, {
        caption: matn,
        ...opts,
      });
    } else {
      msg = await bot.telegram.sendMessage(chatId, matn, opts);
    }

    if (threadId) console.log(`[guruh] Filial "${d.filial}" → topic ${threadId}`);

    await db.query(
      'UPDATE yozuvlar SET guruh_message_id=$1 WHERE id=$2',
      [msg.message_id, yozuvId]
    );
    console.log(`[guruh] Yozuv #${yozuvId} guruhga yuborildi. message_id=${msg.message_id}`);
  } catch (err) {
    console.error(`[guruh] XATO — yozuv #${yozuvId}:`, err.message);
    console.error(`[guruh] GROUP_CHAT_ID=${chatId}, rasm_file_id=${d.rasm_file_id}`);
  }
}

// ─── Serverni ishga tushirish ──────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server port ${PORT} da ishlayapti`);
  await sozlamalarYukla();
  console.log(`GROUP_CHAT_ID: ${process.env.GROUP_CHAT_ID || 'YO\'Q!'}`);
  console.log(`BOT_TOKEN: ${process.env.BOT_TOKEN ? process.env.BOT_TOKEN.slice(0,10) + '...' : 'YO\'Q!'}`);
  console.log(`WEBHOOK_URL: ${process.env.WEBHOOK_URL || 'YO\'Q!'}`);

  try {
    const webhookUrl = `${process.env.WEBHOOK_URL}/webhook/${process.env.BOT_TOKEN}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`Webhook o'rnatildi: ${webhookUrl}`);
  } catch (err) {
    console.error('Webhook xatosi:', err.message);
  }
});
