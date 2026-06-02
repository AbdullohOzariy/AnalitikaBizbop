/**
 * BotBizBopSPS (spisaniya-bot) bazasiga READ-ONLY ko'prik.
 *
 * Bot o'zining `bizbop` Postgres bazasida ishlaydi (Prisma EMAS — alohida pg.Pool).
 * Bu yerda FAQAT SELECT qilinadi — botga hech narsa yozilmaydi.
 * `BOT_DATABASE_URL` env sozlanmagan bo'lsa — barcha funksiyalar bo'sh qaytaradi
 * (sahifa "ulanmagan" holatini ko'rsatadi, crash bo'lmaydi).
 */
import { Pool } from "pg";

let _pool: Pool | null = null;

function getPool(): Pool | null {
  const url = process.env.BOT_DATABASE_URL;
  if (!url) return null;
  if (!_pool) {
    _pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 });
  }
  return _pool;
}

export function botConfigured(): boolean {
  return !!process.env.BOT_DATABASE_URL;
}

export type ChiqimRange = { start: Date; end: Date };
export type ChiqimTur = "spisaniya" | "vozvrat" | "kafe" | "ovqatlanish";

export const TUR_LABEL: Record<string, string> = {
  spisaniya: "Spisaniya",
  vozvrat: "Vozvrat",
  kafe: "Kafe",
  ovqatlanish: "Ovqatlanish",
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
