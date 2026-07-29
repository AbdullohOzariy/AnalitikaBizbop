/**
 * So'ralgan mahsulot nomini KANONIK mahsulotga va subkategoriyaga bog'lash.
 *
 * SKU (Product) ga bog'lash ATAYLAB OLIB TASHLANGAN: operator "sotuvda mavjud emas"
 * degan mahsulot katalogda ham yo'q — ya'ni SKU aynan eng qimmatli holatda (assortiment
 * bo'shlig'i) topilmaydi. Reyestr shu sababdan MIJOZ TILIDAN quriladi.
 *
 * Oqim: tezHal() (alias/nom/fuzzy — LLM'siz) → nomzodlar → Gemini Flash-Lite tanlaydi
 * yoki YANGI kanon nomini beradi.
 */
import { prisma } from "@/lib/prisma";
import { callGemini, MODEL_FAST } from "./gemini";
import { getCommunityConfig } from "./sozlama";
import { redactError } from "@/lib/tg-redact";
import { canonKey } from "./kanon-kalit";
import { tezHal, nomzodKanonlar, kanonniOlYokiYarat, bogla } from "./kanon";

/** Bitta LLM chaqiruvida nechta so'rov. */
const BATCH = 8;
/** Shu ishonchdan past bo'lsa YANGI kanon YARATILMAYDI — reyestr shishmasin. */
const MIN_YANGI_KANON = 0.6;

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
          canonIndex: {
            type: "integer",
            description: "Mavjud kanon nomzodi indeksi; mos kelmasa -1",
          },
          newName: {
            type: "string",
            description:
              "canonIndex=-1 bo'lganda YANGI kanonik nom (o'zbek lotin, birlik son, " +
              "o'lchovsiz, faqat 1-harf katta). Aks holda \"\"",
          },
          categoryId: { type: "integer", description: "Subkategoriya ID (ro'yxatdan); aniqlanmasa 0" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["n", "canonIndex", "newName", "categoryId", "confidence"],
      },
    },
  },
  required: ["items"],
} as const;

const MATCH_SYSTEM = `Sen supermarket mijozlari chatidan kelgan mahsulot nomlarini KANONIK
reyestrga bog'laysan. Faqat JSON qaytar.

VAZIFA: mijoz turlicha yozadi — "Shaftoli", "шафтоли", "Persik", "Персик", "saftoli",
"shaftoli 1kg" — bularning HAMMASI BITTA kanonga tushishi kerak.

QOIDALAR
1. Avval NOMZODLAR ro'yxatiga qara. Mijoz so'ragan mahsulot ular orasida BOR bo'lsa —
   o'sha nomzodning RAQAMINI (canonIndex) qaytar. IKKILANSANG MAVJUDINI OL — yangi
   kanon yaratish oxirgi chora.
2. Ruscha va o'zbekcha nom BIR XIL mahsulotni bildirsa — BIR kanon:
   Persik=Shaftoli · Arbuz=Tarvuz · Vinograd=Uzum · Yabloko=Olma · Kartoshka=Kartoshka ·
   Luk=Piyoz · Morkov=Sabzi · Svekla=Lavlagi · Ogurets=Bodring · Pomidor=Pomidor ·
   Kuritsa=Tovuq · Govyadina=Mol go'shti · Moloko=Sut · Smetana=Qaymoq · Tvorog=Tvorog ·
   Yaytso=Tuxum · Xleb=Non · Muka=Un · Saxar=Shakar · Sol=Tuz · Maslo=Yog' · Ris=Guruch.
3. TURI boshqa bo'lsa ALOHIDA kanon: "Uzum" va "Qora uzum" — alohida; "Sut" va
   "Sutli shokolad" — alohida; "Tort" va "Bento tort" — alohida.
4. YANGI kanon nomi (canonIndex=-1 bo'lganda): O'ZBEK LOTIN, BIRLIK son, o'lchovsiz,
   brendsiz, faqat birinchi harf katta. "shaftolilar 1kg" → "Shaftoli";
   "Мазzona somsa xamiri" → "Somsa xamiri"; "Bento tort" → "Bento tort".
5. Mahsulot EMAS (menyu, aksiya, ish vaqti, shikoyat) bo'lsa: canonIndex=-1, newName="".
6. categoryId — kanon qaysi subkategoriyaga tegishli bo'lardi. Katalogda bunday mahsulot
   BO'LMASA HAM to'ldiriladi (aynan shunday holatlar eng qimmatli). Aniqlab bo'lmasa 0.
7. confidence: 0.9+ aniq · 0.6-0.9 ehtimol · <0.6 shubhali.`;

export interface MatchNatija {
  total: number;
  fromCache: number;
  kanon: number;
  yangiKanon: number;
  categorized: number;
  none: number;
  errors: number;
  inTokens: number;
  outTokens: number;
}

/**
 * PENDING holatdagi so'rovlarni kanonga bog'laydi.
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
    select: { id: true, productNorm: true, productText: true, brand: true },
    take: opts?.limit ?? 500,
    orderBy: { id: "asc" },
  });

  const natija: MatchNatija = {
    total: rows.length,
    fromCache: 0,
    kanon: 0,
    yangiKanon: 0,
    categorized: 0,
    none: 0,
    errors: 0,
    inTokens: 0,
    outTokens: 0,
  };
  if (rows.length === 0) return natija;

  // ── 1-2. LLM'siz yechiladiganlar ──
  const qolgan: typeof rows = [];
  for (const r of rows) {
    const tez = await tezHal(r.productNorm!);
    if (!tez) {
      qolgan.push(r);
      continue;
    }
    await bogla({
      raw: r.productNorm!,
      canonId: tez.canonId,
      categoryId: tez.categoryId,
      source: tez.source,
      score: tez.score,
      requestId: r.id,
    });
    natija.fromCache++;
    natija.kanon++;
    if (tez.categoryId) natija.categorized++;
  }
  log(`kalitdan: ${natija.fromCache}, LLM kerak: ${qolgan.length}`);
  if (qolgan.length === 0) return natija;

  // ── 3-4. Nomzodlar → LLM ──
  const subkat = await subkategoriyalar();
  const subkatMatn = subkat.map((s) => `${s.id}=${s.parent} > ${s.name}`).join("\n");
  const subkatIds = new Set(subkat.map((s) => s.id));

  for (let i = 0; i < qolgan.length; i += BATCH) {
    const bolak = qolgan.slice(i, i + BATCH);
    const nomzodlar = await Promise.all(bolak.map((r) => nomzodKanonlar(r.productNorm!)));

    const sorovMatn = bolak
      .map((r, n) => {
        const c = nomzodlar[n];
        const lines = c.length
          ? c.map((x, idx) => `   ${idx}. ${x.name}`).join("\n")
          : "   (reyestr bo'sh — yangi kanon yarating)";
        return `#${n} so'ralgan: "${r.productText ?? ""}" → normal: ${r.productNorm}${
          r.brand ? ` | brend: ${r.brand}` : ""
        }\n  NOMZOD KANONLAR:\n${lines}`;
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
        items: { n: number; canonIndex: number; newName: string; categoryId: number; confidence: number }[];
      };

      for (const it of parsed.items ?? []) {
        const r = bolak[it.n];
        if (!r) continue; // model mavjud bo'lmagan raqam qaytardi
        const c = nomzodlar[it.n] ?? [];
        const score = Math.max(0, Math.min(1, Number(it.confidence) || 0));
        const catId = subkatIds.has(it.categoryId) ? it.categoryId : null;

        // Model INDEKS qaytaradi — canonId emas, ya'ni mavjud bo'lmagan ID o'ylab topa olmaydi
        const tanlangan = it.canonIndex >= 0 && it.canonIndex < c.length ? c[it.canonIndex] : null;

        if (tanlangan) {
          await bogla({
            raw: r.productNorm!,
            canonId: tanlangan.id,
            categoryId: tanlangan.categoryId ?? catId,
            source: "AI",
            score,
            requestId: r.id,
          });
          natija.kanon++;
          if (tanlangan.categoryId ?? catId) natija.categorized++;
          continue;
        }

        const nom = (it.newName ?? "").trim();
        // Shubhali qarorda YANGI kanon yaratmaymiz — reyestr shishishining asosiy manbai
        if (!nom || !canonKey(nom) || score < MIN_YANGI_KANON) {
          await prisma.tgRequest.update({
            where: { id: r.id },
            data: { matchStatus: "NONE", matchScore: score, categoryId: catId },
          });
          natija.none++;
          if (catId) natija.categorized++;
          continue;
        }

        const yangi = await kanonniOlYokiYarat({
          name: nom,
          categoryId: catId,
          source: "AI",
          synonym: r.productNorm!,
        });
        await bogla({
          raw: r.productNorm!,
          canonId: yangi.id,
          categoryId: yangi.categoryId ?? catId,
          source: "AI",
          score,
          requestId: r.id,
        });
        natija.kanon++;
        if (yangi.yangi) natija.yangiKanon++;
        if (yangi.categoryId ?? catId) natija.categorized++;
      }
      log(`  bo'lak ${Math.floor(i / BATCH) + 1}: ${parsed.items?.length ?? 0} ta hal qilindi`);
    } catch (err) {
      natija.errors++;
      log(`  ✗ ${redactError(err).slice(0, 200)}`);
    }
  }

  return natija;
}
