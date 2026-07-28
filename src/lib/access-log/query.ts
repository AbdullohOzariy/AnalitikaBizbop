/**
 * Kirishlar jurnali — O'QISH qatlami (/admin/kirishlar sahifasi uchun).
 *
 * Barcha funksiya davrni Toshkent ISO kunlarida ("YYYY-MM-DD") oladi va
 * `dayKey` ustuni bo'yicha filtrlaydi: matn sifatida ISO tartibi xronologik,
 * `BETWEEN` indeksda ishlaydi va SQL'da hech qanday TZ matematikasi kerak emas.
 *
 * BigInt (`tgUserId`) modul TASHQARISIGA hech qachon chiqmaydi — SQL'da `::text`,
 * Prisma yo'lida `String(...)`. Aks holda Server→Client props chegarasida
 * "BigInt cannot be serialized" xatosi chiqadi.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { AccessSurface } from "@/generated/prisma/enums";

export type Davr = { start: string; end: string };

/** Yuza filtri bo'lsa qo'shiladigan shart (enum raw SQL'da CAST talab qiladi). */
function yuzaShart(surface: AccessSurface | undefined, alias: string) {
  return surface
    ? Prisma.sql`AND ${Prisma.raw(`"${alias}"`)}."surface" = ${surface}::"AccessSurface"`
    : Prisma.empty;
}

// ─── KPI ─────────────────────────────────────────────────────────────────────

export type Kpi = {
  sessions: number; // davrdagi sessiyalar soni
  actors: number; // noyob aktorlar
  avgMin: number; // o'rtacha sessiya davomiyligi (daqiqa)
  totalMin: number; // jami faol vaqt (daqiqa)
  fails: number; // muvaffaqiyatsiz urinish + rad etish + bloklash
};

export async function kirishKpi(d: Davr, surface?: AccessSurface): Promise<Kpi> {
  const [ses] = await prisma.$queryRaw<
    { sessions: number; actors: number; avg_min: number; total_min: number }[]
  >(Prisma.sql`
    SELECT COUNT(*)::int                                                        AS sessions,
           COUNT(DISTINCT s."actorKey")::int                                    AS actors,
           COALESCE(AVG(EXTRACT(EPOCH FROM (s."lastSeenAt" - s."startedAt")) / 60), 0)::float8 AS avg_min,
           COALESCE(SUM(EXTRACT(EPOCH FROM (s."lastSeenAt" - s."startedAt")) / 60), 0)::float8 AS total_min
    FROM "AccessSession" s
    WHERE s."dayKey" BETWEEN ${d.start} AND ${d.end}
    ${yuzaShart(surface, "s")}
  `);

  const [ev] = await prisma.$queryRaw<{ fails: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS fails
    FROM "AccessEvent" e
    WHERE e."dayKey" BETWEEN ${d.start} AND ${d.end}
      AND e."type" <> 'LOGIN_OK'
    ${yuzaShart(surface, "e")}
  `);

  return {
    sessions: ses?.sessions ?? 0,
    actors: ses?.actors ?? 0,
    avgMin: Math.round(ses?.avg_min ?? 0),
    totalMin: Math.round(ses?.total_min ?? 0),
    fails: ev?.fails ?? 0,
  };
}

// ─── Kunlik dinamika ─────────────────────────────────────────────────────────

export type KunQator = { kun: string; sessions: number; actors: number; fails: number };

/**
 * Kunlik qator — BO'SHLIQSIZ (`generate_series`): kirish bo'lmagan kun ham 0 bilan
 * qatorda turadi, aks holda grafik uzilgan ko'rinardi.
 * Sessiya va hodisa boshqa jadvallarda — ikki so'rov, JS'da birlashtiriladi.
 */
export async function kunlikQator(d: Davr, surface?: AccessSurface): Promise<KunQator[]> {
  const [ses, fails] = await Promise.all([
    prisma.$queryRaw<{ kun: string; sessions: number; actors: number }[]>(Prisma.sql`
      SELECT g.s::date::text                    AS kun,
             COUNT(s.id)::int                   AS sessions,
             COUNT(DISTINCT s."actorKey")::int  AS actors
      FROM generate_series(${d.start}::date, ${d.end}::date, '1 day'::interval) AS g(s)
      LEFT JOIN "AccessSession" s
        ON s."dayKey" = g.s::date::text
        -- Ortiqcha ko'rinsa ham SHART: usiz planner butun jadvalni skanlab,
        -- keyin JOIN qilishi mumkin. Bu shart dayKey indeksini ishlatishga majburlaydi.
        AND s."dayKey" BETWEEN ${d.start} AND ${d.end}
        ${surface ? Prisma.sql`AND s."surface" = ${surface}::"AccessSurface"` : Prisma.empty}
      GROUP BY g.s
      ORDER BY g.s
    `),
    prisma.$queryRaw<{ kun: string; fails: number }[]>(Prisma.sql`
      SELECT e."dayKey" AS kun, COUNT(*)::int AS fails
      FROM "AccessEvent" e
      WHERE e."dayKey" BETWEEN ${d.start} AND ${d.end}
        AND e."type" <> 'LOGIN_OK'
      ${yuzaShart(surface, "e")}
      GROUP BY e."dayKey"
    `),
  ]);

  const failMap = new Map(fails.map((f) => [f.kun, f.fails]));
  return ses.map((r) => ({ ...r, fails: failMap.get(r.kun) ?? 0 }));
}

// ─── Soatlik profil ──────────────────────────────────────────────────────────

/**
 * Sessiya BOSHLANISH soati (Toshkent devoriy vaqti, DST yo'q → qat'iy +5).
 * ESLATMA: bu "qaysi soatda faol bo'ldi" emas, "qaysi soatda kirdi" —
 * UI sarlavhasi ham shunday nomlangan.
 */
export async function soatlikProfil(
  d: Davr,
  surface?: AccessSurface
): Promise<{ soat: number; n: number }[]> {
  const rows = await prisma.$queryRaw<{ soat: number; n: number }[]>(Prisma.sql`
    SELECT EXTRACT(HOUR FROM (s."startedAt" + interval '5 hours'))::int AS soat,
           COUNT(*)::int                                                AS n
    FROM "AccessSession" s
    WHERE s."dayKey" BETWEEN ${d.start} AND ${d.end}
    ${yuzaShart(surface, "s")}
    GROUP BY 1
  `);
  const map = new Map(rows.map((r) => [r.soat, r.n]));
  return Array.from({ length: 24 }, (_, soat) => ({ soat, n: map.get(soat) ?? 0 }));
}

// ─── Yuzalar kesimi ──────────────────────────────────────────────────────────

export type YuzaQator = {
  surface: AccessSurface;
  sessions: number;
  actors: number;
  hits: number;
  avgMin: number;
  lastAt: Date | null;
};

export async function yuzaKesim(d: Davr): Promise<YuzaQator[]> {
  const rows = await prisma.$queryRaw<
    {
      surface: AccessSurface;
      sessions: number;
      actors: number;
      hits: number;
      avg_min: number;
      last_at: Date | null;
    }[]
  >(Prisma.sql`
    SELECT s."surface",
           COUNT(*)::int                                                        AS sessions,
           COUNT(DISTINCT s."actorKey")::int                                    AS actors,
           COALESCE(SUM(s."hits"), 0)::int                                      AS hits,
           COALESCE(AVG(EXTRACT(EPOCH FROM (s."lastSeenAt" - s."startedAt")) / 60), 0)::float8 AS avg_min,
           MAX(s."lastSeenAt")                                                  AS last_at
    FROM "AccessSession" s
    WHERE s."dayKey" BETWEEN ${d.start} AND ${d.end}
    GROUP BY s."surface"
    ORDER BY sessions DESC
  `);
  return rows.map((r) => ({
    surface: r.surface,
    sessions: r.sessions,
    actors: r.actors,
    hits: r.hits,
    avgMin: Math.round(r.avg_min),
    lastAt: r.last_at,
  }));
}

// ─── Aktorlar (kim, qancha) ──────────────────────────────────────────────────

export type AktorQator = {
  actorKey: string;
  surface: AccessSurface;
  actorName: string | null;
  userId: number | null;
  tgUserId: string | null; // BigInt EMAS — client chegarasidan o'tishi kerak
  sessions: number;
  hits: number;
  totalMin: number;
  lastAt: Date;
};

export async function aktorlar(
  d: Davr,
  surface?: AccessSurface,
  limit = 200
): Promise<AktorQator[]> {
  return prisma.$queryRaw<AktorQator[]>(Prisma.sql`
    SELECT s."actorKey",
           s."surface",
           MAX(s."actorName")                                                    AS "actorName",
           MAX(s."userId")                                                       AS "userId",
           MAX(s."tgUserId")::text                                               AS "tgUserId",
           COUNT(*)::int                                                         AS sessions,
           COALESCE(SUM(s."hits"), 0)::int                                       AS hits,
           COALESCE(SUM(EXTRACT(EPOCH FROM (s."lastSeenAt" - s."startedAt")) / 60), 0)::int AS "totalMin",
           MAX(s."lastSeenAt")                                                   AS "lastAt"
    FROM "AccessSession" s
    WHERE s."dayKey" BETWEEN ${d.start} AND ${d.end}
    ${yuzaShart(surface, "s")}
    GROUP BY s."actorKey", s."surface"
    ORDER BY "lastAt" DESC
    LIMIT ${limit}
  `);
}

// ─── Xavfsizlik lentasi ──────────────────────────────────────────────────────

export type HodisaQator = {
  id: number;
  surface: AccessSurface;
  type: "LOGIN_FAIL" | "DENIED" | "BLOCKED";
  actorName: string | null;
  login: string | null;
  tgUserId: string | null;
  reason: string | null;
  route: string | null;
  createdAt: Date;
};

/** Muvaffaqiyatsiz urinish / rad etish / bloklash lentasi (eng yangisi birinchi). */
export async function xavfsizlikLenta(d: Davr, limit = 100): Promise<HodisaQator[]> {
  const rows = await prisma.accessEvent.findMany({
    where: {
      dayKey: { gte: d.start, lte: d.end },
      type: { in: ["LOGIN_FAIL", "DENIED", "BLOCKED"] },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      surface: true,
      type: true,
      actorName: true,
      login: true,
      tgUserId: true,
      reason: true,
      route: true,
      createdAt: true,
    },
  });
  // BigInt shu yerda uziladi — tashqariga faqat string chiqadi.
  return rows.map((r) => ({
    ...r,
    type: r.type as HodisaQator["type"],
    tgUserId: r.tgUserId == null ? null : String(r.tgUserId),
  }));
}
