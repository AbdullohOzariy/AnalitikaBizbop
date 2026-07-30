/**
 * HAFTALIK PROGNOZ KONVEYERI — bir yugurishda uch ish bajariladi:
 *
 *   1. PROGNOZ: har faol seriya (SKU×filial) uchun keyingi 4 haftaning JAMI talabi.
 *   2. BAHO: pishgan eski run'larni fakt bilan solishtirish (sifat tarixi shu yerdan
 *      to'planadi — UI bo'lmasa ham har hafta o'lchov yozib boriladi).
 *   3. TOZALASH: detal jadvallarni oyna ichida ushlab turish (agregat qoladi).
 *
 * NEGA BAHO ALOHIDA QADAM: 4 haftalik prognozning fakti 4 haftadan keyin bilinadi.
 * Shuning uchun bu haftaning yugurishi 4 hafta oldingi run'ni baholaydi. Ya'ni tizim
 * ishga tushgandan 5 hafta o'tib birinchi real aniqlik raqami paydo bo'ladi — bu
 * KUTILGAN holat, "sifat sahifasi bo'sh" degan bug emas.
 *
 * IDEMPOTENT: run kaliti (hafta × gorizont × siyosat) noyob, `createMany` esa
 * `skipDuplicates` bilan — yarim yo'lda uzilgan yugurish qayta ishga tushsa dublikat
 * bo'lmaydi.
 */
import { Prisma } from "@/generated/prisma/client";
import { pgPool, prisma } from "@/lib/prisma";
import { isoDay, nowTashkent } from "@/lib/date";
import {
  WEEKLY_SERIES_SQL,
  WEEKS_SQL,
  seriyalarQatordan,
  sinfla,
  type Seriya,
  type SeriyaRow,
  type Sinf,
} from "./panel";
import { forecast, modelniTanla, naive1, nolEhtimoli, q90 } from "./model";
import { MIN_TRAIN } from "./backtest";
import { haftaDate, haftaFarq, haftaQosh, kutilganOrigin } from "./hafta";
import { scoreCell } from "./metrics";
import { HAMMASI, ishonchBelgisi, segmentla, type BahoQatori, type Ishonch } from "./segment";

/**
 * VALIDATSIYALANGAN gorizont. 8 hafta uchun bitta backtest oynasi sig'adi, 12 hafta
 * uchun umuman sig'maydi — o'lchanmagan gorizont SAQLANMAYDI ham (aks holda UI'da
 * "12 haftalik prognoz" paydo bo'lib, uning xatosi hech kimga ma'lum bo'lmaydi).
 */
export const GORIZONT = 4;

/**
 * Model tanlash siyosatining nomi — run kalitining bir bo'lagi. Siyosat o'zgarsa
 * (masalan yangi backtest'dan keyin) nom ham o'zgaradi: shunda AYNI hafta uchun
 * ikki siyosat yonma-yon saqlanib, ularni jonli ma'lumotda taqqoslash mumkin.
 */
export const SIYOSAT = "gate-v1";

/**
 * q90 uchun z — HALI KALIBRLANMAGAN. Faza 1 o'lchovida normal taqsimotning 1.2816
 * qiymati bilan haqiqiy qoplash 87–89% chiqdi (maqsad 90%), ya'ni z biroz kattaroq
 * bo'lishi kerak. Har run o'z z'ini saqlaydi — kalibrlangach eski tarixni qaysi z
 * bilan o'lchaganimiz bilinib turadi.
 */
export const Z_XOM = 1.28;

/** Ishonch belgisi necha oxirgi oyna bo'yicha hisoblanadi. */
export const ISHONCH_OYNA = 4;

/** Detal saqlash oynalari (agregat — `SkuForecastSegment` — abadiy qoladi). */
export const SAQLASH_PROGNOZ_HAFTA = 12;
export const SAQLASH_ANIQLIK_HAFTA = 26;

/** `createMany` bo'lagi — 27 ming qator bitta so'rovda yuborilmasin. */
const BOLAK = 5_000;

/** Panel hafta konteksti — barcha qadamlar shu bitta o'qishdan foydalanadi. */
interface Kontekst {
  /** To'liq haftalar (dushanba ISO), o'sish tartibida. */
  haftalar: string[];
  /** hafta ISO → massiv indeksi. */
  indeks: Map<string, number>;
  /** Origin — paneldagi OXIRGI to'liq hafta. */
  origin: string;
  /** Kutilgandan necha hafta orqada (0 = joyida, >0 = sotuv importi kechikkan). */
  kechikish: number;
  seriyalar: Seriya[];
  seriyaMap: Map<string, Seriya>;
}

export interface YugurNatija {
  origin: string;
  panelWeeks: number;
  kechikish: number;
  seriesTotal: number;
  /** Yangi run yaratildimi (false — shu hafta allaqachon hisoblangan). */
  yangi: boolean;
  forecasted: number;
  skippedKam: number;
  skippedArch: number;
  baholanganRun: number;
  baholanganQator: number;
  tozalandi: { prognoz: number; aniqlik: number };
}

const kalit = (pid: number, bid: number) => `${pid}:${bid}`;

/**
 * NEGA `pgPool`, `prisma.$queryRaw` EMAS: Prisma'ning raw qatlami Postgres MASSIV
 * ustunlarini qaytarganda qotib qoladi (o'lchandi: `float8[]` bilan 200 qator ham 7
 * daqiqada tugamadi; ayni so'rov pg orqali 13 s, 44 682 qator). Pool AYNI bitta —
 * qo'shimcha ulanish ochilmaydi.
 */
async function konteksOqi(now: Date): Promise<Kontekst> {
  const t0 = Date.now();
  const weeks = await pgPool.query<{ w: string; i: number }>(WEEKS_SQL);
  const haftalar = weeks.rows.map((r) => r.w);
  if (haftalar.length < MIN_TRAIN) {
    throw new Error(`to'liq haftalar yetarli emas: ${haftalar.length} < ${MIN_TRAIN}`);
  }
  console.log(`[prognoz] ${haftalar.length} to'liq hafta (${Date.now() - t0} ms)`);

  const t1 = Date.now();
  const rows = await pgPool.query<SeriyaRow>(WEEKLY_SERIES_SQL);
  const seriyalar = seriyalarQatordan(rows.rows);
  console.log(`[prognoz] ${seriyalar.length} seriya o'qildi (${Date.now() - t1} ms)`);

  // CROSS JOIN tufayli har seriyada AYNI hafta soni bo'lishi SHART. Bo'lmasa indekslar
  // siljiydi va prognoz boshqa haftaga yozilib ketadi — jimgina emas, xato bilan to'xtaymiz.
  const yomon = seriyalar.find((s) => s.qty.length !== haftalar.length);
  if (yomon) {
    throw new Error(
      `panel buzuq: seriya ${kalit(yomon.pid, yomon.bid)} da ${yomon.qty.length} hafta, ` +
        `kutilgan ${haftalar.length}`
    );
  }

  const origin = haftalar[haftalar.length - 1];
  return {
    haftalar,
    indeks: new Map(haftalar.map((w, i) => [w, i])),
    origin,
    kechikish: haftaFarq(origin, kutilganOrigin(now)),
    seriyalar,
    seriyaMap: new Map(seriyalar.map((s) => [kalit(s.pid, s.bid), s])),
  };
}

/**
 * Prognoz qatorlarini quradi (DB'ga tegmaydi) — yozish yo'li ham, quruq tekshiruv ham
 * AYNI shu funksiyani ishlatadi, aks holda "quruq" natija haqiqiy natijadan farq qilardi.
 */
function qatorlarniQur(
  ctx: Kontekst,
  arxiv: Set<number>,
  originIdx: number
): { yozuvlar: Prisma.SkuForecastCreateManyInput[]; skippedKam: number; skippedArch: number; sinfStat: Map<Sinf, number> } {
  const origin = ctx.haftalar[originIdx];
  const targetFrom = haftaDate(haftaQosh(origin, 1));
  const targetTo = haftaDate(haftaQosh(origin, GORIZONT));

  const yozuvlar: Prisma.SkuForecastCreateManyInput[] = [];
  const sinfStat = new Map<Sinf, number>();
  let skippedKam = 0;
  let skippedArch = 0;

  for (const s of ctx.seriyalar) {
    if (arxiv.has(s.pid)) {
      skippedArch++;
      continue;
    }
    // KRITIK: train — FAQAT origin'gacha. Backfill'da butun massiv olinsa model
    // kelajakni ko'rib qo'yadi va aniqlik soxta yaxshi chiqadi.
    const train = originIdx === ctx.haftalar.length - 1 ? s.qty : s.qty.slice(0, originIdx + 1);
    const { sinf, nz, adi, cv2 } = sinfla(train);
    sinfStat.set(sinf, (sinfStat.get(sinf) ?? 0) + 1);
    if (sinf === "KAM") {
      skippedKam++; // tarix yetarli emas — prognoz ATAYLAB berilmaydi
      continue;
    }
    const modelKey = modelniTanla(sinf);
    const p50 = forecast(modelKey, train, GORIZONT);
    yozuvlar.push({
      runId: 0, // yozishdan oldin to'ldiriladi
      productId: s.pid,
      branchId: s.bid,
      sinf,
      modelKey,
      p50,
      q90: q90(p50, train, GORIZONT, Z_XOM),
      baseline: naive1(train, GORIZONT),
      zeroProb: nolEhtimoli(train),
      lastQty: train[train.length - 1],
      trainWeeks: train.length,
      nz,
      adi,
      cv2,
      unitPrice: s.unitPrice,
      targetFrom,
      targetTo,
    });
  }
  return { yozuvlar, skippedKam, skippedArch, sinfStat };
}

/** 1-QADAM: origin haftasi uchun prognoz. Run mavjud bo'lsa (va `force` emas) — o'tkazadi. */
async function prognozYaz(
  ctx: Kontekst,
  arxiv: Set<number>,
  force: boolean,
  originIdx: number,
  note?: string
): Promise<{ runId: number; yangi: boolean; forecasted: number; skippedKam: number; skippedArch: number }> {
  const weekStart = haftaDate(ctx.haftalar[originIdx]);
  const kalitObj = { weekStart_horizon_modelKey: { weekStart, horizon: GORIZONT, modelKey: SIYOSAT } };

  const mavjud = await prisma.skuForecastRun.findUnique({ where: kalitObj });
  if (mavjud && !force) {
    return { runId: mavjud.id, yangi: false, forecasted: mavjud.forecasted, skippedKam: mavjud.skippedKam, skippedArch: mavjud.skippedArch };
  }

  const { yozuvlar, skippedKam, skippedArch } = qatorlarniQur(ctx, arxiv, originIdx);

  const run = mavjud
    ? await prisma.skuForecastRun.update({
        where: { id: mavjud.id },
        data: {
          z: Z_XOM,
          panelWeeks: ctx.haftalar.length,
          seriesTotal: ctx.seriyalar.length,
          forecasted: yozuvlar.length,
          skippedKam,
          skippedArch,
          status: "ok",
          note: note ?? null,
          scoredAt: null, // qayta hisoblangan prognoz — bahosi ham qaytadan olinadi
          scoredRows: 0,
          startedAt: new Date(),
          finishedAt: null,
        },
      })
    : await prisma.skuForecastRun.create({
        data: {
          weekStart,
          horizon: GORIZONT,
          modelKey: SIYOSAT,
          z: Z_XOM,
          panelWeeks: ctx.haftalar.length,
          seriesTotal: ctx.seriyalar.length,
          forecasted: yozuvlar.length,
          skippedKam,
          skippedArch,
          note: note ?? null,
        },
      });

  if (mavjud) {
    // Qayta hisoblashda ESKI bahoni ham tashlaymiz: aks holda `skipDuplicates` tufayli
    // eski prognozdan olingan aniqlik qatorlari qolib, yangi p50 bilan mos kelmasdi.
    await prisma.skuForecast.deleteMany({ where: { runId: run.id } });
    await prisma.skuForecastAccuracy.deleteMany({ where: { runId: run.id } });
    await prisma.skuForecastSegment.deleteMany({ where: { runId: run.id } });
  }

  for (let i = 0; i < yozuvlar.length; i += BOLAK) {
    const bolak = yozuvlar.slice(i, i + BOLAK).map((y) => ({ ...y, runId: run.id }));
    await prisma.skuForecast.createMany({ data: bolak, skipDuplicates: true });
  }
  await prisma.skuForecastRun.update({ where: { id: run.id }, data: { finishedAt: new Date() } });

  return { runId: run.id, yangi: true, forecasted: yozuvlar.length, skippedKam, skippedArch };
}

/** SKU meta — kesimlar uchun (bir marta o'qiladi, baholanadigan run bo'lsa). */
interface Meta {
  subkat: Map<number, number | null>;
  kat: Map<number, number | null>;
  abc: Map<number, string | null>;
  nom: Map<string, string>; // "BRANCH 3" → "Mega Center"
}

async function metaOqi(): Promise<Meta> {
  const prods = await prisma.product.findMany({ select: { id: true, categoryId: true, abcClass: true } });
  const kats = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  const katParent = new Map(kats.map((k) => [k.id, k.parentId]));
  const meta: Meta = { subkat: new Map(), kat: new Map(), abc: new Map(), nom: new Map() };
  for (const p of prods) {
    meta.subkat.set(p.id, p.categoryId);
    // Ota-kategoriya (bo'lim). Iyerarxiya 3 daraja: guruh → kategoriya → subkategoriya;
    // SKU odatda subkategoriyaga bog'lanadi, lekin kategoriyaga bog'langani ham bor —
    // u holda o'zi "kat" bo'lib qoladi.
    meta.kat.set(p.id, p.categoryId == null ? null : (katParent.get(p.categoryId) ?? p.categoryId));
    meta.abc.set(p.id, p.abcClass);
  }
  for (const k of kats) {
    meta.nom.set(`KAT ${k.id}`, k.name);
    meta.nom.set(`SUBKAT ${k.id}`, k.name);
  }
  for (const b of branches) meta.nom.set(`BRANCH ${b.id}`, b.name);
  return meta;
}

/**
 * Seriyaning oxirgi `ISHONCH_OYNA` baholangan oynasi bo'yicha WAPE → ishonch belgisi.
 * Bitta oynadan hisoblash shovqinli bo'lardi (siyrak talabda WAPE 0 yoki 100% bo'lib
 * ketadi), shuning uchun oyna to'plami olinadi.
 */
async function ishonchXaritasi(targetToISO: string): Promise<Map<string, Ishonch>> {
  // Sana `$1::date` bilan ANIQ kastlanadi: `date <= timestamptz` taqqoslashi sessiya
  // vaqt mintaqasiga bog'liq bo'lib qolardi va JOIY oyna chegaradan tushib ketishi
  // mumkin edi (ya'ni endi yozilgan baho o'z ishonch belgisiga kirmasdi).
  const rows = await prisma.$queryRawUnsafe<{ pid: number; bid: number; ae: number; a: number }[]>(
    `WITH r AS (
       SELECT "productId" pid, "branchId" bid, "absErr" ae, actual a,
              row_number() OVER (PARTITION BY "productId", "branchId" ORDER BY "targetTo" DESC) rn
       FROM "SkuForecastAccuracy"
       WHERE stockout = false AND "targetTo" <= $1::date
     )
     SELECT pid, bid, SUM(ae)::float8 ae, SUM(a)::float8 a
     FROM r WHERE rn <= ${ISHONCH_OYNA} GROUP BY 1, 2`,
    targetToISO
  );
  const m = new Map<string, Ishonch>();
  for (const r of rows) {
    const belgi = ishonchBelgisi(r.a > 0 ? r.ae / r.a : null);
    if (belgi) m.set(kalit(Number(r.pid), Number(r.bid)), belgi);
  }
  return m;
}

/** 2-QADAM: fakti kelgan (pishgan) run'larni baholash. */
async function baholaPishganlar(ctx: Kontekst): Promise<{ runlar: number; qatorlar: number }> {
  const kutayotgan = await prisma.skuForecastRun.findMany({
    where: { scoredAt: null, horizon: GORIZONT, status: "ok" },
    orderBy: { weekStart: "asc" },
    select: { id: true, weekStart: true, horizon: true },
  });
  // Pishgan = oxirgi prognoz haftasi panelda TO'LIQ hafta sifatida mavjud.
  const pishgan = kutayotgan.filter((r) =>
    ctx.indeks.has(haftaQosh(isoDay(r.weekStart), r.horizon))
  );
  if (pishgan.length === 0) return { runlar: 0, qatorlar: 0 };

  const meta = await metaOqi();
  let qatorlar = 0;

  for (const run of pishgan) {
    const fs = await prisma.skuForecast.findMany({ where: { runId: run.id } });
    if (fs.length === 0) {
      // Detal tozalangan yoki prognoz yozilmagan — qayta-qayta urinmasligi uchun yopamiz.
      await prisma.skuForecastRun.update({
        where: { id: run.id },
        data: { scoredAt: new Date(), scoredRows: 0, note: "detal yo'q — baholanmadi" },
      });
      continue;
    }

    const targetToISO = haftaQosh(isoDay(run.weekStart), run.horizon);
    /** Bir seriyaning bahosi — ishonch belgisi keyin qo'shiladi (u DB'dan o'qiladi). */
    const baholar: { pid: number; bid: number; sinf: Sinf; stockout: boolean; acc: ReturnType<typeof scoreCell> }[] = [];
    const aniqlik: Prisma.SkuForecastAccuracyCreateManyInput[] = [];

    for (const f of fs) {
      const s = ctx.seriyaMap.get(kalit(f.productId, f.branchId));
      if (!s) continue; // seriya paneldan chiqib ketgan (butun oynada sotuv yo'q)
      const i0 = ctx.indeks.get(isoDay(f.targetFrom));
      const i1 = ctx.indeks.get(isoDay(f.targetTo));
      if (i0 == null || i1 == null) continue;

      let actual = 0;
      let posWeeks = 0;
      let stockout = false;
      for (let i = i0; i <= i1; i++) {
        const v = s.qty[i];
        actual += v;
        if (v > 0) posWeeks++;
        if (s.stockout[i]) stockout = true;
      }

      const acc = scoreCell(actual, f.p50, f.baseline, f.unitPrice);
      // DIQQAT: bu kontekstda `posWeeks` — oyna ichidagi nolmas HAFTALAR soni
      // (katak emas). Metrika formulalari posWeeks'ni ishlatmaydi, faqat ko'rsatkich.
      acc.posWeeks = posWeeks;

      aniqlik.push({
        runId: run.id,
        productId: f.productId,
        branchId: f.branchId,
        sinf: f.sinf,
        modelKey: f.modelKey,
        actual,
        forecast: f.p50,
        baseline: f.baseline,
        absErr: acc.absErr,
        sqErr: acc.sqErr,
        baseAbsErr: acc.baseAbsErr,
        baseSqErr: acc.baseSqErr,
        amountWeight: acc.amountWeight,
        posWeeks,
        stockout,
        targetTo: f.targetTo,
      });

      baholar.push({ pid: f.productId, bid: f.branchId, sinf: f.sinf as Sinf, stockout, acc });
    }

    for (let i = 0; i < aniqlik.length; i += BOLAK) {
      await prisma.skuForecastAccuracy.createMany({
        data: aniqlik.slice(i, i + BOLAK),
        skipDuplicates: true,
      });
    }

    // Ishonch belgisi — shu oyna YOZILGANDAN keyin o'qiladi (u ham hisobga kirsin).
    const ishonch = await ishonchXaritasi(targetToISO);

    // Qoldiq tugagan oyna kesimga KIRMAYDI: sotuv 0 bo'lgani talab yo'qligini
    // bildirmaydi. Qator baribir yozilgan (audit uchun), faqat metrikadan chiqadi.
    const bahoQatorlari: BahoQatori[] = baholar
      .filter((b) => !b.stockout)
      .map((b) => ({
        sinf: b.sinf,
        branchId: b.bid,
        katId: meta.kat.get(b.pid) ?? null,
        subkatId: meta.subkat.get(b.pid) ?? null,
        abc: meta.abc.get(b.pid) ?? null,
        acc: b.acc,
        ishonch: ishonch.get(kalit(b.pid, b.bid)) ?? null,
      }));

    const segmentlar = segmentla(bahoQatorlari);
    await prisma.skuForecastSegment.deleteMany({ where: { runId: run.id } });
    const segYozuv: Prisma.SkuForecastSegmentCreateManyInput[] = segmentlar.map((s) => ({
      runId: run.id,
      horizon: run.horizon,
      scope: s.scope,
      key: s.key,
      label: s.key === HAMMASI ? null : (meta.nom.get(`${s.scope} ${s.key}`) ?? null),
      seriya: s.seriya,
      n: s.acc.n,
      posWeeks: s.acc.posWeeks,
      actual: s.acc.actual,
      forecast: s.acc.forecast,
      absErr: s.acc.absErr,
      sqErr: s.acc.sqErr,
      baseAbsErr: s.acc.baseAbsErr,
      baseSqErr: s.acc.baseSqErr,
      amountWeight: s.acc.amountWeight,
      ishonchli: s.ishonchli,
      taxminiy: s.taxminiy,
      ishonchsiz: s.ishonchsiz,
    }));
    for (let i = 0; i < segYozuv.length; i += BOLAK) {
      await prisma.skuForecastSegment.createMany({
        data: segYozuv.slice(i, i + BOLAK),
        skipDuplicates: true,
      });
    }

    await prisma.skuForecastRun.update({
      where: { id: run.id },
      data: { scoredAt: new Date(), scoredRows: aniqlik.length },
    });
    qatorlar += aniqlik.length;
  }

  return { runlar: pishgan.length, qatorlar };
}

/** 3-QADAM: detal jadvallarni oynada ushlab turish (agregat tegilmaydi). */
async function tozala(ctx: Kontekst): Promise<{ prognoz: number; aniqlik: number }> {
  const pChegara = haftaDate(haftaQosh(ctx.origin, -SAQLASH_PROGNOZ_HAFTA));
  const aChegara = haftaDate(haftaQosh(ctx.origin, -SAQLASH_ANIQLIK_HAFTA));
  // Ketma-ket: haftada bir marta ishlaydigan ikki DELETE'da parallelizm hech narsa
  // bermaydi, pool esa og'ir panel o'qishi bilan ulashilgan.
  const p = await prisma.skuForecast.deleteMany({ where: { targetTo: { lt: pChegara } } });
  const a = await prisma.skuForecastAccuracy.deleteMany({ where: { targetTo: { lt: aChegara } } });
  return { prognoz: p.count, aniqlik: a.count };
}

async function arxivOqi(): Promise<Set<number>> {
  const rows = await prisma.product.findMany({
    where: { archivedAt: { not: null } },
    select: { id: true },
  });
  return new Set(rows.map((p) => p.id));
}

/**
 * Import kechikishi: 1 hafta — hali yuklanmagan bo'lishi mumkin (ogohlantirish),
 * 2+ hafta — haqiqiy uzilish, admin bilishi kerak (cron alerti).
 */
function kechikishniTekshir(ctx: Kontekst): void {
  if (ctx.kechikish >= 2) {
    throw new Error(
      `sotuv importi kechikkan: paneldagi oxirgi to'liq hafta ${ctx.origin}, ` +
        `kutilgan ${haftaQosh(ctx.origin, ctx.kechikish)} (${ctx.kechikish} hafta)`
    );
  }
  if (ctx.kechikish >= 1) {
    console.warn(`[prognoz] sotuv importi 1 hafta orqada — origin ${ctx.origin}`);
  }
}

/** QURUQ tekshiruv — DB'ga HECH NARSA yozmaydi. Deploydan oldin ishlatiladi. */
export async function prognozQuruq(opts: { now?: Date } = {}): Promise<{
  origin: string;
  panelWeeks: number;
  kechikish: number;
  seriesTotal: number;
  forecasted: number;
  skippedKam: number;
  skippedArch: number;
  sinfStat: Record<string, number>;
  namuna: Prisma.SkuForecastCreateManyInput[];
}> {
  const ctx = await konteksOqi(opts.now ?? nowTashkent());
  const arxiv = await arxivOqi();
  const q = qatorlarniQur(ctx, arxiv, ctx.haftalar.length - 1);
  return {
    origin: ctx.origin,
    panelWeeks: ctx.haftalar.length,
    kechikish: ctx.kechikish,
    seriesTotal: ctx.seriyalar.length,
    forecasted: q.yozuvlar.length,
    skippedKam: q.skippedKam,
    skippedArch: q.skippedArch,
    sinfStat: Object.fromEntries(q.sinfStat),
    namuna: q.yozuvlar.slice(0, 5),
  };
}

/**
 * BACKFILL — o'tgan origin'lar uchun "go'yo o'sha paytda" prognoz yozadi, keyin ularni
 * darhol baholaydi. Shunda sifat tarixi 5 hafta kutmasdan, birinchi kundan to'ladi.
 *
 * TRAIN QAT'IY KESILADI (`qatorlarniQur` da) — kelajak ko'rinmaydi, ya'ni aniqlik
 * haqiqiy out-of-sample. Ikki KICHIK yon ta'sir bor va ular ataylab qabul qilingan:
 *   • arxiv ro'yxati BUGUNGI holat (o'sha paytda faol bo'lgan, hozir arxivlangan SKU
 *     backfill'ga kirmaydi) — populyatsiyaga ta'sir, seriya aniqligiga emas;
 *   • `unitPrice` butun oyna bo'yicha o'rtacha (so'mli OG'IRLIK, model kirishi emas).
 * Run'lar `note = "backfill"` bilan belgilanadi — jonli yugurishlardan ajratib turadi.
 */
export async function backfill(opts: { force?: boolean } = {}): Promise<YugurNatija[]> {
  const ctx = await konteksOqi(nowTashkent());
  const arxiv = await arxivOqi();
  const natija: YugurNatija[] = [];

  // Origin shartlari: train ≥ MIN_TRAIN hafta VA oyna to'liq yopilgan (fakt bor).
  const boshIdx = MIN_TRAIN - 1;
  const oxirIdx = ctx.haftalar.length - 1 - GORIZONT;
  for (let i = boshIdx; i <= oxirIdx; i++) {
    const p = await prognozYaz(ctx, arxiv, opts.force ?? false, i, "backfill");
    natija.push({
      origin: ctx.haftalar[i],
      panelWeeks: ctx.haftalar.length,
      kechikish: 0,
      seriesTotal: ctx.seriyalar.length,
      yangi: p.yangi,
      forecasted: p.forecasted,
      skippedKam: p.skippedKam,
      skippedArch: p.skippedArch,
      baholanganRun: 0,
      baholanganQator: 0,
      tozalandi: { prognoz: 0, aniqlik: 0 },
    });
    console.log(`[backfill] origin ${ctx.haftalar[i]}: ${p.yangi ? `${p.forecasted} prognoz` : "mavjud"}`);
  }

  const b = await baholaPishganlar(ctx);
  console.log(`[backfill] baho: ${b.runlar} run / ${b.qatorlar} qator`);
  if (natija.length > 0) {
    natija[natija.length - 1].baholanganRun = b.runlar;
    natija[natija.length - 1].baholanganQator = b.qatorlar;
  }
  return natija;
}

/** Butun konveyer. `force` — joriy hafta run'ini qayta hisoblash. */
export async function prognozYugur(opts: { force?: boolean; now?: Date } = {}): Promise<YugurNatija> {
  const ctx = await konteksOqi(opts.now ?? nowTashkent());
  kechikishniTekshir(ctx);

  const arxiv = await arxivOqi();
  const p = await prognozYaz(ctx, arxiv, opts.force ?? false, ctx.haftalar.length - 1);
  const b = await baholaPishganlar(ctx);
  const t = await tozala(ctx);

  return {
    origin: ctx.origin,
    panelWeeks: ctx.haftalar.length,
    kechikish: ctx.kechikish,
    seriesTotal: ctx.seriyalar.length,
    yangi: p.yangi,
    forecasted: p.forecasted,
    skippedKam: p.skippedKam,
    skippedArch: p.skippedArch,
    baholanganRun: b.runlar,
    baholanganQator: b.qatorlar,
    tozalandi: t,
  };
}
