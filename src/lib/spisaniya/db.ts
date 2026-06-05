/**
 * BotBizBopSPS (spisaniya-bot) bazasi — `bizbop` Postgres (Prisma EMAS, alohida pg.Pool).
 *
 * Bot endi alohida servis emas — hammasi shu Next ilovaning ichida. Bu modul
 * bizbop bazasiga ham O'QIYDI (sahifalar), ham YOZADI (miniapp /api/yozuv, vozvrat).
 * `BOT_DATABASE_URL` env sozlanmagan bo'lsa — read funksiyalar bo'sh qaytaradi
 * (sahifa "ulanmagan" holatini ko'rsatadi, crash bo'lmaydi).
 */
import { Pool, type PoolClient } from "pg";
import {
  TUR_LABEL,
  VOZVRAT_HOLATLAR,
  VOZVRAT_HOLAT_LABEL,
  VOZVRAT_YONALISH_LABEL,
  type ChiqimTur,
  type VozvratHolat,
} from "./labels";

// Yorliqlarni shu modul orqali ham eksport qilamiz (mavjud importlar buzilmasin).
export {
  TUR_LABEL,
  VOZVRAT_HOLATLAR,
  VOZVRAT_HOLAT_LABEL,
  VOZVRAT_YONALISH_LABEL,
  type ChiqimTur,
  type VozvratHolat,
};

let _pool: Pool | null = null;

function getPool(): Pool | null {
  const url = process.env.BOT_DATABASE_URL;
  if (!url) return null;
  if (!_pool) {
    _pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
  }
  return _pool;
}

/** Yozish uchun — pool yo'q bo'lsa xato tashlaydi (read'dagidek jim qaytmaydi). */
export function requirePool(): Pool {
  const p = getPool();
  if (!p) throw new Error("BOT_DATABASE_URL sozlanmagan — bizbop bazasiga ulanib bo'lmadi.");
  return p;
}

export function botConfigured(): boolean {
  return !!process.env.BOT_DATABASE_URL;
}

export type ChiqimRange = { start: Date; end: Date };
// sana paramlari (YYYY-MM-DD) — vaqt::date oralig'i bo'yicha filtrlash
function dayParams(range: ChiqimRange): [string, string] {
  return [range.start.toISOString().slice(0, 10), range.end.toISOString().slice(0, 10)];
}

/**
 * Hisobdan chiqarish sahifalari uchun standart davr: JORIY OY boshidan BUGUNGACHA.
 * (Asosiy sotuv bazasiga asoslangan getDefaultRange EMAS — u bizbop'ga mos kelmaydi,
 * bugun qo'shilgan yozuv/vozvrat ko'rinmay qolardi.)
 */
export function chiqimDefaultRange(): ChiqimRange {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, end };
}

/** Tur bo'yicha jami: soni + summa. */
export async function chiqimSummary(
  range: ChiqimRange
): Promise<{ tur: string; count: number; summa: number }[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const { rows } = await p.query(
      `SELECT tur, count(*)::int AS count, COALESCE(sum(summa), 0)::float8 AS summa
       FROM yozuvlar
       WHERE vaqt::date >= $1::date AND vaqt::date <= $2::date
       GROUP BY tur ORDER BY summa DESC`,
      dayParams(range)
    );
    return rows as { tur: string; count: number; summa: number }[];
  } catch {
    return [];
  }
}

/** Filial bo'yicha jami summa + soni. */
export async function chiqimByBranch(
  range: ChiqimRange
): Promise<{ filial: string; count: number; summa: number }[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const { rows } = await p.query(
      `SELECT COALESCE(filial, '—') AS filial, count(*)::int AS count, COALESCE(sum(summa), 0)::float8 AS summa
       FROM yozuvlar
       WHERE vaqt::date >= $1::date AND vaqt::date <= $2::date
       GROUP BY filial ORDER BY summa DESC`,
      dayParams(range)
    );
    return rows as { filial: string; count: number; summa: number }[];
  } catch {
    return [];
  }
}

export type ChiqimRecord = {
  id: number;
  tur: string;
  tovar: string;
  miqdor: number;
  birlik: string;
  summa: number;
  sabab: string | null;
  filial: string;
  firma: string | null;
  kafe_nomi: string | null;
  xodim_ism: string;
  kategoriya: string | null;
  vaqt: string;
  status: string | null;
};

/** Yozuvlar ro'yxati (filtr + sahifalash). */
export async function chiqimRecords(
  range: ChiqimRange,
  opts: { tur?: string; filial?: string; page: number; pageSize: number }
): Promise<{ rows: ChiqimRecord[]; total: number }> {
  const p = getPool();
  if (!p) return { rows: [], total: 0 };
  try {
    const [start, end] = dayParams(range);
    const cond: string[] = ["vaqt::date >= $1::date", "vaqt::date <= $2::date"];
    const params: unknown[] = [start, end];
    if (opts.tur) { params.push(opts.tur); cond.push(`tur = $${params.length}`); }
    if (opts.filial) { params.push(opts.filial); cond.push(`filial = $${params.length}`); }
    const where = cond.join(" AND ");

    const totalRes = await p.query(`SELECT count(*)::int AS n FROM yozuvlar WHERE ${where}`, params);
    const total = (totalRes.rows[0]?.n as number) ?? 0;

    const limit = opts.pageSize;
    const offset = (opts.page - 1) * opts.pageSize;
    const { rows } = await p.query(
      `SELECT id, tur, tovar, miqdor::float8, birlik, summa::float8, sabab, filial, firma,
              kafe_nomi, xodim_ism, kategoriya, vaqt::text, status
       FROM yozuvlar WHERE ${where}
       ORDER BY vaqt DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    return { rows: rows as ChiqimRecord[], total };
  } catch {
    return { rows: [], total: 0 };
  }
}

/** Bot DB'dagi filial nomlari (filtr uchun). */
export async function chiqimFilials(): Promise<string[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const { rows } = await p.query(
      `SELECT DISTINCT filial FROM yozuvlar WHERE filial IS NOT NULL ORDER BY filial`
    );
    return rows.map((r) => r.filial as string);
  } catch {
    return [];
  }
}

// ─── Sozlamalar (read-only ko'rinish) ─────────────────────────────────────────
export async function botFilialar(): Promise<{ id: number; nomi: string; aktiv: boolean }[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const { rows } = await p.query(`SELECT id, nomi, aktiv FROM filialar ORDER BY nomi`);
    return rows as { id: number; nomi: string; aktiv: boolean }[];
  } catch {
    return [];
  }
}

export async function botKategoriyalar(): Promise<{ id: number; nomi: string }[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const { rows } = await p.query(`SELECT id, nomi FROM kategoriyalar ORDER BY nomi`);
    return rows as { id: number; nomi: string }[];
  } catch {
    return [];
  }
}

// ─── YOZISH (miniapp + vozvrat) ───────────────────────────────────────────────

export type YozuvKirim = {
  tur: string;
  tovar: string;
  miqdor: number | string;
  birlik?: string | null;
  summa: number | string;
  sabab?: string | null;
  filial: string;
  firma?: string | null;
  kafe_nomi?: string | null;
  xodim_ism: string;
  xodim_username?: string | null;
  xodim_id: number | string;
  rasm_file_id?: string | null;
};

/**
 * Yangi yozuv qo'shadi (tranzaksiya: yozuvlar + vozvrat bo'lsa vozvrat_nazorat).
 * Yangi yozuv id'sini qaytaradi. Guruhga xabar / AI kategoriya — chaqiruvchi fonda qiladi.
 */
export async function insertYozuv(d: YozuvKirim): Promise<number> {
  const p = requirePool();
  await ensureSozlamalarSchema(); // 'ichki_sotuv' constraint tayyor bo'lsin
  const client: PoolClient = await p.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO yozuvlar
        (tur, tovar, miqdor, birlik, summa, sabab, filial,
         firma, kafe_nomi, xodim_ism, xodim_username, xodim_id, rasm_file_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        d.tur, d.tovar, d.miqdor, d.birlik || "kg", d.summa,
        d.sabab || null, d.filial, d.firma || null, d.kafe_nomi || null,
        d.xodim_ism, d.xodim_username || null, d.xodim_id, d.rasm_file_id || null,
      ]
    );
    const yozuvId = rows[0].id as number;
    if (d.tur === "vozvrat") {
      await client.query(
        `INSERT INTO vozvrat_nazorat (yozuv_id, status) VALUES ($1, 'kutilmoqda')`,
        [yozuvId]
      );
    }
    await client.query("COMMIT");
    return yozuvId;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Yozuvga guruh message_id'ni biriktiradi (xabar yuborilgandan keyin). */
export async function setGuruhMessageId(yozuvId: number, messageId: number): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(`UPDATE yozuvlar SET guruh_message_id=$1 WHERE id=$2`, [messageId, yozuvId]).catch(() => {});
}

/** Miniapp uchun aktiv filial nomlari. */
export async function aktivFilialNomlari(): Promise<string[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const { rows } = await p.query(`SELECT nomi FROM filialar WHERE aktiv = true ORDER BY nomi`);
    return rows.map((r) => r.nomi as string);
  } catch {
    return [];
  }
}

/** Filialning guruh topic_id'si (mavzuli guruh uchun). */
export async function filialTopicId(filial: string): Promise<number | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const { rows } = await p.query(
      `SELECT topic_id FROM filialar WHERE nomi=$1 AND aktiv=true LIMIT 1`,
      [filial]
    );
    return rows[0]?.topic_id ? Number(rows[0].topic_id) : null;
  } catch {
    return null;
  }
}

/** GROUP_CHAT_ID — avval env, keyin bizbop sozlamalar jadvali (5 daqiqa kesh). */
let _chatIdCache: { val: string | null; at: number } | null = null;
export async function getGroupChatId(): Promise<string | null> {
  if (process.env.GROUP_CHAT_ID) return process.env.GROUP_CHAT_ID;
  const now = Date.now();
  if (_chatIdCache && now - _chatIdCache.at < 5 * 60_000) return _chatIdCache.val;
  const p = getPool();
  let val: string | null = null;
  if (p) {
    try {
      const { rows } = await p.query(`SELECT qiymat FROM sozlamalar WHERE kalit='GROUP_CHAT_ID'`);
      val = rows[0]?.qiymat ?? null;
    } catch { /* sozlamalar jadvali yo'q bo'lishi mumkin */ }
  }
  _chatIdCache = { val, at: now };
  return val;
}

/** GROUP_CHAT_ID keshini tozalaydi (sozlamalar yangilanganda chaqiriladi). */
export function clearChatIdCache(): void {
  _chatIdCache = null;
}

/** AI kategoriyalash uchun mavjud kategoriya nomlari. */
export async function kategoriyaNomlari(): Promise<string[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const { rows } = await p.query(`SELECT nomi FROM kategoriyalar ORDER BY nomi`);
    return rows.map((r) => r.nomi as string);
  } catch {
    return [];
  }
}

/** Kategoriyani yozuvga yozadi (mavjud bo'lmasa kategoriyalar jadvaliga qo'shadi) — atomik. */
export async function yozuvKategoriyaSaqla(yozuvId: number, kategoriya: string): Promise<void> {
  const p = requirePool();
  const client: PoolClient = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO kategoriyalar (nomi) VALUES ($1) ON CONFLICT (nomi) DO NOTHING`, [kategoriya]);
    await client.query(`UPDATE yozuvlar SET kategoriya=$1 WHERE id=$2`, [kategoriya, yozuvId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Kategoriyasi yo'q yozuvlar (backfill uchun). */
export async function kategoriyasizYozuvlar(limit: number): Promise<{ id: number; tovar: string }[]> {
  const p = getPool();
  if (!p) return [];
  const { rows } = await p.query(
    `SELECT id, tovar FROM yozuvlar WHERE kategoriya IS NULL OR kategoriya=''
     ORDER BY vaqt DESC LIMIT $1`,
    [limit]
  );
  return rows as { id: number; tovar: string }[];
}


// ─── SOZLAMALAR boshqaruvi (eski admin panel → Hisobdan chiqarish) ─────────────

/** Sozlamalar uchun kerakli jadval/ustunlar mavjudligini ta'minlaydi (bir marta). */
let _schemaReady = false;
export async function ensureSozlamalarSchema(): Promise<void> {
  if (_schemaReady) return;
  const p = requirePool();
  await p.query(`CREATE TABLE IF NOT EXISTS sozlamalar (
    kalit TEXT PRIMARY KEY, qiymat TEXT NOT NULL, yangilangan TIMESTAMPTZ DEFAULT NOW()
  )`);
  await p.query(`ALTER TABLE filialar ADD COLUMN IF NOT EXISTS topic_id BIGINT`).catch(() => {});
  // yozuvlar.tur CHECK — 'ichki_sotuv' qo'shamiz. DROP+ADD bitta DO-blokda (atomik):
  // ADD muvaffaqiyatsiz bo'lsa DROP ham qaytariladi, jadval constraintsiz qolmaydi.
  await p.query(`
    DO $$ BEGIN
      ALTER TABLE yozuvlar DROP CONSTRAINT IF EXISTS yozuvlar_tur_check;
      ALTER TABLE yozuvlar ADD CONSTRAINT yozuvlar_tur_check
        CHECK (tur IN ('spisaniya','vozvrat','kafe','ovqatlanish','ichki_sotuv'));
    EXCEPTION WHEN others THEN
      RAISE WARNING 'yozuvlar_tur_check yangilanmadi: %', SQLERRM;
    END $$;
  `).catch((e) => console.error("[ensureSchema] tur_check:", e instanceof Error ? e.message : e));
  await p.query(`CREATE TABLE IF NOT EXISTS kategoriyalar (
    id SERIAL PRIMARY KEY, nomi VARCHAR(100) NOT NULL UNIQUE, yaratilgan TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {});
  // Botdan foydalanishga ruxsati bor xodimlar (whitelist).
  await p.query(`CREATE TABLE IF NOT EXISTS bot_ruxsat (
    telegram_id BIGINT PRIMARY KEY,
    ism         TEXT,
    aktiv       BOOLEAN DEFAULT true,
    qoshgan     TEXT,
    vaqt        TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {});
  // Vozvratlar (firmaga/asosiy filialga qaytarish) — alohida jarayon (kanban).
  await p.query(`CREATE TABLE IF NOT EXISTS vozvratlar (
    id                SERIAL PRIMARY KEY,
    tovar             VARCHAR(255) NOT NULL,
    miqdor            DECIMAL(10,3) NOT NULL,
    birlik            VARCHAR(20) NOT NULL DEFAULT 'dona',
    summa             DECIMAL(15,2) NOT NULL,
    sabab             VARCHAR(255),
    filial            VARCHAR(100) NOT NULL,
    yonalish          VARCHAR(20) NOT NULL DEFAULT 'asosiy_filial',
    taminotchi        VARCHAR(255),
    rasm_file_id      VARCHAR(500),
    xodim_ism         VARCHAR(255),
    xodim_username    VARCHAR(255),
    xodim_id          BIGINT,
    status            VARCHAR(30) NOT NULL DEFAULT 'xabar_berildi',
    qaytarilmadi_sabab TEXT,
    chiqim_yozuv_id   INTEGER,
    guruh_message_id  BIGINT,
    vaqt              TIMESTAMP DEFAULT NOW(),
    yangilangan       TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {});
  _schemaReady = true;
}

// ─── VOZVRATLAR (yangi qaytarish jarayoni) ────────────────────────────────────
export type VozvratKirim = {
  tovar: string;
  miqdor: number | string;
  birlik?: string | null;
  summa: number | string;
  sabab?: string | null;
  filial: string;
  yonalish: string;
  taminotchi?: string | null;
  rasm_file_id?: string | null;
  xodim_ism: string;
  xodim_username?: string | null;
  xodim_id: number | string;
  status?: string;
  qaytarilmadi_sabab?: string | null;
};

export type VozvratYozuv = {
  id: number;
  tovar: string;
  miqdor: number;
  birlik: string;
  summa: number;
  sabab: string | null;
  filial: string;
  yonalish: string;
  taminotchi: string | null;
  rasm_file_id: string | null;
  xodim_ism: string | null;
  status: string;
  qaytarilmadi_sabab: string | null;
  chiqim_yozuv_id: number | null;
  vaqt: string;
};

const VOZVRAT_COLS = `id, tovar, miqdor::float8, birlik, summa::float8, sabab, filial,
  yonalish, taminotchi, rasm_file_id, xodim_ism, status, qaytarilmadi_sabab,
  chiqim_yozuv_id, vaqt::text`;

/** Yangi vozvrat yaratadi (status xodim tomonidan tanlanadi). id qaytaradi. */
export async function vozvratYarat(d: VozvratKirim): Promise<number> {
  const p = requirePool();
  await ensureSozlamalarSchema();
  const status = VOZVRAT_HOLATLAR.includes(d.status as VozvratHolat) ? d.status : "xabar_berildi";
  const yonalish = d.yonalish === "taminotchi" ? "taminotchi" : "asosiy_filial";
  const { rows } = await p.query(
    `INSERT INTO vozvratlar
       (tovar, miqdor, birlik, summa, sabab, filial, yonalish, taminotchi,
        rasm_file_id, xodim_ism, xodim_username, xodim_id, status, qaytarilmadi_sabab)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      d.tovar, d.miqdor, d.birlik || "dona", d.summa, d.sabab || null, d.filial,
      yonalish, yonalish === "taminotchi" ? d.taminotchi || null : null,
      d.rasm_file_id || null, d.xodim_ism, d.xodim_username || null, d.xodim_id,
      status, status === "qaytarilmadi" ? d.qaytarilmadi_sabab || null : null,
    ]
  );
  return rows[0].id as number;
}

export async function vozvratSetGuruhMessageId(id: number, messageId: number): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(`UPDATE vozvratlar SET guruh_message_id=$1 WHERE id=$2`, [messageId, id]).catch(() => {});
}

export async function vozvratById(id: number): Promise<VozvratYozuv | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const { rows } = await p.query(`SELECT ${VOZVRAT_COLS} FROM vozvratlar WHERE id=$1`, [id]);
    return (rows[0] as VozvratYozuv) ?? null;
  } catch {
    return null;
  }
}

/** Kanban uchun: konvertatsiya qilinmagan (ochiq) vozvratlar — davr + filial filtri. */
export async function vozvratKanban(
  range: ChiqimRange,
  filial?: string
): Promise<VozvratYozuv[]> {
  const p = getPool();
  if (!p) return [];
  try {
    await ensureSozlamalarSchema();
    const [start, end] = dayParams(range);
    const cond = ["vaqt::date >= $1::date", "vaqt::date <= $2::date", "chiqim_yozuv_id IS NULL"];
    const params: unknown[] = [start, end];
    if (filial) { params.push(filial); cond.push(`filial = $${params.length}`); }
    const { rows } = await p.query(
      `SELECT ${VOZVRAT_COLS} FROM vozvratlar WHERE ${cond.join(" AND ")} ORDER BY vaqt DESC`,
      params
    );
    return rows as VozvratYozuv[];
  } catch {
    return [];
  }
}

/** Yuqori summary: qaytarilgan va qaytarilmagan summa (davr bo'yicha). */
export async function vozvratSummary(
  range: ChiqimRange,
  filial?: string
): Promise<{ qaytarildiSumma: number; qaytarilmadiSumma: number; jamiSoni: number }> {
  const p = getPool();
  if (!p) return { qaytarildiSumma: 0, qaytarilmadiSumma: 0, jamiSoni: 0 };
  try {
    await ensureSozlamalarSchema();
    const [start, end] = dayParams(range);
    // Kanban bilan izchil: faqat ochiq (hisobdan chiqarishga o'tkazilmagan) vozvratlar.
    const cond = ["vaqt::date >= $1::date", "vaqt::date <= $2::date", "chiqim_yozuv_id IS NULL"];
    const params: unknown[] = [start, end];
    if (filial) { params.push(filial); cond.push(`filial = $${params.length}`); }
    const { rows } = await p.query(
      `SELECT
         COALESCE(SUM(summa) FILTER (WHERE status='qaytarildi'), 0)::float8    AS qaytarildi,
         COALESCE(SUM(summa) FILTER (WHERE status='qaytarilmadi'), 0)::float8  AS qaytarilmadi,
         COUNT(*)::int AS jami
       FROM vozvratlar WHERE ${cond.join(" AND ")}`,
      params
    );
    return {
      qaytarildiSumma: rows[0].qaytarildi as number,
      qaytarilmadiSumma: rows[0].qaytarilmadi as number,
      jamiSoni: rows[0].jami as number,
    };
  } catch {
    return { qaytarildiSumma: 0, qaytarilmadiSumma: 0, jamiSoni: 0 };
  }
}

/** Vozvrat statusini yangilaydi. Yangilangan yozuvni qaytaradi (guruh xabari uchun). */
export async function vozvratHolatYangila(
  id: number,
  status: string,
  qaytarilmadiSabab: string | null
): Promise<VozvratYozuv | null> {
  if (!VOZVRAT_HOLATLAR.includes(status as VozvratHolat)) throw new Error("Noto'g'ri status");
  const p = requirePool();
  const { rows } = await p.query(
    `UPDATE vozvratlar
       SET status=$1::text,
           qaytarilmadi_sabab = CASE WHEN $1::text='qaytarilmadi' THEN $2 ELSE NULL END,
           yangilangan=NOW()
     WHERE id=$3 AND chiqim_yozuv_id IS NULL
     RETURNING ${VOZVRAT_COLS}`,
    [status, qaytarilmadiSabab, id]
  );
  return (rows[0] as VozvratYozuv) ?? null;
}

/**
 * Vozvratni hisobdan chiqarish turiga o'tkazadi (qaytarilmadi → spisaniya/kafe/...).
 * yozuvlar'ga yozuv yaratadi va vozvrat.chiqim_yozuv_id'ni biriktiradi (kanbandan chiqadi).
 */
export async function vozvratChiqimgaOtkaz(
  id: number,
  tur: string,
  sabab: string | null
): Promise<{ yozuvId: number; vozvrat: VozvratYozuv } | null> {
  const p = requirePool();
  await ensureSozlamalarSchema();
  const client: PoolClient = await p.connect();
  try {
    await client.query("BEGIN");
    const { rows: vr } = await client.query(
      `SELECT * FROM vozvratlar WHERE id=$1 AND chiqim_yozuv_id IS NULL FOR UPDATE`,
      [id]
    );
    if (!vr.length) { await client.query("ROLLBACK"); return null; }
    const v = vr[0];
    const { rows: yz } = await client.query(
      `INSERT INTO yozuvlar
         (tur, tovar, miqdor, birlik, summa, sabab, filial,
          xodim_ism, xodim_username, xodim_id, rasm_file_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        tur, v.tovar, v.miqdor, v.birlik, v.summa,
        sabab || v.qaytarilmadi_sabab || v.sabab || null, v.filial,
        v.xodim_ism, v.xodim_username, v.xodim_id || 0, v.rasm_file_id,
      ]
    );
    const yozuvId = yz[0].id as number;
    const { rows: upd } = await client.query(
      `UPDATE vozvratlar SET chiqim_yozuv_id=$1, yangilangan=NOW()
       WHERE id=$2 RETURNING ${VOZVRAT_COLS}`,
      [yozuvId, id]
    );
    await client.query("COMMIT");
    return { yozuvId, vozvrat: upd[0] as VozvratYozuv };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Vozvrat maydonlarini tahrirlaydi (admin). Faqat ochiq (chiqimga o'tkazilmagan) vozvratlar. */
export async function vozvratYangila(
  id: number,
  patch: {
    tovar?: string;
    miqdor?: number;
    birlik?: string;
    summa?: number;
    sabab?: string | null;
    filial?: string;
    yonalish?: string;
    taminotchi?: string | null;
    status?: string;
    qaytarilmadi_sabab?: string | null;
  }
): Promise<VozvratYozuv | null> {
  if (patch.status !== undefined && !VOZVRAT_HOLATLAR.includes(patch.status as VozvratHolat))
    throw new Error("Noto'g'ri status");
  const p = requirePool();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const add = (col: string, val: unknown) => { sets.push(`${col}=$${i++}`); vals.push(val); };
  if (patch.tovar !== undefined) add("tovar", patch.tovar);
  if (patch.miqdor !== undefined) add("miqdor", patch.miqdor);
  if (patch.birlik !== undefined) add("birlik", patch.birlik);
  if (patch.summa !== undefined) add("summa", patch.summa);
  if (patch.sabab !== undefined) add("sabab", patch.sabab);
  if (patch.filial !== undefined) add("filial", patch.filial);
  if (patch.yonalish !== undefined) add("yonalish", patch.yonalish);
  if (patch.taminotchi !== undefined) add("taminotchi", patch.taminotchi);
  if (patch.status !== undefined) add("status", patch.status);
  if (patch.qaytarilmadi_sabab !== undefined) add("qaytarilmadi_sabab", patch.qaytarilmadi_sabab);
  if (!sets.length) return null;
  sets.push("yangilangan=NOW()");
  vals.push(id);
  const { rows } = await p.query(
    `UPDATE vozvratlar SET ${sets.join(",")} WHERE id=$${i} AND chiqim_yozuv_id IS NULL RETURNING ${VOZVRAT_COLS}`,
    vals
  );
  return (rows[0] as VozvratYozuv) ?? null;
}

/** Vozvratni o'chiradi (faqat ochiq — chiqimga o'tkazilmagan). */
export async function vozvratOchir(id: number): Promise<void> {
  const p = requirePool();
  await p.query(`DELETE FROM vozvratlar WHERE id=$1 AND chiqim_yozuv_id IS NULL`, [id]);
}

// ─── Bot ruxsati (whitelist) ──────────────────────────────────────────────────
export type BotRuxsat = { telegram_id: string; ism: string | null; aktiv: boolean; qoshgan: string | null; vaqt: string };

/** Ruxsat berilgan foydalanuvchilar ro'yxati. */
export async function ruxsatList(): Promise<BotRuxsat[]> {
  const p = getPool();
  if (!p) return [];
  try {
    await ensureSozlamalarSchema();
    const { rows } = await p.query(
      `SELECT telegram_id::text, ism, aktiv, qoshgan, vaqt::text FROM bot_ruxsat ORDER BY vaqt DESC`
    );
    return rows as BotRuxsat[];
  } catch {
    return [];
  }
}

/** Telegram ID botdan foydalana oladimi (aktiv whitelist'da bormi). */
export async function ruxsatBormi(telegramId: number | string): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await ensureSozlamalarSchema();
    const { rows } = await p.query(
      `SELECT 1 FROM bot_ruxsat WHERE telegram_id=$1 AND aktiv=true LIMIT 1`,
      [String(telegramId)]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function ruxsatQoshish(telegramId: string, ism: string | null, qoshgan: string): Promise<BotRuxsat> {
  const p = requirePool();
  await ensureSozlamalarSchema();
  const { rows } = await p.query(
    `INSERT INTO bot_ruxsat (telegram_id, ism, qoshgan) VALUES ($1,$2,$3)
     ON CONFLICT (telegram_id) DO UPDATE SET ism=EXCLUDED.ism, aktiv=true
     RETURNING telegram_id::text, ism, aktiv, qoshgan, vaqt::text`,
    [telegramId, ism, qoshgan]
  );
  return rows[0] as BotRuxsat;
}

export async function ruxsatToggle(telegramId: string, aktiv: boolean): Promise<void> {
  const p = requirePool();
  await p.query(`UPDATE bot_ruxsat SET aktiv=$1 WHERE telegram_id=$2`, [aktiv, telegramId]);
}

export async function ruxsatOchir(telegramId: string): Promise<void> {
  const p = requirePool();
  await p.query(`DELETE FROM bot_ruxsat WHERE telegram_id=$1`, [telegramId]);
}

export type FilialToliq = { id: number; nomi: string; aktiv: boolean; topic_id: string | null };

/** Barcha filiallar (topic_id bilan, boshqaruv uchun). */
export async function filialarToliq(): Promise<FilialToliq[]> {
  const p = getPool();
  if (!p) return [];
  try {
    await ensureSozlamalarSchema();
    const { rows } = await p.query(
      `SELECT id, nomi, aktiv, topic_id::text FROM filialar ORDER BY nomi`
    );
    return rows as FilialToliq[];
  } catch {
    return [];
  }
}

/** Yangi filial qo'shadi. */
export async function filialQoshish(nomi: string): Promise<FilialToliq> {
  const p = requirePool();
  await ensureSozlamalarSchema();
  const { rows } = await p.query(
    `INSERT INTO filialar (nomi, aktiv) VALUES ($1, true) RETURNING id, nomi, aktiv, topic_id::text`,
    [nomi]
  );
  return rows[0] as FilialToliq;
}

/** Filialni yangilaydi (nomi / aktiv / topic_id). */
export async function filialYangila(
  id: number,
  patch: { nomi?: string; aktiv?: boolean; topic_id?: string | null }
): Promise<FilialToliq | null> {
  const p = requirePool();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.nomi !== undefined) { sets.push(`nomi=$${i++}`); vals.push(patch.nomi); }
  if (patch.aktiv !== undefined) { sets.push(`aktiv=$${i++}`); vals.push(patch.aktiv); }
  if (patch.topic_id !== undefined) { sets.push(`topic_id=$${i++}`); vals.push(patch.topic_id || null); }
  if (!sets.length) return null;
  vals.push(id);
  const { rows } = await p.query(
    `UPDATE filialar SET ${sets.join(",")} WHERE id=$${i} RETURNING id, nomi, aktiv, topic_id::text`,
    vals
  );
  return (rows[0] as FilialToliq) ?? null;
}

/** Filialni o'chiradi (yozuvlari bo'lsa FK xatosi qaytadi). */
export async function filialOchir(id: number): Promise<void> {
  const p = requirePool();
  await p.query(`DELETE FROM filialar WHERE id=$1`, [id]);
}

/** Guruh chat_id — sozlamalardan o'qiydi (env emas). */
export async function guruhChatIdOl(): Promise<string> {
  const p = getPool();
  if (!p) return "";
  try {
    await ensureSozlamalarSchema();
    const { rows } = await p.query(`SELECT qiymat FROM sozlamalar WHERE kalit='GROUP_CHAT_ID'`);
    return rows[0]?.qiymat ?? "";
  } catch {
    return "";
  }
}

/** Guruh chat_id'ni saqlaydi (sozlamalar) va keshni tozalaydi. */
export async function guruhChatIdSaqla(chatId: string): Promise<void> {
  const p = requirePool();
  await ensureSozlamalarSchema();
  await p.query(
    `INSERT INTO sozlamalar (kalit, qiymat, yangilangan) VALUES ('GROUP_CHAT_ID', $1, NOW())
     ON CONFLICT (kalit) DO UPDATE SET qiymat=$1, yangilangan=NOW()`,
    [chatId]
  );
  clearChatIdCache();
}

export type KategoriyaSoni = { id: number; nomi: string; soni: number };

/** Kategoriyalar + har biriga tegishli yozuvlar soni. */
export async function kategoriyalarSoni(): Promise<KategoriyaSoni[]> {
  const p = getPool();
  if (!p) return [];
  try {
    await ensureSozlamalarSchema();
    const { rows } = await p.query(
      `SELECT k.id, k.nomi, COUNT(y.id)::int AS soni
       FROM kategoriyalar k LEFT JOIN yozuvlar y ON y.kategoriya = k.nomi
       GROUP BY k.id, k.nomi ORDER BY k.nomi`
    );
    return rows as KategoriyaSoni[];
  } catch {
    return [];
  }
}

export async function kategoriyaQoshish(nomi: string): Promise<{ id: number; nomi: string }> {
  const p = requirePool();
  await ensureSozlamalarSchema();
  const { rows } = await p.query(
    `INSERT INTO kategoriyalar (nomi) VALUES ($1) RETURNING id, nomi`,
    [nomi.slice(0, 100)]
  );
  return rows[0] as { id: number; nomi: string };
}

/** Kategoriya nomini o'zgartiradi + yozuvlardagi eski nomni ham yangilaydi. */
export async function kategoriyaYangila(id: number, yangiNomi: string): Promise<{ id: number; nomi: string } | null> {
  const p = requirePool();
  const client: PoolClient = await p.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT nomi FROM kategoriyalar WHERE id=$1 FOR UPDATE`, [id]);
    if (!rows.length) { await client.query("ROLLBACK"); return null; }
    const eski = rows[0].nomi as string;
    const { rows: yangi } = await client.query(
      `UPDATE kategoriyalar SET nomi=$1 WHERE id=$2 RETURNING id, nomi`,
      [yangiNomi.slice(0, 100), id]
    );
    await client.query(`UPDATE yozuvlar SET kategoriya=$1 WHERE kategoriya=$2`, [yangi[0].nomi, eski]);
    await client.query("COMMIT");
    return yangi[0] as { id: number; nomi: string };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Kategoriyani o'chiradi (yozuvlardagi kategoriyani bo'shatadi, yozuvlar o'chmaydi). */
export async function kategoriyaOchir(id: number): Promise<void> {
  const p = requirePool();
  const client: PoolClient = await p.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT nomi FROM kategoriyalar WHERE id=$1`, [id]);
    if (rows.length) {
      await client.query(`UPDATE yozuvlar SET kategoriya=NULL WHERE kategoriya=$1`, [rows[0].nomi]);
      await client.query(`DELETE FROM kategoriyalar WHERE id=$1`, [id]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─── Admin: yozuv tahrirlash / o'chirish ─────────────────────────────────────

/**
 * Mavjud yozuvni qisman yangilaydi (faqat berilgan maydonlar SET qilinadi).
 * Hech narsa berilmasa null qaytaradi; topilmasa ham null qaytaradi.
 */
export async function yozuvYangila(
  id: number,
  patch: {
    tur?: string;
    tovar?: string;
    miqdor?: number;
    birlik?: string;
    summa?: number;
    sabab?: string | null;
    filial?: string;
    kategoriya?: string | null;
  }
): Promise<ChiqimRecord | null> {
  const p = requirePool();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.tur !== undefined)       { sets.push(`tur=$${i++}`);       vals.push(patch.tur); }
  if (patch.tovar !== undefined)     { sets.push(`tovar=$${i++}`);     vals.push(patch.tovar); }
  if (patch.miqdor !== undefined)    { sets.push(`miqdor=$${i++}`);    vals.push(patch.miqdor); }
  if (patch.birlik !== undefined)    { sets.push(`birlik=$${i++}`);    vals.push(patch.birlik); }
  if (patch.summa !== undefined)     { sets.push(`summa=$${i++}`);     vals.push(patch.summa); }
  if (patch.sabab !== undefined)     { sets.push(`sabab=$${i++}`);     vals.push(patch.sabab); }
  if (patch.filial !== undefined)    { sets.push(`filial=$${i++}`);    vals.push(patch.filial); }
  if (patch.kategoriya !== undefined){ sets.push(`kategoriya=$${i++}`); vals.push(patch.kategoriya); }
  if (!sets.length) return null;
  vals.push(id);
  const { rows } = await p.query(
    `UPDATE yozuvlar SET ${sets.join(", ")} WHERE id=$${i}
     RETURNING id, tur, tovar, miqdor::float8, birlik, summa::float8, sabab,
               filial, firma, kafe_nomi, xodim_ism, kategoriya, vaqt::text, status`,
    vals
  );
  return (rows[0] as ChiqimRecord) ?? null;
}

/**
 * Yozuvni tranzaksiyada o'chiradi.
 * vozvratlar.chiqim_yozuv_id → NULL (FK buzilmasin).
 * vozvrat_nazorat.yozuv_id   → DELETE (jadval bo'lmasligi mumkin — .catch bilan o'tadi).
 * Keyin yozuvlar jadvalidan DELETE.
 */
export async function yozuvOchir(id: number): Promise<void> {
  const p = requirePool();
  const client: PoolClient = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE vozvratlar SET chiqim_yozuv_id=NULL WHERE chiqim_yozuv_id=$1`,
      [id]
    );
    await client.query(
      `DELETE FROM vozvrat_nazorat WHERE yozuv_id=$1`,
      [id]
    ).catch(() => {/* vozvrat_nazorat jadvali bo'lmasligi mumkin */});
    await client.query(`DELETE FROM yozuvlar WHERE id=$1`, [id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Kategoriya bo'yicha agregatsiya — davr filtri. */
export async function chiqimByKategoriya(
  range: ChiqimRange
): Promise<{ kategoriya: string; count: number; summa: number }[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const { rows } = await p.query(
      `SELECT COALESCE(NULLIF(kategoriya, ''), '—') AS kategoriya,
              count(*)::int AS count,
              COALESCE(sum(summa), 0)::float8 AS summa
       FROM yozuvlar
       WHERE vaqt::date >= $1::date AND vaqt::date <= $2::date
       GROUP BY 1 ORDER BY summa DESC`,
      dayParams(range)
    );
    return rows as { kategoriya: string; count: number; summa: number }[];
  } catch {
    return [];
  }
}

/**
 * Excel eksport uchun yozuvlar (sahifalashsiz, LIMIT 50000).
 * tur va filial optional filtrlar.
 */
export async function chiqimExportRows(
  range: ChiqimRange,
  opts: { tur?: string; filial?: string }
): Promise<ChiqimRecord[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const [start, end] = dayParams(range);
    const cond: string[] = ["vaqt::date >= $1::date", "vaqt::date <= $2::date"];
    const params: unknown[] = [start, end];
    if (opts.tur)    { params.push(opts.tur);    cond.push(`tur = $${params.length}`); }
    if (opts.filial) { params.push(opts.filial); cond.push(`filial = $${params.length}`); }
    const where = cond.join(" AND ");
    const { rows } = await p.query(
      `SELECT id, tur, tovar, miqdor::float8, birlik, summa::float8, sabab, filial, firma,
              kafe_nomi, xodim_ism, kategoriya, vaqt::text, status
       FROM yozuvlar WHERE ${where}
       ORDER BY vaqt DESC LIMIT 50000`,
      params
    );
    return rows as ChiqimRecord[];
  } catch {
    return [];
  }
}
