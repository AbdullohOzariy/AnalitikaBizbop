/**
 * Cheklar bo'limi analitikasi — KPI, soatlik oqim, kassir va kassa kesimlari.
 *
 * ⚠️ BU MODUL FAQAT `/baza/cheklar` UCHUN. 1C ma'lumoti hali sinov bosqichida,
 * shuning uchun platformaning boshqa hisobotlariga (dashboard, sotuv, Moliya)
 * ATAYLAB ulanmagan — ular bugungidek Excel yuklamalaridan hisoblanadi.
 *
 * FILTR MANTIG'I BITTA JOYDA: `shart()` ham ro'yxat, ham barcha agregatlar uchun
 * ishlatiladi. Ikki joyda ikki xil filtr — hisobot bilan ro'yxat mos kelmasligi
 * demakdir.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/** Toshkent — barcha soat/kun hisoblari shu zonada. */
const TZ = Prisma.sql`AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent'`;

export type ChekFiltr = {
  from: string;
  to: string;
  branchId: number | null;
  pos: number | null;
  cashierId: number | null;
  kind: string | null;
  /** Toshkent soati bo'yicha oraliq (0–23), ikkalasi ham ixtiyoriy. */
  soatDan: number | null;
  soatGacha: number | null;
  q: string;
  /** Faqat bekor qilingan qatori bor cheklar. */
  storno: boolean;
  /** Faqat SKU topilmagan qatori bor cheklar. */
  skuYoq: boolean;
};

export const BOSH_FILTR: Omit<ChekFiltr, "from" | "to"> = {
  branchId: null,
  pos: null,
  cashierId: null,
  kind: null,
  soatDan: null,
  soatGacha: null,
  q: "",
  storno: false,
  skuYoq: false,
};

/** Barcha filtrlar — `r` = "Receipt" taxallusi. */
function shart(f: ChekFiltr): Prisma.Sql {
  const w: Prisma.Sql[] = [
    Prisma.sql`r."businessDate" >= ${f.from}::date`,
    Prisma.sql`r."businessDate" <= ${f.to}::date`,
  ];
  if (f.branchId) w.push(Prisma.sql`r."branchId" = ${f.branchId}`);
  if (f.pos != null) w.push(Prisma.sql`r.pos = ${f.pos}`);
  if (f.cashierId != null) w.push(Prisma.sql`r."cashierId" = ${f.cashierId}`);
  if (f.kind) {
    w.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "ReceiptPayment" p WHERE p."receiptId" = r.id AND p.kind = ${f.kind})`,
    );
  }
  if (f.soatDan != null) {
    w.push(
      Prisma.sql`EXTRACT(HOUR FROM r."openAt" ${TZ})::int >= ${f.soatDan}`,
    );
  }
  if (f.soatGacha != null) {
    w.push(
      Prisma.sql`EXTRACT(HOUR FROM r."openAt" ${TZ})::int <= ${f.soatGacha}`,
    );
  }
  if (f.storno) {
    w.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "ReceiptLine" l WHERE l."receiptId" = r.id AND l.storno <> 0)`,
    );
  }
  if (f.skuYoq) {
    w.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "ReceiptLine" l WHERE l."receiptId" = r.id AND l."productId" IS NULL)`,
    );
  }
  if (f.q) {
    const like = `%${f.q}%`;
    w.push(Prisma.sql`(
      r.number ILIKE ${like}
      OR r.card ILIKE ${like}
      OR r."cashierName" ILIKE ${like}
      OR EXISTS (SELECT 1 FROM "ReceiptLine" l WHERE l."receiptId" = r.id
                 AND (l.name ILIKE ${like} OR l.barcode ILIKE ${like}))
    )`);
  }
  return Prisma.join(w, " AND ");
}

// ─── KPI ──────────────────────────────────────────────────────────────────────

export type ChekKpi = {
  cheklar: number;
  tushum: number;
  ortChek: number;
  /** Chekdagi TOVAR TURI soni (nechta xil mahsulot). */
  ortTur: number;
  /** Chekdagi DONA soni — og'irlikli tovar kasr bo'lishi mumkin. */
  ortDona: number;
  /** Xizmat davomiyligi, sekund — o'rtacha va median. */
  ortVaqt: number | null;
  medVaqt: number | null;
  /** Vaqti o'lchangan cheklar ulushi (fiskal havolasi borlari). */
  vaqtQamrovi: number;
  naqd: number;
  stornoCheklar: number;
};

export async function chekKpi(f: ChekFiltr): Promise<ChekKpi> {
  const r = await prisma.$queryRaw<Record<string, number | null>[]>(Prisma.sql`
    WITH r0 AS (SELECT r.* FROM "Receipt" r WHERE ${shart(f)}),
    qator AS (
      -- Storno qatorlar HISOBGA OLINMAYDI: ular bekor qilingan.
      SELECT l."receiptId", SUM(l.qty)::float8 dona
      FROM "ReceiptLine" l JOIN r0 ON r0.id = l."receiptId"
      WHERE l.storno = 0 GROUP BY 1
    ),
    naqd AS (
      SELECT COALESCE(SUM(p.value), 0)::float8 s
      FROM "ReceiptPayment" p JOIN r0 ON r0.id = p."receiptId"
      JOIN "PaymentKindDef" d ON d.code = p.kind AND d."isCash"
    )
    SELECT
      count(*)::int                                        AS cheklar,
      COALESCE(SUM(r0."totalSum"), 0)::float8              AS tushum,
      COALESCE(AVG(r0."totalSum"), 0)::float8              AS "ortChek",
      COALESCE(AVG(r0."qtyPositions"), 0)::float8          AS "ortTur",
      COALESCE(AVG(q.dona), 0)::float8                     AS "ortDona",
      AVG(EXTRACT(EPOCH FROM (r0."closeAt" - r0."openAt")))::float8 AS "ortVaqt",
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (r0."closeAt" - r0."openAt"))
      )::float8                                            AS "medVaqt",
      count(*) FILTER (WHERE r0."closeAt" IS NOT NULL)::int AS "vaqtli",
      (SELECT s FROM naqd)                                 AS naqd,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM "ReceiptLine" l WHERE l."receiptId" = r0.id AND l.storno <> 0
      ))::int                                              AS "stornoCheklar"
    FROM r0 LEFT JOIN qator q ON q."receiptId" = r0.id
  `);
  const x = r[0] ?? {};
  const cheklar = Number(x.cheklar ?? 0);
  return {
    cheklar,
    tushum: Number(x.tushum ?? 0),
    ortChek: Number(x.ortChek ?? 0),
    ortTur: Number(x.ortTur ?? 0),
    ortDona: Number(x.ortDona ?? 0),
    ortVaqt: x.ortVaqt == null ? null : Number(x.ortVaqt),
    medVaqt: x.medVaqt == null ? null : Number(x.medVaqt),
    vaqtQamrovi: cheklar > 0 ? Number(x.vaqtli ?? 0) / cheklar : 0,
    naqd: Number(x.naqd ?? 0),
    stornoCheklar: Number(x.stornoCheklar ?? 0),
  };
}

// ─── Soatlik oqim ─────────────────────────────────────────────────────────────

export type SoatQator = {
  soat: number;
  cheklar: number;
  tushum: number;
  ortVaqt: number | null;
};

export async function soatlikOqim(f: ChekFiltr): Promise<SoatQator[]> {
  const rows = await prisma.$queryRaw<
    { soat: number; cheklar: number; tushum: number; ortVaqt: number | null }[]
  >(Prisma.sql`
    SELECT EXTRACT(HOUR FROM r."openAt" ${TZ})::int AS soat,
           count(*)::int AS cheklar,
           COALESCE(SUM(r."totalSum"), 0)::float8 AS tushum,
           AVG(EXTRACT(EPOCH FROM (r."closeAt" - r."openAt")))::float8 AS "ortVaqt"
    FROM "Receipt" r WHERE ${shart(f)}
    GROUP BY 1 ORDER BY 1
  `);
  return rows.map((x) => ({
    ...x,
    ortVaqt: x.ortVaqt == null ? null : Number(x.ortVaqt),
  }));
}

// ─── Kassir / kassa kesimi ────────────────────────────────────────────────────

export type KesimQator = {
  id: number | null;
  nom: string;
  cheklar: number;
  tushum: number;
  ortChek: number;
  ortTur: number;
  ortVaqt: number | null;
  /** Bekor qilingan qatori bor cheklar ulushi — nazorat signali. */
  stornoUlush: number;
};

/** `boyicha`: kassir yoki kassa (pos). */
async function kesim(
  f: ChekFiltr,
  boyicha: "kassir" | "kassa",
): Promise<KesimQator[]> {
  const idCol =
    boyicha === "kassir" ? Prisma.sql`r."cashierId"` : Prisma.sql`r.pos`;
  const nomCol =
    boyicha === "kassir"
      ? Prisma.sql`COALESCE(max(r."cashierName"), '—')`
      : Prisma.sql`('Kassa ' || r.pos::text)`;

  const rows = await prisma.$queryRaw<
    {
      id: number | null;
      nom: string;
      cheklar: number;
      tushum: number;
      ortChek: number;
      ortTur: number;
      ortVaqt: number | null;
      stornoli: number;
    }[]
  >(Prisma.sql`
    SELECT ${idCol} AS id,
           ${nomCol} AS nom,
           count(*)::int AS cheklar,
           COALESCE(SUM(r."totalSum"), 0)::float8 AS tushum,
           COALESCE(AVG(r."totalSum"), 0)::float8 AS "ortChek",
           COALESCE(AVG(r."qtyPositions"), 0)::float8 AS "ortTur",
           AVG(EXTRACT(EPOCH FROM (r."closeAt" - r."openAt")))::float8 AS "ortVaqt",
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "ReceiptLine" l WHERE l."receiptId" = r.id AND l.storno <> 0
           ))::int AS stornoli
    FROM "Receipt" r WHERE ${shart(f)}
    GROUP BY ${idCol}, ${boyicha === "kassa" ? Prisma.sql`r.pos` : Prisma.sql`r."cashierId"`}
    ORDER BY tushum DESC
  `);
  return rows.map((x) => ({
    id: x.id,
    nom: x.nom,
    cheklar: x.cheklar,
    tushum: Number(x.tushum),
    ortChek: Number(x.ortChek),
    ortTur: Number(x.ortTur),
    ortVaqt: x.ortVaqt == null ? null : Number(x.ortVaqt),
    stornoUlush: x.cheklar > 0 ? x.stornoli / x.cheklar : 0,
  }));
}

export const kassirKesimi = (f: ChekFiltr) => kesim(f, "kassir");
export const kassaKesimi = (f: ChekFiltr) => kesim(f, "kassa");

// ─── To'lov taqsimoti ─────────────────────────────────────────────────────────

/**
 * Tur bo'yicha summa — CHEK emas, TO'LOV darajasida (bir chekda naqd ham,
 * plastik ham bo'lishi mumkin). Filtr ro'yxat bilan AYNI.
 */
export async function tolovTaqsimoti(
  f: ChekFiltr,
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<
    { kind: string; summa: number }[]
  >(Prisma.sql`
    SELECT p.kind, COALESCE(SUM(p.value), 0)::float8 AS summa
    FROM "ReceiptPayment" p
    JOIN "Receipt" r ON r.id = p."receiptId"
    WHERE ${shart(f)}
    GROUP BY p.kind
  `);
  return new Map(rows.map((x) => [x.kind, Number(x.summa)]));
}

// ─── Ro'yxat uchun ID'lar ─────────────────────────────────────────────────────

/**
 * Filtrga mos cheklarning ID'lari (sahifalangan) + umumiy soni.
 *
 * ID orqali: batafsil ma'lumot (qatorlar, to'lovlar) Prisma bilan olinadi, lekin
 * FILTR bitta joyda — `shart()` da qoladi.
 */
export async function chekIdlari(
  f: ChekFiltr,
  limit: number,
  offset = 0,
): Promise<{ ids: number[]; jami: number }> {
  const [rows, cnt] = await Promise.all([
    prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
      SELECT r.id FROM "Receipt" r WHERE ${shart(f)}
      ORDER BY r."openAt" DESC, r.id DESC LIMIT ${limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(*)::int AS n FROM "Receipt" r WHERE ${shart(f)}
    `),
  ]);
  return { ids: rows.map((r) => r.id), jami: Number(cnt[0]?.n ?? 0) };
}

// ─── Filtr uchun ro'yxatlar ───────────────────────────────────────────────────

export async function kassirRoyxati(
  f: Pick<ChekFiltr, "from" | "to">,
): Promise<{ id: number; nom: string }[]> {
  const rows = await prisma.$queryRaw<{ id: number; nom: string }[]>(Prisma.sql`
    SELECT r."cashierId" AS id, COALESCE(max(r."cashierName"), '—') AS nom
    FROM "Receipt" r
    WHERE r."businessDate" >= ${f.from}::date AND r."businessDate" <= ${f.to}::date
      AND r."cashierId" IS NOT NULL
    GROUP BY r."cashierId" ORDER BY nom
  `);
  return rows;
}

export async function kassaRoyxati(
  f: Pick<ChekFiltr, "from" | "to">,
): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ pos: number }[]>(Prisma.sql`
    SELECT DISTINCT r.pos FROM "Receipt" r
    WHERE r."businessDate" >= ${f.from}::date AND r."businessDate" <= ${f.to}::date
    ORDER BY r.pos
  `);
  return rows.map((r) => r.pos);
}
