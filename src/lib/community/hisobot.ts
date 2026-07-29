/**
 * Community hisobot agregatlari — sahifa uchun tayyor raqamlar.
 *
 * MUHIM: kategoriya statistikasi SKU moslikka BOG'LIQ EMAS. Operator "sotuvda mavjud
 * emas" degan mahsulot katalogda ham yo'q bo'ladi — ya'ni assortiment bo'shlig'i aynan
 * SKU topilmagan joyda. Shuning uchun `categoryId` SKU'dan mustaqil to'ldiriladi va
 * hisobot ham shunga tayanadi.
 */
import { prisma } from "@/lib/prisma";

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
  productNorm: string;
  jami: number;
  no: number;
  unanswered: number;
  productId: number | null;
  productName: string | null;
}

export async function umumiy(chatId: bigint, from: string, to: string): Promise<Umumiy> {
  const rows = await prisma.tgRequest.groupBy({
    by: ["status"],
    where: { chatId, dayKey: { gte: from, lte: to } },
    _count: { _all: true },
  });
  const n = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  const yes = n("YES");
  const no = n("NO");
  const unanswered = n("UNANSWERED");
  const unclear = n("UNCLEAR");
  const jami = yes + no + unanswered + unclear;

  const avg = await prisma.tgRequest.aggregate({
    where: { chatId, dayKey: { gte: from, lte: to }, answerMinutes: { not: null } },
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
export async function kunlik(
  chatId: bigint,
  from: string,
  to: string
): Promise<{ dayKey: string; jami: number; yes: number; no: number }[]> {
  const rows = await prisma.$queryRaw<{ dayKey: string; jami: bigint; yes: bigint; no: bigint }[]>`
    SELECT "dayKey",
           COUNT(*)::bigint AS jami,
           COUNT(*) FILTER (WHERE status = 'YES')::bigint AS yes,
           COUNT(*) FILTER (WHERE status = 'NO')::bigint AS no
    FROM "TgRequest"
    WHERE "chatId" = ${chatId} AND "dayKey" BETWEEN ${from} AND ${to}
    GROUP BY "dayKey"
    ORDER BY "dayKey"
  `;
  return rows.map((r) => ({
    dayKey: r.dayKey,
    jami: Number(r.jami),
    yes: Number(r.yes),
    no: Number(r.no),
  }));
}

/** Kategoriya (subkategoriya) kesimida — qaysi yo'nalishdan ko'p so'ralyapti. */
export async function kategoriyalar(
  chatId: bigint,
  from: string,
  to: string
): Promise<KategoriyaQator[]> {
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
  chatId: bigint,
  from: string,
  to: string,
  limit = 30
): Promise<MahsulotQator[]> {
  const rows = await prisma.$queryRaw<
    {
      productNorm: string;
      jami: bigint;
      no: bigint;
      unanswered: bigint;
      productId: number | null;
      productName: string | null;
    }[]
  >`
    SELECT r."productNorm",
           COUNT(*)::bigint AS jami,
           COUNT(*) FILTER (WHERE r.status = 'NO')::bigint AS no,
           COUNT(*) FILTER (WHERE r.status = 'UNANSWERED')::bigint AS unanswered,
           MAX(r."productId") AS "productId",
           MAX(pr.name) AS "productName"
    FROM "TgRequest" r
    LEFT JOIN "Product" pr ON pr.id = r."productId"
    WHERE r."chatId" = ${chatId} AND r."dayKey" BETWEEN ${from} AND ${to}
      AND r."productNorm" IS NOT NULL
      AND r.status IN ('NO','UNANSWERED')
    GROUP BY r."productNorm"
    ORDER BY no DESC, jami DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    productNorm: r.productNorm,
    jami: Number(r.jami),
    no: Number(r.no),
    unanswered: Number(r.unanswered),
    productId: r.productId,
    productName: r.productName,
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
  productId: number | null;
  productName: string | null;
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
export async function sorovlar(opts: {
  chatId: bigint;
  from: string;
  to: string;
  status?: string;
  matchStatus?: string;
  faqatMoslanmagan?: boolean;
  limit?: number;
}): Promise<SorovQator[]> {
  const rows = await prisma.tgRequest.findMany({
    where: {
      chatId: opts.chatId,
      dayKey: { gte: opts.from, lte: opts.to },
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.matchStatus ? { matchStatus: opts.matchStatus } : {}),
      ...(opts.faqatMoslanmagan ? { productId: null, kind: { in: ["PRODUCT", "PRICE"] } } : {}),
    },
    orderBy: [{ askedAt: "desc" }],
    take: opts.limit ?? 200,
    include: {
      product: { select: { name: true } },
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
    productId: r.productId,
    productName: r.product?.name ?? null,
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
