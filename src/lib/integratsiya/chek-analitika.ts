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
  /** Kassa: "shop:pos" — `pos` do'konlar orasida TAKRORLANADI (shop 1 va 5 da ham 1-kassa bor). */
  kassa: string | null;
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
  /** Faqat chegirma berilgan cheklar. */
  chegirmali: boolean;
};

export const BOSH_FILTR: Omit<ChekFiltr, "from" | "to"> = {
  branchId: null,
  kassa: null,
  cashierId: null,
  kind: null,
  soatDan: null,
  soatGacha: null,
  q: "",
  storno: false,
  skuYoq: false,
  chegirmali: false,
};

/**
 * To'lov darajasidagi filtr — `p` = "ReceiptPayment" taxallusi.
 *
 * NEGA ALOHIDA: `shart()` CHEKNI saqlaydi. Aralash to'lovli chekda (26 ta bor)
 * "naqd" filtri tanlansa, o'sha chekning PLASTIK qismi ham yig'indiga kirib
 * ketardi — o'lchandi: 2.55 mln so'm begona tur sizib chiqqan edi.
 */
function tolovShart(f: ChekFiltr): Prisma.Sql {
  return f.kind ? Prisma.sql`AND p.kind = ${f.kind}` : Prisma.empty;
}

/** Barcha filtrlar — `r` = "Receipt" taxallusi. */
function shart(f: ChekFiltr): Prisma.Sql {
  const w: Prisma.Sql[] = [
    Prisma.sql`r."businessDate" >= ${f.from}::date`,
    Prisma.sql`r."businessDate" <= ${f.to}::date`,
  ];
  if (f.branchId) w.push(Prisma.sql`r."branchId" = ${f.branchId}`);
  if (f.kassa) {
    const [sh, po] = f.kassa.split(":").map(Number);
    if (Number.isFinite(sh) && Number.isFinite(po)) {
      w.push(Prisma.sql`r.shop = ${sh} AND r.pos = ${po}`);
    }
  }
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
  if (f.chegirmali) w.push(Prisma.sql`r.sum > r."sumWithDiscs"`);
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
  /** Chegirma summasi: chegirmagacha − chegirmadan keyin. */
  chegirma: number;
  /** Chegirmagacha bo'lgan yig'indi — ulushni hisoblash uchun. */
  gross: number;
  /** Nechta chekda chegirma berilgan. */
  chegirmaliCheklar: number;
  stornoCheklar: number;
  /**
   * Tovari bor, lekin chegirmadan keyin summasi 0 bo'lgan cheklar.
   *
   * NAZORAT SIGNALI: mijoz to'lamagan, tovar esa chiqib ketgan. Xodim xaridi,
   * hisobdan chiqarish yoki suiiste'mol bo'lishi mumkin — o'zi ko'rinib tursin.
   */
  tekinCheklar: number;
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
      WHERE TRUE ${tolovShart(f)}
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
      ))::int                                              AS "stornoCheklar",
      count(*) FILTER (WHERE r0."totalSum" = 0 AND r0.sum > 0)::int AS "tekinCheklar",
      COALESCE(SUM(r0.sum - r0."sumWithDiscs"), 0)::float8  AS chegirma,
      COALESCE(SUM(r0.sum), 0)::float8                      AS gross,
      count(*) FILTER (WHERE r0.sum > r0."sumWithDiscs")::int AS "chegirmaliCheklar"
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
    chegirma: Number(x.chegirma ?? 0),
    gross: Number(x.gross ?? 0),
    chegirmaliCheklar: Number(x.chegirmaliCheklar ?? 0),
    stornoCheklar: Number(x.stornoCheklar ?? 0),
    tekinCheklar: Number(x.tekinCheklar ?? 0),
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
  /** Filtr uchun barqaror kalit: kassada "shop:pos", kassirda id. */
  kalit: string;
  nom: string;
  cheklar: number;
  tushum: number;
  ortChek: number;
  ortTur: number;
  ortVaqt: number | null;
  /**
   * Bekor qilingan qatorlarning PUL ulushi — nazorat signali.
   *
   * NEGA CHEK SONI EMAS: 20 ta arzon qatorni bekor qilish bilan 1 ta qimmatini
   * bekor qilish chek soni bo'yicha bir xil ko'rinardi. Pul bo'yicha tarqoqlik
   * 3.75× (1.12%–4.20%), chek soni bo'yicha atigi 1.92%.
   */
  stornoUlush: number;
  /** Xizmat vaqti nechta chekda o'lchangani — ustunga ishonch darajasi. */
  vaqtli: number;
  /**
   * Chegirmaning gross'dagi ulushi — nazorat signali.
   *
   * Jonli ma'lumotda tarqoqlik katta: `admin` hisobi 3.87%, eng pasti 1.47%.
   * Kim ko'p chegirma berayotgani shu ustunda ko'rinadi.
   */
  chegirmaUlush: number;
  chegirmaPul: number;
  /**
   * SAMARADORLIK INDEKSI = haqiqiy vaqt ÷ kutilgan vaqt.
   *
   * Kutilgan vaqt davr modelidan: `sek = a + b × tovar soni` (eng kichik
   * kvadratlar). Jonli o'lchov: a ≈ 24 sek (qotgan xarajat — salomlashish,
   * to'lov, chek), b ≈ 6.9 sek (har tovar).
   *
   * NEGA "sekund/tovar" EMAS: qotgan xarajat kichik savatda ustun bo'lib
   * qoladi — 1 tovarli chek 17 sek/tovar, 20 tovarli 9 sek/tovar chiqardi va
   * kichik savat bilan ishlagan kassir "sekin" ko'rinardi. Indeks buni
   * hisobga oladi: 0.87 = o'z savatlariga ketishi kerak bo'lgandan 13% tez.
   *
   * `null` — namuna yetarli emas (model ishonchsiz).
   */
  samaradorlik: number | null;
};

/** Indeks ko'rsatilishi uchun kerak bo'lgan eng kam chek soni. */
export const SAMARA_MIN_NAMUNA = 20;

/**
 * Kassir yoki kassa kesimi.
 *
 * ⚠️ KASSA `shop` BILAN BIRGA guruhlanadi: `pos` do'kon ICHIDA raqamlanadi va
 * do'konlar orasida takrorlanadi (jonli bazada shop 1 va shop 5 da ham 1-kassa
 * bor). Faqat `pos` bo'yicha guruhlash turli filiallarning kassalarini bitta
 * qatorga qo'shib yuborardi.
 */
async function kesim(
  f: ChekFiltr,
  boyicha: "kassir" | "kassa",
): Promise<KesimQator[]> {
  const kassa = boyicha === "kassa";

  // Kassir nomi: OXIRGI ishlatilgani. `max()` alfavit bo'yicha tanlardi va
  // bitta id ostida ikki nom bo'lsa (id=1 da "admin" ham, "Системный
  // администратор" ham bor) qaysi biri chiqishi tasodifiy bo'lardi.
  const rows = await prisma.$queryRaw<
    {
      id: number | null; kalit: string; nom: string; cheklar: number;
      tushum: number; ortChek: number; ortTur: number;
      ortVaqt: number | null; vaqtli: number;
      stornoPul: number; jamiPul: number;
      chegirmaPul: number; gross: number;
      kutilgan: number | null; olchangan: number; modelNamuna: number;
    }[]
  >(Prisma.sql`
    WITH r0 AS (SELECT r.* FROM "Receipt" r WHERE ${shart(f)}),
    -- Xizmat vaqti modeli: sek = a + b × tovar soni (davr bo'yicha, bir marta).
    -- Kassirlarni ADOLATLI taqqoslash uchun — savat hajmi turlicha.
    model AS (
      SELECT regr_intercept(t, n) AS a, regr_slope(t, n) AS b, count(*)::int AS namuna
      FROM (
        SELECT EXTRACT(EPOCH FROM (r0."closeAt" - r0."openAt"))::float8 AS t,
               r0."qtyPositions"::float8 AS n
        FROM r0 WHERE r0."closeAt" IS NOT NULL AND r0."qtyPositions" > 0
      ) x
    ),
    storno AS (
      SELECT l."receiptId",
             SUM(l."totalSum") FILTER (WHERE l.storno <> 0)::float8 AS bekor,
             SUM(l."totalSum")::float8 AS jami
      FROM "ReceiptLine" l JOIN r0 ON r0.id = l."receiptId"
      GROUP BY 1
    )
    SELECT
      ${kassa ? Prisma.sql`r0.pos` : Prisma.sql`r0."cashierId"`} AS id,
      ${kassa ? Prisma.sql`(r0.shop::text || ':' || r0.pos::text)` : Prisma.sql`COALESCE(r0."cashierId"::text, '')`} AS kalit,
      ${
        kassa
          ? Prisma.sql`(COALESCE(max(b.name), 'Do''kon ' || r0.shop::text) || ' · Kassa ' || r0.pos::text)`
          : Prisma.sql`COALESCE((array_agg(r0."cashierName" ORDER BY r0."openAt" DESC))[1], '—')`
      } AS nom,
      count(*)::int AS cheklar,
      COALESCE(SUM(r0."totalSum"), 0)::float8 AS tushum,
      COALESCE(AVG(r0."totalSum"), 0)::float8 AS "ortChek",
      COALESCE(AVG(r0."qtyPositions"), 0)::float8 AS "ortTur",
      AVG(EXTRACT(EPOCH FROM (r0."closeAt" - r0."openAt")))::float8 AS "ortVaqt",
      count(*) FILTER (WHERE r0."closeAt" IS NOT NULL)::int AS vaqtli,
      COALESCE(SUM(s.bekor), 0)::float8 AS "stornoPul",
      COALESCE(SUM(s.jami), 0)::float8 AS "jamiPul",
      COALESCE(SUM(r0.sum - r0."sumWithDiscs"), 0)::float8 AS "chegirmaPul",
      COALESCE(SUM(r0.sum), 0)::float8 AS gross,
      -- Kutilgan vaqt: shu kassirning SAVATLARIGA ketishi kerak bo'lgan payt.
      AVG((SELECT a FROM model) + (SELECT b FROM model) * r0."qtyPositions")
        FILTER (WHERE r0."closeAt" IS NOT NULL AND r0."qtyPositions" > 0)::float8 AS "kutilgan",
      count(*) FILTER (WHERE r0."closeAt" IS NOT NULL AND r0."qtyPositions" > 0)::int AS "olchangan",
      (SELECT namuna FROM model)::int AS "modelNamuna"
    FROM r0
    LEFT JOIN storno s ON s."receiptId" = r0.id
    ${kassa ? Prisma.sql`LEFT JOIN "Branch" b ON b.id = r0."branchId"` : Prisma.empty}
    GROUP BY ${kassa ? Prisma.sql`r0.shop, r0.pos` : Prisma.sql`r0."cashierId"`}
    ORDER BY tushum DESC
  `);

  return rows.map((x) => ({
    id: x.id,
    kalit: x.kalit,
    nom: x.nom,
    cheklar: x.cheklar,
    tushum: Number(x.tushum),
    ortChek: Number(x.ortChek),
    ortTur: Number(x.ortTur),
    ortVaqt: x.ortVaqt == null ? null : Number(x.ortVaqt),
    vaqtli: x.vaqtli,
    // PUL ulushi — chek soni emas (izohga qarang).
    stornoUlush: x.jamiPul > 0 ? Number(x.stornoPul) / Number(x.jamiPul) : 0,
    chegirmaPul: Number(x.chegirmaPul),
    chegirmaUlush: x.gross > 0 ? Number(x.chegirmaPul) / Number(x.gross) : 0,
    // Namuna kichik bo'lsa indeks ko'rsatilmaydi: R² ≈ 0.25, ya'ni bitta
    // chekda tarqoqlik katta — faqat ko'p chekda o'rtacha ma'noli bo'ladi.
    samaradorlik:
      x.ortVaqt != null &&
      x.kutilgan != null &&
      Number(x.kutilgan) > 0 &&
      x.olchangan >= SAMARA_MIN_NAMUNA &&
      x.modelNamuna >= 100
        ? Number(x.ortVaqt) / Number(x.kutilgan)
        : null,
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
    WHERE ${shart(f)} ${tolovShart(f)}
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
): Promise<{ kalit: string; nom: string }[]> {
  // `pos` do'konlar orasida takrorlanadi — kalit "shop:pos" bo'lishi SHART.
  const rows = await prisma.$queryRaw<{ kalit: string; nom: string }[]>(Prisma.sql`
    SELECT (r.shop::text || ':' || r.pos::text) AS kalit,
           (COALESCE(max(b.name), 'Do''kon ' || r.shop::text) || ' · Kassa ' || r.pos::text) AS nom
    FROM "Receipt" r LEFT JOIN "Branch" b ON b.id = r."branchId"
    WHERE r."businessDate" >= ${f.from}::date AND r."businessDate" <= ${f.to}::date
    GROUP BY r.shop, r.pos ORDER BY r.shop, r.pos
  `);
  return rows;
}
