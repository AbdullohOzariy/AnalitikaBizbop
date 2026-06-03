/**
 * BotBizBopSPS (spisaniya-bot) bazasi — `bizbop` Postgres (Prisma EMAS, alohida pg.Pool).
 *
 * Bot endi alohida servis emas — hammasi shu Next ilovaning ichida. Bu modul
 * bizbop bazasiga ham O'QIYDI (sahifalar), ham YOZADI (miniapp /api/yozuv, vozvrat).
 * `BOT_DATABASE_URL` env sozlanmagan bo'lsa — read funksiyalar bo'sh qaytaradi
 * (sahifa "ulanmagan" holatini ko'rsatadi, crash bo'lmaydi).
 */
import { Pool, type PoolClient } from "pg";

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
export type ChiqimTur = "spisaniya" | "vozvrat" | "kafe" | "ovqatlanish" | "ichki_sotuv";

export const TUR_LABEL: Record<string, string> = {
  spisaniya: "Spisaniya",
  vozvrat: "Qayta ishlash",
  kafe: "Kafe",
  ovqatlanish: "Ovqatlanish",
  ichki_sotuv: "Ichki sotuv",
};

// sana paramlari (YYYY-MM-DD) — vaqt::date oralig'i bo'yicha filtrlash
function dayParams(range: ChiqimRange): [string, string] {
  return [range.start.toISOString().slice(0, 10), range.end.toISOString().slice(0, 10)];
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

// ─── Vozvrat nazorati ─────────────────────────────────────────────────────────
export const VOZVRAT_STATUS_LABEL: Record<string, string> = {
  kutilmoqda: "Kutilmoqda",
  jarayonda: "Jarayonda",
  bajarildi: "Bajarildi",
  rad_etildi: "Rad etildi",
};

export type VozvratRecord = {
  id: number;
  tovar: string;
  miqdor: number;
  birlik: string;
  summa: number;
  sabab: string | null;
  filial: string;
  firma: string | null;
  xodim_ism: string;
  vaqt: string;
  vozvrat_status: string | null;
  firma_javob: string | null;
  muddat: string | null;
};

/** Vozvrat yozuvlari + nazorat holati (yozuvlar ⨝ vozvrat_nazorat). */
export async function vozvratList(
  range: ChiqimRange,
  opts: { filial?: string; status?: string; page: number; pageSize: number }
): Promise<{ rows: VozvratRecord[]; total: number }> {
  const p = getPool();
  if (!p) return { rows: [], total: 0 };
  try {
    const [start, end] = dayParams(range);
    const cond: string[] = ["y.tur = 'vozvrat'", "y.vaqt::date >= $1::date", "y.vaqt::date <= $2::date"];
    const params: unknown[] = [start, end];
    if (opts.filial) { params.push(opts.filial); cond.push(`y.filial = $${params.length}`); }
    if (opts.status) { params.push(opts.status); cond.push(`COALESCE(vn.status, 'kutilmoqda') = $${params.length}`); }
    const where = cond.join(" AND ");
    const join = `FROM yozuvlar y LEFT JOIN vozvrat_nazorat vn ON vn.yozuv_id = y.id WHERE ${where}`;

    const totalRes = await p.query(`SELECT count(*)::int AS n ${join}`, params);
    const total = (totalRes.rows[0]?.n as number) ?? 0;

    const offset = (opts.page - 1) * opts.pageSize;
    const { rows } = await p.query(
      `SELECT y.id, y.tovar, y.miqdor::float8, y.birlik, y.summa::float8, y.sabab, y.filial,
              y.firma, y.xodim_ism, y.vaqt::text,
              COALESCE(vn.status, 'kutilmoqda') AS vozvrat_status, vn.firma_javob, vn.muddat::text
       ${join}
       ORDER BY y.vaqt DESC
       LIMIT ${opts.pageSize} OFFSET ${offset}`,
      params
    );
    return { rows: rows as VozvratRecord[], total };
  } catch {
    return { rows: [], total: 0 };
  }
}

/** Vozvrat status bo'yicha soni (davr). */
export async function vozvratStatusCounts(
  range: ChiqimRange
): Promise<{ status: string; count: number }[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const { rows } = await p.query(
      `SELECT COALESCE(vn.status, 'kutilmoqda') AS status, count(*)::int AS count
       FROM yozuvlar y LEFT JOIN vozvrat_nazorat vn ON vn.yozuv_id = y.id
       WHERE y.tur = 'vozvrat' AND y.vaqt::date >= $1::date AND y.vaqt::date <= $2::date
       GROUP BY 1 ORDER BY count DESC`,
      dayParams(range)
    );
    return rows as { status: string; count: number }[];
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

/** Kategoriyani yozuvga yozadi (mavjud bo'lmasa kategoriyalar jadvaliga qo'shadi). */
export async function yozuvKategoriyaSaqla(yozuvId: number, kategoriya: string): Promise<void> {
  const p = requirePool();
  await p.query(`INSERT INTO kategoriyalar (nomi) VALUES ($1) ON CONFLICT (nomi) DO NOTHING`, [kategoriya]);
  await p.query(`UPDATE yozuvlar SET kategoriya=$1 WHERE id=$2`, [kategoriya, yozuvId]);
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

/**
 * Vozvrat nazorati statusini yangilaydi (in-process — eski bot HTTP API o'rniga).
 * Topilsa yozuv (tovar, firma) ma'lumotini qaytaradi (Telegram xabari uchun), aks holda null.
 */
export async function vozvratStatusYangila(
  yozuvId: number,
  status: string,
  firmaJavob: string | null,
  yangilaganIsm: string
): Promise<{ tovar: string; firma: string | null } | null> {
  const p = requirePool();
  const { rows } = await p.query(
    `UPDATE vozvrat_nazorat
       SET status=$1, firma_javob=$2, yangilagan_id=NULL,
           yangilagan_ism=$3, yangilangan_vaqt=NOW()
     WHERE yozuv_id=$4
     RETURNING yozuv_id`,
    [status, firmaJavob, yangilaganIsm, yozuvId]
  );
  if (!rows.length) return null;
  const { rows: t } = await p.query(`SELECT tovar, firma FROM yozuvlar WHERE id=$1`, [yozuvId]);
  return t.length ? { tovar: t[0].tovar as string, firma: (t[0].firma as string) ?? null } : { tovar: "", firma: null };
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
  // yozuvlar.tur CHECK — yangi 'ichki_sotuv' turini qo'shamiz.
  await p.query(`ALTER TABLE yozuvlar DROP CONSTRAINT IF EXISTS yozuvlar_tur_check`).catch(() => {});
  await p.query(
    `ALTER TABLE yozuvlar ADD CONSTRAINT yozuvlar_tur_check
       CHECK (tur IN ('spisaniya','vozvrat','kafe','ovqatlanish','ichki_sotuv'))`
  ).catch(() => {});
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
  _schemaReady = true;
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
    const { rows } = await client.query(`SELECT nomi FROM kategoriyalar WHERE id=$1`, [id]);
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
