/**
 * So'ralgan mahsulot nomini SKU va subkategoriyaga moslashtirish.
 *
 * UCH BOSQICH (LLM eng oxirida — arzonlik va aniqlik uchun):
 *   A. `TgProductAlias` keshi — bir marta yechilgan nom qayta LLM'ga BORMAYDI.
 *   B. pg_trgm `word_similarity` — nomzodlar (bepul, indeksli).
 *   C. Gemini Flash-Lite nomzodlardan INDEKS bo'yicha tanlaydi + subkategoriyani beradi.
 *
 * NEGA TRIGRAM YOLG'IZ YETMAYDI (o'lchangan):
 *   "AVOKADO"           → word_similarity 1.00 "MYAGKAYA IGRUSHKA AVOKADO" (o'yinchoq!)
 *   "UGOL DLYA MANGALA" → 0.72 "VEER DLYA MANGALA" (yelpig'ich)
 * Ya'ni yuqori ball ham to'g'ri javobni kafolatlamaydi — tanlovni model qiladi.
 *
 * NEGA SUBKATEGORIYA ALOHIDA: operator "sotuvda mavjud emas" degan mahsulot katalogda
 * ham YO'Q bo'ladi — ya'ni SKU moslashtirish aynan ENG QIMMATLI holatlarda (assortiment
 * bo'shlig'i) ishlamaydi. Shuning uchun kategoriya SKU'ga BOG'LIQ BO'LMAY aniqlanadi.
 */
import { prisma } from "@/lib/prisma";
import { callGemini, MODEL_FAST } from "./gemini";
import { getCommunityConfig } from "./sozlama";
import { redactError } from "@/lib/tg-redact";

/** Nomzodga kirish uchun minimal so'z-o'xshashligi. */
const MIN_WORD_SIM = 0.45;
/** Bitta so'rovga nechta nomzod ko'rsatiladi. */
const NOMZOD = 12;
/** Bitta LLM chaqiruvida nechta so'rov (kontekst uzunligi va aniqlik muvozanati). */
const BATCH = 8;

export interface Nomzod {
  id: number;
  name: string;
  categoryId: number | null;
  w: number;
}

/** Normalizatsiya — alias kaliti: ortiqcha bo'shliq/registr farqi bir xil yozuvga tushsin. */
export function normKalit(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, " ").slice(0, 120);
}

/**
 * Trigram bo'yicha nomzodlar. `searchTerms` ham qo'shiladi — mijoz o'zbekcha yozgan
 * bo'lsa, AI bergan variantlar orqali katalogga chiqamiz.
 */
export async function nomzodlar(norm: string, searchTerms: string[]): Promise<Nomzod[]> {
  const terms = [norm, ...searchTerms].map((s) => s.trim()).filter((s) => s.length >= 3);
  if (terms.length === 0) return [];

  // Har termin uchun eng yaxshi moslar, so'ng birlashtirib eng yuqori ball bo'yicha saralanadi.
  const rows = await prisma.$queryRaw<{ id: number; name: string; categoryId: number | null; w: number }[]>`
    SELECT DISTINCT ON (p.id) p.id, p.name, p."categoryId", MAX(sim.w) AS w
    FROM unnest(${terms}::text[]) AS t(term)
    CROSS JOIN LATERAL (
      SELECT p2.id, word_similarity(t.term, p2.name) AS w
      FROM "Product" p2
      WHERE p2."archivedAt" IS NULL
        AND word_similarity(t.term, p2.name) >= ${MIN_WORD_SIM}
      ORDER BY w DESC
      LIMIT ${NOMZOD}
    ) sim
    JOIN "Product" p ON p.id = sim.id
    GROUP BY p.id, p.name, p."categoryId"
    ORDER BY p.id, w DESC
  `;

  return rows
    .map((r) => ({ ...r, w: Number(r.w) }))
    .sort((a, b) => b.w - a.w)
    .slice(0, NOMZOD);
}

let subkatCache: { val: { id: number; name: string; parent: string }[]; at: number } | null = null;

/** Subkategoriyalar ro'yxati (kat > subkat) — promptga statik ro'yxat bo'lib tushadi. */
export async function subkategoriyalar(): Promise<{ id: number; name: string; parent: string }[]> {
  if (subkatCache && Date.now() - subkatCache.at < 10 * 60_000) return subkatCache.val;
  const rows = await prisma.category.findMany({
    where: { parentId: { not: null } },
    select: { id: true, name: true, parent: { select: { name: true } } },
    orderBy: { id: "asc" },
  });
  const val = rows.map((r) => ({ id: r.id, name: r.name, parent: r.parent?.name ?? "" }));
  subkatCache = { val, at: Date.now() };
  return val;
}

const MATCH_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer", description: "So'rov raqami (ro'yxatdagi)" },
          skuIndex: {
            type: "integer",
            description: "Tanlangan nomzod indeksi; mos kelmasa -1",
          },
          categoryId: {
            type: "integer",
            description: "Subkategoriya ID (ro'yxatdan); aniqlanmasa 0",
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["n", "skuIndex", "categoryId", "confidence"],
      },
    },
  },
  required: ["items"],
} as const;

const MATCH_SYSTEM = `Sen supermarket katalogi bo'yicha moslashtiruvchisan. Mijoz so'ragan
mahsulot nomiga KATALOGDAGI to'g'ri SKU ni va SUBKATEGORIYANI tanlaysan. Faqat JSON qaytar.

QOIDALAR
1. skuIndex — berilgan nomzodlar ro'yxatidagi RAQAM. Nomzodlar orasida mijoz so'ragan
   narsa YO'Q bo'lsa -1 qaytar. SKU nomini yoki kodini O'YLAB TOPMA.
2. DIQQAT — o'xshash nom BOSHQA MAHSULOT bo'lishi mumkin. Misollar:
   "avokado" (meva) ≠ "MYAGKAYA IGRUSHKA AVOKADO" (o'yinchoq) → -1
   "ko'mir" (mangal uchun) ≠ "VEER DLYA MANGALA" (yelpig'ich) → -1
   "farsh" (qiyma go'sht) ≠ "PRIPRAVA K MYASNOMU FARSHU" (ziravor) → -1
   Turi mos kelmasa -1 qaytar — noto'g'ri moslik bo'sh moslikdan YOMONROQ.
3. Vazn/hajm/rang farqi mos kelmaslik EMAS: "qora soch bo'yog'i" uchun
   "KREM-KRASKA DLYA VOLOS 1.0" mos (1.0 = qora ton).
4. categoryId — SKU topilmasa HAM to'ldiriladi: mahsulot mazmunan qaysi subkategoriyaga
   tegishli bo'lardi. Aniqlab bo'lmasa 0.
5. confidence: 0.9+ aniq · 0.6-0.9 ehtimol · <0.6 shubhali.`;

export interface MatchNatija {
  total: number;
  fromCache: number;
  matched: number;
  categorized: number;
  none: number;
  errors: number;
  inTokens: number;
  outTokens: number;
}

/**
 * PENDING holatdagi so'rovlarni moslashtiradi.
 * `onlyIds` berilsa faqat o'shalar (qo'lda qayta ishga tushirish uchun).
 */
export async function moslashtir(opts?: {
  dayKey?: string;
  onlyIds?: number[];
  limit?: number;
  onProgress?: (m: string) => void;
}): Promise<MatchNatija> {
  const log = opts?.onProgress ?? (() => {});
  const cfg = await getCommunityConfig();

  const rows = await prisma.tgRequest.findMany({
    where: {
      ...(opts?.onlyIds ? { id: { in: opts.onlyIds } } : { matchStatus: "PENDING" }),
      ...(opts?.dayKey ? { dayKey: opts.dayKey } : {}),
      productNorm: { not: null },
    },
    select: { id: true, productNorm: true, searchTerms: true, productText: true, brand: true },
    take: opts?.limit ?? 500,
    orderBy: { id: "asc" },
  });

  const natija: MatchNatija = {
    total: rows.length,
    fromCache: 0,
    matched: 0,
    categorized: 0,
    none: 0,
    errors: 0,
    inTokens: 0,
    outTokens: 0,
  };
  if (rows.length === 0) return natija;

  // ── A. Alias keshi ──
  const kalitlar = [...new Set(rows.map((r) => normKalit(r.productNorm!)))];
  const aliases = await prisma.tgProductAlias.findMany({ where: { norm: { in: kalitlar } } });
  const aliasMap = new Map(aliases.map((a) => [a.norm, a]));

  const qolgan: typeof rows = [];
  for (const r of rows) {
    const a = aliasMap.get(normKalit(r.productNorm!));
    if (!a) {
      qolgan.push(r);
      continue;
    }
    await prisma.tgRequest.update({
      where: { id: r.id },
      data: {
        productId: a.productId,
        categoryId: a.categoryId,
        matchStatus: a.source === "MANUAL" ? "MANUAL" : a.productId ? "AUTO" : "NONE",
        matchScore: a.score,
      },
    });
    await prisma.tgProductAlias.update({ where: { id: a.id }, data: { hits: { increment: 1 } } });
    natija.fromCache++;
    if (a.productId) natija.matched++;
    if (a.categoryId) natija.categorized++;
  }
  log(`keshdan: ${natija.fromCache}, LLM kerak: ${qolgan.length}`);

  if (qolgan.length === 0) return natija;

  // ── B + C. Nomzodlar → LLM tanlovi ──
  const subkat = await subkategoriyalar();
  const subkatMatn = subkat.map((s) => `${s.id}=${s.parent} > ${s.name}`).join("\n");
  const subkatIds = new Set(subkat.map((s) => s.id));

  for (let i = 0; i < qolgan.length; i += BATCH) {
    const bolak = qolgan.slice(i, i + BATCH);
    const nomzodlarRoyxati = await Promise.all(
      bolak.map((r) => nomzodlar(r.productNorm!, r.searchTerms ?? []))
    );

    const sorovMatn = bolak
      .map((r, n) => {
        const c = nomzodlarRoyxati[n];
        const lines = c.length
          ? c.map((x, idx) => `   ${idx}. ${x.name}`).join("\n")
          : "   (nomzod topilmadi)";
        return `#${n} so'ralgan: "${r.productText ?? ""}" → normal: ${r.productNorm}${
          r.brand ? ` | brend: ${r.brand}` : ""
        }\n  NOMZODLAR:\n${lines}`;
      })
      .join("\n\n");

    try {
      const out = await callGemini({
        model: MODEL_FAST,
        system: MATCH_SYSTEM,
        input: `SUBKATEGORIYALAR:\n${subkatMatn}\n\nSO'ROVLAR:\n${sorovMatn}`,
        schema: MATCH_SCHEMA as unknown as Record<string, unknown>,
        apiKey: cfg.apiKey ?? undefined,
        maxOutputTokens: 4096,
      });
      natija.inTokens += out.inTokens;
      natija.outTokens += out.outTokens;

      const parsed = JSON.parse(out.text) as {
        items: { n: number; skuIndex: number; categoryId: number; confidence: number }[];
      };

      for (const it of parsed.items ?? []) {
        const r = bolak[it.n];
        if (!r) continue; // model mavjud bo'lmagan raqam qaytardi
        const c = nomzodlarRoyxati[it.n] ?? [];
        // Model INDEKS qaytaradi — skuId emas, shuning uchun o'ylab topa olmaydi
        const tanlangan = it.skuIndex >= 0 && it.skuIndex < c.length ? c[it.skuIndex] : null;
        const catId = subkatIds.has(it.categoryId) ? it.categoryId : null;
        const categoryId = tanlangan?.categoryId ?? catId;
        const score = Math.max(0, Math.min(1, Number(it.confidence) || 0));

        await prisma.tgRequest.update({
          where: { id: r.id },
          data: {
            productId: tanlangan?.id ?? null,
            categoryId,
            matchStatus: tanlangan ? "AI" : "NONE",
            matchScore: score,
          },
        });

        // Keshga — keyingi safar shu nom LLM'ga bormaydi
        await prisma.tgProductAlias.upsert({
          where: { norm: normKalit(r.productNorm!) },
          create: {
            norm: normKalit(r.productNorm!),
            productId: tanlangan?.id ?? null,
            categoryId,
            source: "AI",
            score,
            hits: 1,
          },
          update: { productId: tanlangan?.id ?? null, categoryId, score, hits: { increment: 1 } },
        });

        if (tanlangan) natija.matched++;
        else natija.none++;
        if (categoryId) natija.categorized++;
      }
      log(`  bo'lak ${i / BATCH + 1}: ${parsed.items?.length ?? 0} ta hal qilindi`);
    } catch (err) {
      natija.errors++;
      log(`  ✗ ${redactError(err).slice(0, 200)}`);
    }
  }

  return natija;
}
