/**
 * Community hisobot agregatlari — sahifa uchun tayyor raqamlar.
 *
 * MUHIM: kategoriya statistikasi SKU moslikka BOG'LIQ EMAS. Operator "sotuvda mavjud
 * emas" degan mahsulot katalogda ham yo'q bo'ladi — ya'ni assortiment bo'shlig'i aynan
 * SKU topilmagan joyda. Shuning uchun `categoryId` SKU'dan mustaqil to'ldiriladi va
 * hisobot ham shunga tayanadi.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/** Barcha hisobotlarga umumiy filtr. `branchId` — filial kesimi (null = hammasi). */
export interface Filtr {
  chatId: bigint;
  from: string;
  to: string;
  branchId?: number | null;
}

/** Raw SQL uchun filial sharti — `branchId` berilmasa bo'sh. */
const branchSql = (b?: number | null) =>
  b != null ? Prisma.sql`AND r."branchId" = ${b}` : Prisma.empty;

export interface Umumiy {
  jami: number;
  yes: number;
  no: number;
  unanswered: number;
  unclear: number;
  ortachaJavobDaq: number | null;
  javobUlushi: number; // javob berilgan ulush (%)
}

export interface KategoriyaQator {
  categoryId: number | null;
  nom: string;
  parent: string;
  jami: number;
  yes: number;
  no: number;
}

export interface MahsulotQator {
  canonId: number | null;
  /** Kanon nomi; yechilmagan bo'lsa xom `normKey`. */
  nom: string;
  yechilgan: boolean;
  kategoriya: string | null;
  jami: number;
  no: number;
  unanswered: number;
  /** Birinchi va oxirgi "yo'q/javobsiz" kuni — "qaysi davrda yo'q edi". */
  birinchi: string;
  oxirgi: string;
  /** Shu davrda HA javobi ham bo'lganmi (ya'ni oralig'ida paydo bo'lgan). */
  yesBor: number;
}

export async function umumiy({ chatId, from, to, branchId }: Filtr): Promise<Umumiy> {
  const rows = await prisma.tgRequest.groupBy({
    by: ["status"],
    where: { chatId, dayKey: { gte: from, lte: to }, ...(branchId != null ? { branchId } : {}) },
    _count: { _all: true },
  });
  const n = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  const yes = n("YES");
  const no = n("NO");
  const unanswered = n("UNANSWERED");
  const unclear = n("UNCLEAR");
  const jami = yes + no + unanswered + unclear;

  const avg = await prisma.tgRequest.aggregate({
    where: {
      chatId,
      dayKey: { gte: from, lte: to },
      answerMinutes: { not: null },
      ...(branchId != null ? { branchId } : {}),
    },
    _avg: { answerMinutes: true },
  });

  return {
    jami,
    yes,
    no,
    unanswered,
    unclear,
    ortachaJavobDaq: avg._avg.answerMinutes != null ? Math.round(avg._avg.answerMinutes) : null,
    javobUlushi: jami > 0 ? Math.round(((yes + no) / jami) * 100) : 0,
  };
}

/** Kunlik dinamika — grafik uchun. */
export async function kunlik({
  chatId,
  from,
  to,
  branchId,
}: Filtr): Promise<{ dayKey: string; jami: number; yes: number; no: number }[]> {
  const rows = await prisma.$queryRaw<{ dayKey: string; jami: bigint; yes: bigint; no: bigint }[]>`
    SELECT r."dayKey",
           COUNT(*)::bigint AS jami,
           COUNT(*) FILTER (WHERE r.status = 'YES')::bigint AS yes,
           COUNT(*) FILTER (WHERE r.status = 'NO')::bigint AS no
    FROM "TgRequest" r
    WHERE r."chatId" = ${chatId} AND r."dayKey" BETWEEN ${from} AND ${to}
      ${branchSql(branchId)}
    GROUP BY r."dayKey"
    ORDER BY r."dayKey"
  `;
  return rows.map((r) => ({
    dayKey: r.dayKey,
    jami: Number(r.jami),
    yes: Number(r.yes),
    no: Number(r.no),
  }));
}

/** Kategoriya (subkategoriya) kesimida — qaysi yo'nalishdan ko'p so'ralyapti. */
export async function kategoriyalar({ chatId, from, to, branchId }: Filtr): Promise<KategoriyaQator[]> {
  const rows = await prisma.$queryRaw<
    { categoryId: number | null; nom: string | null; parent: string | null; jami: bigint; yes: bigint; no: bigint }[]
  >`
    SELECT r."categoryId",
           c.name AS nom,
           p.name AS parent,
           COUNT(*)::bigint AS jami,
           COUNT(*) FILTER (WHERE r.status = 'YES')::bigint AS yes,
           COUNT(*) FILTER (WHERE r.status = 'NO')::bigint AS no
    FROM "TgRequest" r
    LEFT JOIN "Category" c ON c.id = r."categoryId"
    LEFT JOIN "Category" p ON p.id = c."parentId"
    WHERE r."chatId" = ${chatId} AND r."dayKey" BETWEEN ${from} AND ${to}
      AND r.kind IN ('PRODUCT','PRICE')
      ${branchSql(branchId)}
    GROUP BY r."categoryId", c.name, p.name
    ORDER BY jami DESC
  `;
  return rows.map((r) => ({
    categoryId: r.categoryId,
    nom: r.nom ?? "— aniqlanmagan —",
    parent: r.parent ?? "",
    jami: Number(r.jami),
    yes: Number(r.yes),
    no: Number(r.no),
  }));
}

/**
 * Eng ko'p so'ralgan, lekin YO'Q deb javob berilgan mahsulotlar — assortiment
 * bo'shlig'i. Bu butun tahlilning ASOSIY biznes natijasi.
 */
export async function yoqTop(
  { chatId, from, to, branchId }: Filtr,
  limit = 30
): Promise<MahsulotQator[]> {
  // Kanon yechilgan bo'lsa canonId bo'yicha, aks holda normKey bo'yicha guruhlanadi —
  // aks holda barcha yechilmaganlar bitta "aniqlanmagan" qatoriga yopishib qolardi.
  const rows = await prisma.$queryRaw<
    {
      canonId: number | null;
      nom: string | null;
      kategoriya: string | null;
      jami: bigint;
      no: bigint;
      unanswered: bigint;
      yesBor: bigint;
      birinchi: string;
      oxirgi: string;
    }[]
  >`
    SELECT r."canonId",
           COALESCE(MAX(c.name), MAX(r."productNorm")) AS nom,
           MAX(cat.name)                               AS kategoriya,
           COUNT(*)::bigint                            AS jami,
           COUNT(*) FILTER (WHERE r.status = 'NO')::bigint         AS no,
           COUNT(*) FILTER (WHERE r.status = 'UNANSWERED')::bigint AS unanswered,
           COUNT(*) FILTER (WHERE r.status = 'YES')::bigint        AS "yesBor",
           MIN(r."dayKey") FILTER (WHERE r.status IN ('NO','UNANSWERED')) AS birinchi,
           MAX(r."dayKey") FILTER (WHERE r.status IN ('NO','UNANSWERED')) AS oxirgi
    FROM "TgRequest" r
    LEFT JOIN "TgCanonProduct" c ON c.id = r."canonId"
    LEFT JOIN "Category" cat     ON cat.id = r."categoryId"
    WHERE r."chatId" = ${chatId} AND r."dayKey" BETWEEN ${from} AND ${to}
      AND r.kind IN ('PRODUCT','PRICE')
      AND (r."canonId" IS NOT NULL OR r."normKey" IS NOT NULL)
      ${branchSql(branchId)}
    GROUP BY r."canonId", CASE WHEN r."canonId" IS NULL THEN r."normKey" END
    HAVING COUNT(*) FILTER (WHERE r.status IN ('NO','UNANSWERED')) > 0
    ORDER BY no DESC, jami DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    canonId: r.canonId,
    nom: r.nom ?? "—",
    yechilgan: r.canonId != null,
    kategoriya: r.kategoriya,
    jami: Number(r.jami),
    no: Number(r.no),
    unanswered: Number(r.unanswered),
    birinchi: r.birinchi ?? "",
    oxirgi: r.oxirgi ?? "",
    yesBor: Number(r.yesBor),
  }));
}

export interface TafsilotQator {
  id: number;
  dayKey: string;
  askedAt: Date;
  status: string;
  productText: string | null;
  branchName: string | null;
  answerMinutes: number | null;
  /** Operator javob(lar)i matni — bitta so'rovga bir necha javob bo'lishi mumkin. */
  javoblar: { messageId: number; sentAt: Date; text: string; mediaKind: string | null }[];
}

/**
 * Bitta kanon (yoki yechilmagan normKey) bo'yicha TO'LIQ tarix: qachon so'ralgan,
 * qachon "yo'q" deyilgan, qachon javobsiz qolgan va operator aynan nima yozgan.
 *
 * Javob matnlari `answerIds` massivi orqali olinadi — Prisma relatsiyasi yo'q,
 * shuning uchun BITTA raw so'rov bilan (N+1 emas).
 */
export async function yoqTafsilot(
  opts: Filtr & { canonId?: number | null; normKey?: string | null }
): Promise<TafsilotQator[]> {
  const rows = await prisma.$queryRaw<
    {
      id: number;
      dayKey: string;
      askedAt: Date;
      status: string;
      productText: string | null;
      branchName: string | null;
      answerMinutes: number | null;
      javoblar: unknown;
    }[]
  >`
    SELECT r.id, r."dayKey", r."askedAt", r.status, r."productText",
           b.name AS "branchName", r."answerMinutes",
           COALESCE(
             (SELECT json_agg(json_build_object(
                       'messageId', m."messageId",
                       'sentAt',    m."sentAt",
                       'text',      m.text,
                       'mediaKind', m."mediaKind")
                     ORDER BY m."sentAt")
              FROM "TgGroupMessage" m
              WHERE m."chatId" = r."chatId" AND m."messageId" = ANY(r."answerIds")),
             '[]'::json
           ) AS javoblar
    FROM "TgRequest" r
    LEFT JOIN "Branch" b ON b.id = r."branchId"
    WHERE r."chatId" = ${opts.chatId}
      AND r."dayKey" BETWEEN ${opts.from} AND ${opts.to}
      ${branchSql(opts.branchId)}
      AND ${opts.canonId ?? null}::int IS NOT DISTINCT FROM r."canonId"
      AND (${opts.canonId ?? null}::int IS NOT NULL OR r."normKey" = ${opts.normKey ?? null})
    ORDER BY r."askedAt" DESC
    LIMIT 200
  `;

  return rows.map((r) => ({
    id: r.id,
    dayKey: r.dayKey,
    askedAt: r.askedAt,
    status: r.status,
    productText: r.productText,
    branchName: r.branchName,
    answerMinutes: r.answerMinutes,
    javoblar: (r.javoblar as TafsilotQator["javoblar"]) ?? [],
  }));
}

export interface SorovQator {
  id: number;
  dayKey: string;
  askedAt: Date;
  messageId: number;
  kind: string;
  status: string;
  productText: string | null;
  productNorm: string | null;
  canonId: number | null;
  canonName: string | null;
  normKey: string | null;
  categoryId: number | null;
  categoryName: string | null;
  branchName: string | null;
  matchStatus: string;
  matchScore: number | null;
  answerMinutes: number | null;
  priceQuoted: string | null;
  confidence: number;
  note: string | null;
}

/** So'rovlar ro'yxati (tahrirlash tabi uchun). */
export async function sorovlar(
  opts: Filtr & { status?: string; limit?: number }
): Promise<SorovQator[]> {
  const rows = await prisma.tgRequest.findMany({
    where: {
      chatId: opts.chatId,
      dayKey: { gte: opts.from, lte: opts.to },
      ...(opts.branchId != null ? { branchId: opts.branchId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: [{ askedAt: "desc" }],
    take: opts.limit ?? 200,
    include: {
      canon: { select: { name: true } },
      category: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    dayKey: r.dayKey,
    askedAt: r.askedAt,
    messageId: r.messageId,
    kind: r.kind,
    status: r.status,
    productText: r.productText,
    productNorm: r.productNorm,
    canonId: r.canonId,
    canonName: r.canon?.name ?? null,
    normKey: r.normKey,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    branchName: r.branch?.name ?? null,
    matchStatus: r.matchStatus,
    matchScore: r.matchScore,
    answerMinutes: r.answerMinutes,
    priceQuoted: r.priceQuoted?.toString() ?? null,
    confidence: r.confidence,
    note: r.note,
  }));
}
