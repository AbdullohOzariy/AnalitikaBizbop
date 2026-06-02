# Supermarket Spisaniya Bot — To'liq Agent Prompti

---

## LOYIHA HAQIDA

Sen tajribali full-stack dasturchiisan. Quyidagi texnik stack asosida supermarket uchun to'liq ishlaydigan tizim yozasan:

- **Bot:** Node.js + Telegraf.js (v4)
- **Mini App:** Vanilla HTML/CSS/JS (Telegram Web App SDK)
- **Backend:** Node.js + Express.js
- **Ma'lumotlar bazasi:** PostgreSQL (pg kutubxonasi)
- **Deploy:** Railway (yoki har qanday VPS, Dockerfile bilan)
- **Muhit o'zgaruvchilari:** `.env` fayl

Hech qanday framework (React, Vue) ishlatilmaydi. Faqat sof JS.

---

## TIZIM ARXITEKTURASI

```
Xodim (Telegram)
    │
    ▼
Telegram Bot (Telegraf.js)
    │
    ├──► Mini App (HTML/CSS/JS) ◄──► Express API
    │                                     │
    ├──► Guruh kanal (auto xabar)         ▼
    │                               PostgreSQL
    └──► Nazorat Panel (Web)   ◄──► Express API
```

---

## FAYL STRUKTURASI

```
/project
├── .env
├── package.json
├── Dockerfile
├── railway.toml
│
├── /bot
│   └── index.js              ← Telegraf bot + Mini App ochish
│
├── /server
│   └── index.js              ← Express API server
│
├── /db
│   ├── index.js              ← PostgreSQL ulanish
│   └── schema.sql            ← Jadvallar
│
├── /miniapp
│   ├── index.html            ← Mini App (forma)
│   ├── style.css             ← Bento grid UI
│   └── app.js                ← Forma logikasi + Telegram SDK
│
└── /panel
    ├── index.html            ← Nazorat panel
    ├── style.css             ← Panel UI
    └── app.js                ← Panel logikasi
```

---

## MUHIT O'ZGARUVCHILARI (.env)

```env
BOT_TOKEN=your_telegram_bot_token
GROUP_CHAT_ID=-100xxxxxxxxxx
WEBHOOK_URL=https://your-domain.com
DATABASE_URL=postgresql://user:pass@host:5432/dbname
PORT=3000
ADMIN_IDS=123456789,987654321
```

---

## MA'LUMOTLAR BAZASI (db/schema.sql)

```sql
CREATE TABLE IF NOT EXISTS yozuvlar (
  id              SERIAL PRIMARY KEY,
  tur             VARCHAR(20) NOT NULL CHECK (tur IN ('spisaniya','vozvrat','kafe')),
  tovar           VARCHAR(255) NOT NULL,
  miqdor          DECIMAL(10,3) NOT NULL,
  birlik          VARCHAR(20) NOT NULL DEFAULT 'kg',
  summa           DECIMAL(15,2) NOT NULL,
  sabab           VARCHAR(100),
  filial          VARCHAR(100) NOT NULL,
  firma           VARCHAR(255),
  kafe_nomi       VARCHAR(255),
  xodim_ism       VARCHAR(255) NOT NULL,
  xodim_username  VARCHAR(255),
  xodim_id        BIGINT NOT NULL,
  rasm_file_id    VARCHAR(500),
  guruh_message_id BIGINT,
  vaqt            TIMESTAMP DEFAULT NOW(),
  status          VARCHAR(30) DEFAULT 'yangi'
);

CREATE TABLE IF NOT EXISTS vozvrat_nazorat (
  id              SERIAL PRIMARY KEY,
  yozuv_id        INTEGER REFERENCES yozuvlar(id) ON DELETE CASCADE,
  status          VARCHAR(30) NOT NULL DEFAULT 'kutilmoqda'
                  CHECK (status IN ('kutilmoqda','jarayonda','bajarildi','rad_etildi')),
  firma_javob     TEXT,
  muddat          DATE,
  yangilagan_id   BIGINT,
  yangilagan_ism  VARCHAR(255),
  yangilangan_vaqt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS filialar (
  id    SERIAL PRIMARY KEY,
  nomi  VARCHAR(100) NOT NULL UNIQUE,
  aktiv BOOLEAN DEFAULT true
);

INSERT INTO filialar (nomi) VALUES
  ('Chilonzor'), ('Yunusobod'), ('Mirzo Ulugbek'),
  ('Sergeli'), ('Yakkasaroy')
ON CONFLICT DO NOTHING;

CREATE INDEX idx_yozuvlar_vaqt ON yozuvlar(vaqt DESC);
CREATE INDEX idx_yozuvlar_tur ON yozuvlar(tur);
CREATE INDEX idx_vozvrat_status ON vozvrat_nazorat(status);
```

---

## DATABASE ULANISH (db/index.js)

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

module.exports = pool;
```

---

## BOT (bot/index.js)

```javascript
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);
const MINI_APP_URL = `${process.env.WEBHOOK_URL}/miniapp`;

bot.start((ctx) => {
  const ism = ctx.from.first_name || 'Xodim';
  ctx.reply(
    `Salom, ${ism}! \nYangi yozuv qo'shish uchun tugmani bosing.`,
    Markup.keyboard([
      [Markup.button.webApp('Yangi yozuv', MINI_APP_URL)]
    ]).resize()
  );
});

bot.command('panel', (ctx) => {
  const adminIds = process.env.ADMIN_IDS.split(',').map(Number);
  if (!adminIds.includes(ctx.from.id)) {
    return ctx.reply('Ruxsat yo\'q.');
  }
  ctx.reply(
    'Nazorat panel:',
    Markup.inlineKeyboard([
      [Markup.button.url('Panelni ochish', `${process.env.WEBHOOK_URL}/panel`)]
    ])
  );
});

module.exports = bot;
```

---

## EXPRESS SERVER (server/index.js)

```javascript
require('dotenv').config();
const express = require('express');
const path = require('path');
const bot = require('../bot');
const db = require('../db');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../miniapp'), {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// ─── Mini App fayllarni serve qilish ───────────────────────────────
app.get('/miniapp', (req, res) => {
  res.sendFile(path.join(__dirname, '../miniapp/index.html'));
});

// ─── Nazorat panel fayllarni serve qilish ──────────────────────────
app.use('/panel-assets', express.static(path.join(__dirname, '../panel')));
app.get('/panel', (req, res) => {
  res.sendFile(path.join(__dirname, '../panel/index.html'));
});

// ─── Filialar ro'yxati ─────────────────────────────────────────────
app.get('/api/filialar', async (req, res) => {
  const { rows } = await db.query(
    'SELECT nomi FROM filialar WHERE aktiv = true ORDER BY nomi'
  );
  res.json(rows.map(r => r.nomi));
});

// ─── Yangi yozuv saqlash ───────────────────────────────────────────
app.post('/api/yozuv', async (req, res) => {
  const d = req.body;

  // Validatsiya
  if (!d.tovar || !d.miqdor || !d.summa || !d.filial || !d.tur) {
    return res.status(400).json({ xato: 'Majburiy maydonlar to\'ldirilmagan' });
  }
  if (!d.rasm_file_id) {
    return res.status(400).json({ xato: 'Rasm yuklanmagan' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Asosiy yozuv
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

    // Vozvrat uchun tracker yozuvi
    if (d.tur === 'vozvrat') {
      await client.query(
        `INSERT INTO vozvrat_nazorat (yozuv_id, status)
         VALUES ($1, 'kutilmoqda')`,
        [yozuvId]
      );
    }

    await client.query('COMMIT');

    // Guruhga xabar yuborish (async, kutilmaydi)
    guruhgaYuborish(d, yozuvId, client).catch(console.error);

    res.json({ ok: true, id: yozuvId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ xato: 'Server xatosi' });
  } finally {
    client.release();
  }
});

// ─── Vozvrat status yangilash ──────────────────────────────────────
app.patch('/api/vozvrat/:id', async (req, res) => {
  const { id } = req.params;
  const { status, firma_javob, yangilagan_id, yangilagan_ism } = req.body;

  const validStatuslar = ['kutilmoqda', 'jarayonda', 'bajarildi', 'rad_etildi'];
  if (!validStatuslar.includes(status)) {
    return res.status(400).json({ xato: 'Noto\'g\'ri status' });
  }

  const { rows } = await db.query(
    `UPDATE vozvrat_nazorat
     SET status=$1, firma_javob=$2, yangilagan_id=$3,
         yangilagan_ism=$4, yangilangan_vaqt=NOW()
     WHERE yozuv_id=$5
     RETURNING *`,
    [status, firma_javob || null, yangilagan_id, yangilagan_ism, id]
  );

  if (!rows.length) return res.status(404).json({ xato: 'Topilmadi' });

  // Tovar ma'lumotini olish
  const { rows: tovarRows } = await db.query(
    'SELECT tovar, firma FROM yozuvlar WHERE id=$1', [id]
  );

  // Guruhga status xabari
  const statusEmoji = {
    kutilmoqda: '⏳', jarayonda: '🔄', bajarildi: '✅', rad_etildi: '❌'
  };
  const statusUz = {
    kutilmoqda: 'Kutilmoqda', jarayonda: 'Jarayonda',
    bajarildi: 'Bajarildi', rad_etildi: 'Rad etildi'
  };
  if (tovarRows.length) {
    const t = tovarRows[0];
    await bot.telegram.sendMessage(
      process.env.GROUP_CHAT_ID,
      `🔄 Vozvrat yangilandi\n` +
      `Tovar: ${t.tovar}${t.firma ? ` (${t.firma})` : ''}\n` +
      `Holat: ${statusEmoji[status]} ${statusUz[status]}\n` +
      `Yangiladi: ${yangilagan_ism}\n` +
      `Vaqt: ${new Date().toLocaleString('uz-UZ')}`
    ).catch(console.error);
  }

  res.json({ ok: true });
});

// ─── Panel uchun yozuvlar ro'yxati ─────────────────────────────────
app.get('/api/yozuvlar', async (req, res) => {
  const { tur, filial, sana_dan, sana_gacha, status } = req.query;
  let where = [];
  let params = [];
  let i = 1;

  if (tur) { where.push(`y.tur=$${i++}`); params.push(tur); }
  if (filial) { where.push(`y.filial=$${i++}`); params.push(filial); }
  if (sana_dan) { where.push(`y.vaqt>=$${i++}`); params.push(sana_dan); }
  if (sana_gacha) { where.push(`y.vaqt<=$${i++}`); params.push(sana_gacha + ' 23:59:59'); }
  if (status) { where.push(`vn.status=$${i++}`); params.push(status); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const { rows } = await db.query(
    `SELECT y.*, vn.status as vozvrat_status, vn.firma_javob,
            vn.yangilagan_ism, vn.yangilangan_vaqt
     FROM yozuvlar y
     LEFT JOIN vozvrat_nazorat vn ON vn.yozuv_id = y.id
     ${whereStr}
     ORDER BY y.vaqt DESC
     LIMIT 200`,
    params
  );
  res.json(rows);
});

// ─── Statistika ────────────────────────────────────────────────────
app.get('/api/statistika', async (req, res) => {
  const { rows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE tur='spisaniya') AS spisaniya_soni,
       COUNT(*) FILTER (WHERE tur='vozvrat')   AS vozvrat_soni,
       COUNT(*) FILTER (WHERE tur='kafe')      AS kafe_soni,
       COALESCE(SUM(summa) FILTER (WHERE tur='spisaniya'), 0) AS spisaniya_summa,
       COALESCE(SUM(summa) FILTER (WHERE tur='vozvrat'),   0) AS vozvrat_summa,
       COALESCE(SUM(summa) FILTER (WHERE tur='kafe'),      0) AS kafe_summa,
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
     WHERE vaqt >= NOW() - INTERVAL '30 days'`
  );
  res.json(rows[0]);
});

// ─── Muddati o'tgan vozvratlar tekshiruvi (har 6 soatda) ───────────
setInterval(async () => {
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
      `🔴 Vozvrat 7 kun javobsiz!\n` +
      `Tovar: ${r.tovar}\n` +
      `Firma: ${r.firma || '—'}\n` +
      `Filial: ${r.filial}\n` +
      `Yuborilgan: ${new Date(r.vaqt).toLocaleDateString('uz-UZ')}`
    ).catch(console.error);
  }
}, 6 * 60 * 60 * 1000);

// ─── Telegram Webhook ──────────────────────────────────────────────
app.post(`/webhook/${process.env.BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// ─── Guruhga xabar yuborish funksiyasi ────────────────────────────
async function guruhgaYuborish(d, yozuvId, client) {
  const vaqt = new Date().toLocaleString('uz-UZ');
  const turEmoji = { spisaniya: '🗑', vozvrat: '🔄', kafe: '☕' };
  const turUz = { spisaniya: 'SPISANIYA', vozvrat: 'VOZVRAT', kafe: 'KAFE' };

  let matn =
    `${turEmoji[d.tur]} ${turUz[d.tur]}\n` +
    `Tovar: ${d.tovar}\n` +
    `Miqdor: ${d.miqdor} ${d.birlik || 'kg'}\n` +
    `Summa: ${Number(d.summa).toLocaleString()} so'm\n`;

  if (d.sabab) matn += `Sabab: ${d.sabab}\n`;
  if (d.firma) matn += `Firma: ${d.firma}\n`;
  if (d.kafe_nomi) matn += `Kafe: ${d.kafe_nomi}\n`;
  if (d.tur === 'vozvrat') matn += `Holat: ⏳ Kutilmoqda\n`;

  matn +=
    `Filial: ${d.filial}\n` +
    `Xodim: ${d.xodim_ism}${d.xodim_username ? ` (@${d.xodim_username})` : ''}\n` +
    `Vaqt: ${vaqt}`;

  const msg = await bot.telegram.sendPhoto(
    process.env.GROUP_CHAT_ID,
    d.rasm_file_id,
    { caption: matn }
  );

  // message_id ni saqlash
  await client.query(
    'UPDATE yozuvlar SET guruh_message_id=$1 WHERE id=$2',
    [msg.message_id, yozuvId]
  );
}

// ─── Serverni ishga tushirish ──────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server port ${PORT} da ishlayapti`);

  // Webhook o'rnatish
  await bot.telegram.setWebhook(
    `${process.env.WEBHOOK_URL}/webhook/${process.env.BOT_TOKEN}`
  );
  console.log('Webhook o\'rnatildi');
});
```

---

## MINI APP (miniapp/index.html)

```html
<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>Yozuv qo'shish</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">

    <!-- BOSQICH 1: Kategoriya -->
    <div id="step1" class="step active">
      <p class="step-sarlavha">Turini tanlang</p>
      <div class="bento-grid kategoriya">
        <button class="bento-card spisaniya" onclick="kategoriyaTanla('spisaniya')">
          <span class="bento-icon">🗑</span>
          <span class="bento-nomi">Spisaniya</span>
          <span class="bento-tavsif">Yaroqsiz tovar</span>
        </button>
        <button class="bento-card vozvrat" onclick="kategoriyaTanla('vozvrat')">
          <span class="bento-icon">🔄</span>
          <span class="bento-nomi">Vozvrat</span>
          <span class="bento-tavsif">Firmaga qaytarish</span>
        </button>
        <button class="bento-card kafe full-width" onclick="kategoriyaTanla('kafe')">
          <span class="bento-icon">☕</span>
          <span class="bento-nomi">Kafe</span>
          <span class="bento-tavsif">Kafe uchun sarflash</span>
        </button>
      </div>
    </div>

    <!-- BOSQICH 2: Forma -->
    <div id="step2" class="step">
      <div class="step-header">
        <button class="orqaga" onclick="orqaga()">← Orqaga</button>
        <span id="tur-badge" class="badge"></span>
      </div>

      <div class="bento-grid forma">

        <!-- Tovar nomi -->
        <div class="bento-card full-width input-card">
          <label>📦 Tovar nomi</label>
          <input type="text" id="tovar" placeholder="Masalan: Persik" autocomplete="off">
        </div>

        <!-- Miqdor + Birlik -->
        <div class="bento-card input-card">
          <label>⚖️ Miqdori</label>
          <div class="miqdor-row">
            <input type="number" id="miqdor" placeholder="0.5" min="0.001" step="0.001">
            <select id="birlik">
              <option value="kg">kg</option>
              <option value="dona">dona</option>
              <option value="litr">litr</option>
              <option value="paket">paket</option>
              <option value="quti">quti</option>
            </select>
          </div>
        </div>

        <!-- Summa -->
        <div class="bento-card input-card">
          <label>💰 Summa (so'm)</label>
          <input type="number" id="summa" placeholder="29755" min="0">
        </div>

        <!-- Sabab (tugmalar) -->
        <div class="bento-card full-width input-card" id="sabab-blok">
          <label>❌ Sabab</label>
          <div class="tugmalar-grid">
            <button class="sabab-btn" onclick="sababTanla(this,'Eskirgan')">Eskirgan</button>
            <button class="sabab-btn" onclick="sababTanla(this,'Shikastlangan')">Shikastlangan</button>
            <button class="sabab-btn" onclick="sababTanla(this,'Ko\'rinish yomon')">Ko'rinish yomon</button>
            <button class="sabab-btn" onclick="sababTanla(this,'Boshqa')">Boshqa...</button>
          </div>
          <input type="text" id="sabab-boshqa" placeholder="Sababni yozing..." style="display:none;margin-top:8px">
        </div>

        <!-- Filial -->
        <div class="bento-card full-width input-card">
          <label>🏪 Filial</label>
          <select id="filial">
            <option value="">— Filialni tanlang —</option>
          </select>
        </div>

        <!-- Faqat Vozvrat: Firma nomi -->
        <div class="bento-card full-width input-card" id="firma-blok" style="display:none">
          <label>🏭 Firma nomi</label>
          <input type="text" id="firma" placeholder="Masalan: Delfin OOO">
        </div>

        <!-- Faqat Kafe: Kafe nomi -->
        <div class="bento-card full-width input-card" id="kafe-blok" style="display:none">
          <label>☕ Qaysi kafe?</label>
          <input type="text" id="kafe-nomi" placeholder="Masalan: Markaz kafe">
        </div>

        <!-- Rasm -->
        <div class="bento-card full-width rasm-card" id="rasm-blok">
          <div id="rasm-preview" style="display:none">
            <img id="rasm-img" src="" alt="Yuklangan rasm">
            <button class="rasm-ochir" onclick="rasmOchir()">✕</button>
          </div>
          <div id="rasm-tanlov">
            <p class="rasm-sarlavha">📸 Tovar rasmi</p>
            <div class="rasm-tugmalar">
              <label class="rasm-btn kamera-btn">
                <span>📷 Kamera</span>
                <input type="file" accept="image/*" capture="environment"
                       onchange="rasmYukla(this)" style="display:none">
              </label>
              <label class="rasm-btn galereya-btn">
                <span>🖼 Galereya</span>
                <input type="file" accept="image/*"
                       onchange="rasmYukla(this)" style="display:none">
              </label>
            </div>
          </div>
        </div>

      </div>

      <button class="davom-btn" onclick="tasdiqga()">Davom etish →</button>
    </div>

    <!-- BOSQICH 3: Tasdiq -->
    <div id="step3" class="step">
      <div class="step-header">
        <button class="orqaga" onclick="formagaQayt()">← Tuzatish</button>
        <span class="badge badge-tasdiq">Tekshirish</span>
      </div>

      <div class="tasdiq-karta">
        <div id="tasdiq-rasm-wrap">
          <img id="tasdiq-rasm" src="" alt="Rasm" class="tasdiq-rasm">
        </div>
        <div class="tasdiq-qatorlar" id="tasdiq-qatorlar"></div>
      </div>

      <button class="yuborish-btn" onclick="yuborish()" id="yuborish-btn">
        ✅ Yuborish
      </button>
    </div>

    <!-- BOSQICH 4: Muvaffaqiyat -->
    <div id="step4" class="step">
      <div class="muvaffaqiyat">
        <div class="mv-icon">✅</div>
        <h2>Yuborildi!</h2>
        <p id="mv-tavsif">Ma'lumot guruhga yuborildi.</p>
        <button class="yangidan-btn" onclick="yangidan()">Yangi yozuv</button>
      </div>
    </div>

  </div>
  <script src="app.js"></script>
</body>
</html>
```

---

## MINI APP LOGIKA (miniapp/app.js)

```javascript
const tg = window.Telegram.WebApp;
tg.expand();
tg.setHeaderColor('#ffffff');

let holat = {
  tur: null,
  sabab: null,
  rasmFile: null,
  rasmBase64: null
};

// ─── Filialarni yuklash ────────────────────────────────────────────
fetch('/api/filialar')
  .then(r => r.json())
  .then(filialar => {
    const sel = document.getElementById('filial');
    filialar.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    });
  });

// ─── Bosqich boshqaruvi ────────────────────────────────────────────
function stepKor(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

// ─── 1-bosqich: Kategoriya ─────────────────────────────────────────
function kategoriyaTanla(tur) {
  holat.tur = tur;
  const badge = document.getElementById('tur-badge');
  const labellar = { spisaniya: '🗑 Spisaniya', vozvrat: '🔄 Vozvrat', kafe: '☕ Kafe' };
  badge.textContent = labellar[tur];
  badge.className = 'badge badge-' + tur;

  document.getElementById('firma-blok').style.display = tur === 'vozvrat' ? '' : 'none';
  document.getElementById('kafe-blok').style.display  = tur === 'kafe'    ? '' : 'none';
  document.getElementById('sabab-blok').style.display = tur === 'kafe'    ? 'none' : '';

  stepKor('step2');
  tg.HapticFeedback.impactOccurred('light');
}

function orqaga() {
  holat = { tur: null, sabab: null, rasmFile: null, rasmBase64: null };
  stepKor('step1');
}

function formagaQayt() {
  stepKor('step2');
}

// ─── Sabab tugmalari ───────────────────────────────────────────────
function sababTanla(el, sabab) {
  document.querySelectorAll('.sabab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  holat.sabab = sabab;
  const boshqaInput = document.getElementById('sabab-boshqa');
  if (sabab === 'Boshqa') {
    boshqaInput.style.display = '';
    boshqaInput.focus();
  } else {
    boshqaInput.style.display = 'none';
    boshqaInput.value = '';
  }
  tg.HapticFeedback.selectionChanged();
}

// ─── Rasm ──────────────────────────────────────────────────────────
function rasmYukla(input) {
  const fayl = input.files[0];
  if (!fayl) return;
  holat.rasmFile = fayl;
  const reader = new FileReader();
  reader.onload = (e) => {
    holat.rasmBase64 = e.target.result;
    document.getElementById('rasm-img').src = e.target.result;
    document.getElementById('rasm-preview').style.display = '';
    document.getElementById('rasm-tanlov').style.display = 'none';
  };
  reader.readAsDataURL(fayl);
}

function rasmOchir() {
  holat.rasmFile = null;
  holat.rasmBase64 = null;
  document.getElementById('rasm-preview').style.display = 'none';
  document.getElementById('rasm-tanlov').style.display = '';
}

// ─── 3-bosqich: Tasdiq ─────────────────────────────────────────────
function tasdiqga() {
  const tovar  = document.getElementById('tovar').value.trim();
  const miqdor = document.getElementById('miqdor').value;
  const summa  = document.getElementById('summa').value;
  const filial = document.getElementById('filial').value;

  if (!tovar)  return xatoKor('Tovar nomini kiriting');
  if (!miqdor || miqdor <= 0) return xatoKor('Miqdorni kiriting');
  if (!summa  || summa  <  0) return xatoKor('Summani kiriting');
  if (!filial) return xatoKor('Filialni tanlang');
  if (!holat.rasmFile) return xatoKor('Rasm yuklang');

  if (holat.tur !== 'kafe' && !holat.sabab) return xatoKor('Sababni tanlang');

  if (holat.sabab === 'Boshqa') {
    const b = document.getElementById('sabab-boshqa').value.trim();
    if (!b) return xatoKor('Sababni yozing');
    holat.sabab = b;
  }

  // Tasdiq sahifasini to'ldirish
  const birlik   = document.getElementById('birlik').value;
  const firma    = document.getElementById('firma').value.trim();
  const kafeNomi = document.getElementById('kafe-nomi').value.trim();

  const turUz  = { spisaniya: '🗑 Spisaniya', vozvrat: '🔄 Vozvrat', kafe: '☕ Kafe' };
  const qatorlar = [
    ['Tur',    turUz[holat.tur]],
    ['Tovar',  tovar],
    ['Miqdor', `${miqdor} ${birlik}`],
    ['Summa',  `${Number(summa).toLocaleString()} so'm`],
  ];
  if (holat.sabab) qatorlar.push(['Sabab', holat.sabab]);
  if (firma)       qatorlar.push(['Firma', firma]);
  if (kafeNomi)    qatorlar.push(['Kafe',  kafeNomi]);
  qatorlar.push(['Filial', filial]);
  qatorlar.push(['Xodim',  `${tg.initDataUnsafe?.user?.first_name || 'Noma\'lum'}`]);

  document.getElementById('tasdiq-qatorlar').innerHTML = qatorlar.map(([k, v]) =>
    `<div class="tasdiq-qator"><span class="tasdiq-kalit">${k}</span><span class="tasdiq-qiymat">${v}</span></div>`
  ).join('');

  document.getElementById('tasdiq-rasm').src = holat.rasmBase64;
  stepKor('step3');
}

// ─── Yuborish ──────────────────────────────────────────────────────
async function yuborish() {
  const btn = document.getElementById('yuborish-btn');
  btn.disabled = true;
  btn.textContent = 'Yuklanmoqda...';

  try {
    // 1. Avval rasmni Telegram'ga yuklash uchun bot serveriga yuboramiz
    const formData = new FormData();
    formData.append('rasm', holat.rasmFile);
    formData.append('xodim_id', tg.initDataUnsafe?.user?.id || '0');

    const rasmRes = await fetch('/api/rasm-yukla', {
      method: 'POST',
      body: formData
    });
    const rasmData = await rasmRes.json();
    if (!rasmData.file_id) throw new Error('Rasm yuklanmadi');

    // 2. Asosiy ma'lumotlarni yuborish
    const ma = {
      tur:             holat.tur,
      tovar:           document.getElementById('tovar').value.trim(),
      miqdor:          parseFloat(document.getElementById('miqdor').value),
      birlik:          document.getElementById('birlik').value,
      summa:           parseFloat(document.getElementById('summa').value),
      sabab:           holat.sabab,
      filial:          document.getElementById('filial').value,
      firma:           document.getElementById('firma').value.trim() || null,
      kafe_nomi:       document.getElementById('kafe-nomi').value.trim() || null,
      rasm_file_id:    rasmData.file_id,
      xodim_ism:       tg.initDataUnsafe?.user?.first_name || 'Noma\'lum',
      xodim_username:  tg.initDataUnsafe?.user?.username || null,
      xodim_id:        tg.initDataUnsafe?.user?.id || 0
    };

    const res = await fetch('/api/yozuv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ma)
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.xato);

    document.getElementById('mv-tavsif').textContent =
      `#${data.id} — guruhga yuborildi.`;
    stepKor('step4');
    tg.HapticFeedback.notificationOccurred('success');

  } catch (err) {
    console.error(err);
    xatoKor('Xato yuz berdi: ' + err.message);
    btn.disabled = false;
    btn.textContent = '✅ Yuborish';
  }
}

// ─── Yangidan ──────────────────────────────────────────────────────
function yangidan() {
  holat = { tur: null, sabab: null, rasmFile: null, rasmBase64: null };
  document.getElementById('tovar').value   = '';
  document.getElementById('miqdor').value  = '';
  document.getElementById('summa').value   = '';
  document.getElementById('filial').value  = '';
  document.getElementById('firma').value   = '';
  document.getElementById('kafe-nomi').value = '';
  document.querySelectorAll('.sabab-btn').forEach(b => b.classList.remove('active'));
  rasmOchir();
  stepKor('step1');
}

// ─── Xato xabari ──────────────────────────────────────────────────
function xatoKor(xabar) {
  tg.showAlert(xabar);
  tg.HapticFeedback.notificationOccurred('error');
}
```

---

## MINI APP STIL (miniapp/style.css)

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--tg-theme-bg-color, #f5f5f5);
  color: var(--tg-theme-text-color, #1a1a1a);
  padding: 12px;
  min-height: 100vh;
}

.step { display: none; }
.step.active { display: block; animation: fadeIn .2s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

.step-sarlavha {
  font-size: 18px; font-weight: 600;
  text-align: center; margin-bottom: 16px;
  color: var(--tg-theme-text-color, #1a1a1a);
}

/* ── Bento Grid ── */
.bento-grid {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}

.bento-grid.kategoriya {
  grid-template-columns: 1fr 1fr;
}

.bento-grid.forma {
  grid-template-columns: 1fr 1fr;
}

.bento-card {
  background: var(--tg-theme-secondary-bg-color, #ffffff);
  border-radius: 16px;
  padding: 16px;
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: transform .15s, border-color .15s;
  -webkit-tap-highlight-color: transparent;
}

.bento-card:active { transform: scale(0.97); }
.full-width { grid-column: 1 / -1; }

/* Kategoriya kartalar */
.bento-card.kategoriya { display: flex; flex-direction: column; align-items: center; gap: 6px; min-height: 100px; justify-content: center; }
.bento-card.spisaniya:hover, .bento-card.spisaniya:active { border-color: #E24B4A; }
.bento-card.vozvrat:hover,   .bento-card.vozvrat:active   { border-color: #378ADD; }
.bento-card.kafe:hover,      .bento-card.kafe:active      { border-color: #EF9F27; }
.bento-card.kafe { flex-direction: row; justify-content: center; gap: 12px; min-height: 64px; }

.bento-icon { font-size: 32px; }
.bento-nomi { font-size: 15px; font-weight: 600; }
.bento-tavsif { font-size: 12px; opacity: .6; }

/* Input kartalar */
.input-card { padding: 12px 14px; cursor: default; }
.input-card label { display: block; font-size: 12px; font-weight: 500; opacity: .6; margin-bottom: 6px; }
.input-card input, .input-card select {
  width: 100%; border: none; outline: none;
  background: transparent; font-size: 16px;
  color: var(--tg-theme-text-color, #1a1a1a);
}
.input-card select { cursor: pointer; }

.miqdor-row { display: flex; gap: 8px; align-items: center; }
.miqdor-row input { flex: 1; }
.miqdor-row select { width: auto; flex-shrink: 0; font-size: 14px; opacity: .7; }

/* Sabab tugmalari */
.tugmalar-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.sabab-btn {
  padding: 8px 6px; border-radius: 10px; font-size: 13px; font-weight: 500;
  border: 1.5px solid rgba(0,0,0,0.1);
  background: var(--tg-theme-bg-color, #f5f5f5);
  color: var(--tg-theme-text-color, #1a1a1a);
  cursor: pointer; transition: all .15s;
}
.sabab-btn.active { background: #E24B4A; color: #fff; border-color: #E24B4A; }

/* Rasm */
.rasm-card { min-height: 140px; display: flex; align-items: center; justify-content: center; }
.rasm-sarlavha { font-size: 15px; font-weight: 500; text-align: center; margin-bottom: 12px; }
.rasm-tugmalar { display: flex; gap: 10px; justify-content: center; }
.rasm-btn {
  display: flex; align-items: center; justify-content: center;
  padding: 12px 20px; border-radius: 12px; font-size: 15px; font-weight: 500;
  border: 1.5px solid rgba(0,0,0,0.15); cursor: pointer;
  background: var(--tg-theme-bg-color, #f5f5f5);
}
.rasm-preview { position: relative; width: 100%; }
#rasm-img { width: 100%; border-radius: 12px; max-height: 220px; object-fit: cover; }
.rasm-ochir {
  position: absolute; top: 8px; right: 8px;
  width: 28px; height: 28px; border-radius: 50%;
  background: rgba(0,0,0,0.5); color: #fff;
  border: none; font-size: 14px; cursor: pointer;
}

/* Badge */
.badge {
  display: inline-block; padding: 4px 12px;
  border-radius: 20px; font-size: 13px; font-weight: 600;
}
.badge-spisaniya { background: #FCEBEB; color: #A32D2D; }
.badge-vozvrat   { background: #E6F1FB; color: #0C447C; }
.badge-kafe      { background: #FAEEDA; color: #633806; }
.badge-tasdiq    { background: #EAF3DE; color: #27500A; }

/* Header */
.step-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.orqaga { background: none; border: none; font-size: 15px; color: var(--tg-theme-link-color, #2196F3); cursor: pointer; padding: 4px 0; }

/* Davom tugmasi */
.davom-btn {
  width: 100%; padding: 15px; border-radius: 14px;
  background: var(--tg-theme-button-color, #2196F3);
  color: var(--tg-theme-button-text-color, #fff);
  border: none; font-size: 16px; font-weight: 600;
  cursor: pointer; margin-top: 8px;
}

/* Tasdiq */
.tasdiq-karta { background: var(--tg-theme-secondary-bg-color, #fff); border-radius: 16px; overflow: hidden; margin-bottom: 12px; }
.tasdiq-rasm { width: 100%; max-height: 200px; object-fit: cover; display: block; }
.tasdiq-qatorlar { padding: 12px 14px; }
.tasdiq-qator { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid rgba(0,0,0,0.07); }
.tasdiq-qator:last-child { border-bottom: none; }
.tasdiq-kalit { font-size: 13px; opacity: .6; }
.tasdiq-qiymat { font-size: 13px; font-weight: 600; text-align: right; max-width: 60%; }

.yuborish-btn {
  width: 100%; padding: 15px; border-radius: 14px;
  background: #1D9E75; color: #fff; border: none;
  font-size: 16px; font-weight: 600; cursor: pointer;
}
.yuborish-btn:disabled { opacity: .6; }

/* Muvaffaqiyat */
.muvaffaqiyat { text-align: center; padding: 40px 20px; }
.mv-icon { font-size: 64px; margin-bottom: 16px; }
.muvaffaqiyat h2 { font-size: 24px; margin-bottom: 8px; }
.muvaffaqiyat p { opacity: .6; margin-bottom: 24px; }
.yangidan-btn {
  padding: 14px 32px; border-radius: 14px;
  background: var(--tg-theme-button-color, #2196F3);
  color: #fff; border: none; font-size: 15px; font-weight: 600; cursor: pointer;
}
```

---

## NAZORAT PANEL (panel/index.html)

```html
<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nazorat panel</title>
  <link rel="stylesheet" href="/panel-assets/style.css">
</head>
<body>
  <div id="app">
    <header class="panel-header">
      <h1>Nazorat panel</h1>
      <div class="filtr-row">
        <select id="f-tur" onchange="yuklash()">
          <option value="">Barchasi</option>
          <option value="spisaniya">Spisaniya</option>
          <option value="vozvrat">Vozvrat</option>
          <option value="kafe">Kafe</option>
        </select>
        <input type="date" id="f-sana-dan" onchange="yuklash()">
        <input type="date" id="f-sana-gacha" onchange="yuklash()">
        <select id="f-vozvrat-status" onchange="yuklash()">
          <option value="">Holat</option>
          <option value="kutilmoqda">Kutilmoqda</option>
          <option value="jarayonda">Jarayonda</option>
          <option value="bajarildi">Bajarildi</option>
          <option value="rad_etildi">Rad etildi</option>
        </select>
      </div>
    </header>

    <div id="statistika" class="stat-grid"></div>

    <div id="jadval-wrap">
      <table id="jadval">
        <thead>
          <tr>
            <th>#</th><th>Vaqt</th><th>Tur</th>
            <th>Tovar</th><th>Miqdor</th><th>Summa</th>
            <th>Filial</th><th>Xodim</th><th>Holat</th><th></th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  </div>

  <script src="/panel-assets/app.js"></script>
</body>
</html>
```

---

## PANEL LOGIKA (panel/app.js)

```javascript
const turEmoji = { spisaniya: '🗑', vozvrat: '🔄', kafe: '☕' };
const statusEmoji = { kutilmoqda: '⏳', jarayonda: '🔄', bajarildi: '✅', rad_etildi: '❌' };
const statusUz = { kutilmoqda: 'Kutilmoqda', jarayonda: 'Jarayonda', bajarildi: 'Bajarildi', rad_etildi: 'Rad etildi' };
const ADMIN_ID = parseInt(localStorage.getItem('admin_id') || '0');

async function yuklash() {
  const params = new URLSearchParams();
  const tur = document.getElementById('f-tur').value;
  const sanaDan = document.getElementById('f-sana-dan').value;
  const sanaGacha = document.getElementById('f-sana-gacha').value;
  const vozvratStatus = document.getElementById('f-vozvrat-status').value;

  if (tur) params.set('tur', tur);
  if (sanaDan) params.set('sana_dan', sanaDan);
  if (sanaGacha) params.set('sana_gacha', sanaGacha);
  if (vozvratStatus) params.set('status', vozvratStatus);

  const [yozuvlar, stat] = await Promise.all([
    fetch('/api/yozuvlar?' + params).then(r => r.json()),
    fetch('/api/statistika').then(r => r.json())
  ]);

  statistikaKor(stat);
  jadvalKor(yozuvlar);
}

function statistikaKor(s) {
  document.getElementById('statistika').innerHTML = `
    <div class="stat-karta"><div class="stat-raqam">${s.spisaniya_soni}</div><div class="stat-nom">Spisaniya</div><div class="stat-summa">${Number(s.spisaniya_summa).toLocaleString()} so'm</div></div>
    <div class="stat-karta"><div class="stat-raqam">${s.vozvrat_soni}</div><div class="stat-nom">Vozvrat</div><div class="stat-summa">${Number(s.vozvrat_summa).toLocaleString()} so'm</div></div>
    <div class="stat-karta"><div class="stat-raqam">${s.kafe_soni}</div><div class="stat-nom">Kafe</div><div class="stat-summa">${Number(s.kafe_summa).toLocaleString()} so'm</div></div>
    <div class="stat-karta ogoh"><div class="stat-raqam">${s.kutilayotgan_vozvratlar}</div><div class="stat-nom">Kutilmoqda</div>${s.muddati_ogoh > 0 ? `<div class="stat-ogoh">⚠️ ${s.muddati_ogoh} ta kechikkan</div>` : ''}</div>
  `;
}

function jadvalKor(yozuvlar) {
  const tbody = document.getElementById('tbody');
  if (!yozuvlar.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;opacity:.5;padding:24px">Ma\'lumot yo\'q</td></tr>';
    return;
  }
  tbody.innerHTML = yozuvlar.map(y => {
    const vaqt = new Date(y.vaqt).toLocaleString('uz-UZ');
    const status = y.vozvrat_status
      ? `<span class="holat holat-${y.vozvrat_status}">${statusEmoji[y.vozvrat_status]} ${statusUz[y.vozvrat_status]}</span>`
      : `<span class="holat holat-yangi">Yangi</span>`;
    const amallar = y.tur === 'vozvrat'
      ? `<button class="status-btn" onclick="statusOzgartir(${y.id}, '${y.vozvrat_status}')">Yangilash</button>`
      : '';
    return `<tr>
      <td>${y.id}</td>
      <td style="font-size:12px;white-space:nowrap">${vaqt}</td>
      <td>${turEmoji[y.tur]} ${y.tur}</td>
      <td><strong>${y.tovar}</strong>${y.firma ? `<br><small style="opacity:.6">${y.firma}</small>` : ''}</td>
      <td>${y.miqdor} ${y.birlik}</td>
      <td style="white-space:nowrap">${Number(y.summa).toLocaleString()}</td>
      <td>${y.filial}</td>
      <td style="font-size:13px">${y.xodim_ism}</td>
      <td>${status}</td>
      <td>${amallar}</td>
    </tr>`;
  }).join('');
}

function statusOzgartir(id, joriyStatus) {
  const yangiStatus = prompt(
    `Yangi holatni kiriting:\nkutilmoqda / jarayonda / bajarildi / rad_etildi\n\nJoriy: ${joriyStatus || 'kutilmoqda'}`
  );
  if (!yangiStatus) return;
  const validlar = ['kutilmoqda', 'jarayonda', 'bajarildi', 'rad_etildi'];
  if (!validlar.includes(yangiStatus)) return alert('Noto\'g\'ri holat');

  const adminIsm = prompt('Ismingizni kiriting:') || 'Menejer';

  fetch(`/api/vozvrat/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: yangiStatus,
      yangilagan_id: ADMIN_ID,
      yangilagan_ism: adminIsm
    })
  })
  .then(r => r.json())
  .then(d => { if (d.ok) yuklash(); else alert(d.xato); });
}

yuklash();
setInterval(yuklash, 60000);
```

---

## PACKAGE.JSON

```json
{
  "name": "spisaniya-bot",
  "version": "1.0.0",
  "main": "server/index.js",
  "scripts": {
    "start": "node server/index.js",
    "dev": "nodemon server/index.js"
  },
  "dependencies": {
    "dotenv": "^16.0.0",
    "express": "^4.18.0",
    "multer": "^1.4.5",
    "node-fetch": "^3.3.0",
    "pg": "^8.11.0",
    "telegraf": "^4.15.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

---

## DOCKERFILE

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server/index.js"]
```

---

## RAILWAY.TOML

```toml
[build]
builder = "dockerfile"

[deploy]
startCommand = "node server/index.js"
restartPolicyType = "on_failure"
```

---

## DEPLOY QO'LLANMA

```
1. GitHub'ga push qiling

2. railway.app saytiga kiring → New Project → Deploy from GitHub

3. Environment variables qo'shing:
   BOT_TOKEN=...
   GROUP_CHAT_ID=...
   WEBHOOK_URL=https://your-app.railway.app
   DATABASE_URL=...  (Railway PostgreSQL plugin)
   ADMIN_IDS=...
   NODE_ENV=production

4. Railway avtomatik deploy qiladi

5. Telegram'da botga /start yuboring — tayyor!
```

---

## ISHGA TUSHIRISH TEKSHIRUVI

```
✅ Bot /start ga javob beradi
✅ Mini App ochilyapti
✅ Forma 3 bosqichda ishlaydi
✅ Rasm yuklanadi
✅ Guruhga xabar ketadi
✅ Panel http://your-domain/panel da ochiladi
✅ Vozvrat statuslari yangilanadi
✅ 7 kun javob bo'lmasa ogohlantirish keladi
```
