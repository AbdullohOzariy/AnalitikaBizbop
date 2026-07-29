/**
 * KANONIK mahsulot reyestrini yuritish: variant nomni kanonga yechish, yangi kanon
 * yaratish, kanonlarni birlashtirish.
 *
 * YECHISH POG'ONALARI (LLM eng oxirida — arzon va barqaror):
 *   1. ANIQ KALIT   — alias.normKey yoki canon.nameKey to'liq mos → tayyor javob.
 *   2. FUZZY KALIT  — fuzzyKey mos va nomzod YAGONA bo'lsa → avto-bog'lash.
 *   3. NOMZODLAR    — reyestr kichik bo'lsa butunlay, katta bo'lsa trigram bo'yicha.
 *   4. LLM          — nomzodlardan tanlaydi YOKI yangi kanon nomini beradi.
 *
 * DUBLIKATGA QARSHI: `TgCanonProduct.nameKey` UNIQUE — bu yagona FIZIK kafolat.
 * Ikki parallel bo'lak bir vaqtda "Shaftoli" yaratmoqchi bo'lsa, biri P2002 oladi va
 * mavjudini o'qiydi (`kanonniOlYokiYarat`).
 */
import { prisma } from "@/lib/prisma";
import { canonKey, fuzzyKey, kanonNom } from "./kanon-kalit";

/** Reyestr shu chegaradan kichik bo'lsa — butunlay promptga soladi (aniqroq). */
export const REYESTR_PROMPTGA = 300;
/** Promptga soladigan maksimal nomzod (reyestr katta bo'lganda). */
export const NOMZOD_MAX = 25;

export interface KanonQisqa {
  id: number;
  name: string;
  categoryId: number | null;
  hits: number;
}

export interface TezNatija {
  canonId: number;
  categoryId: number | null;
  source: "EXACT" | "FUZZY";
  score: number;
}

/** Tombstone bo'lsa — birlashtirilgan kanonning o'rniga maqsadni qaytaradi. */
async function tirikKanon(id: number): Promise<{ id: number; categoryId: number | null } | null> {
  let cur = await prisma.tgCanonProduct.findUnique({
    where: { id },
    select: { id: true, categoryId: true, mergedIntoId: true },
  });
  // Zanjir bo'lishi mumkin (A→B→C); halqadan himoya uchun qadam cheklangan
  for (let i = 0; cur?.mergedIntoId != null && i < 5; i++) {
    cur = await prisma.tgCanonProduct.findUnique({
      where: { id: cur.mergedIntoId },
      select: { id: true, categoryId: true, mergedIntoId: true },
    });
  }
  return cur ? { id: cur.id, categoryId: cur.categoryId } : null;
}

/**
 * LLM'siz yechishga urinish. Topilmasa `null` — chaqiruvchi LLM bosqichiga o'tadi.
 */
export async function tezHal(raw: string): Promise<TezNatija | null> {
  const nk = canonKey(raw);
  if (!nk) return null;
  const fk = fuzzyKey(raw);

  // 1) Aniq: alias
  const alias = await prisma.tgProductAlias.findUnique({ where: { normKey: nk } });
  if (alias) {
    const canon = await tirikKanon(alias.canonId);
    if (canon) {
      await prisma.tgProductAlias.update({
        where: { id: alias.id },
        data: { hits: { increment: 1 } },
      });
      return { canonId: canon.id, categoryId: canon.categoryId, source: "EXACT", score: 1 };
    }
  }

  // 1b) Aniq: kanonning o'z nomi
  const nomMos = await prisma.tgCanonProduct.findUnique({ where: { nameKey: nk } });
  if (nomMos) {
    const canon = await tirikKanon(nomMos.id);
    if (canon) return { canonId: canon.id, categoryId: canon.categoryId, source: "EXACT", score: 1 };
  }

  // 2) Fuzzy — FAQAT nomzod yagona bo'lsa (aks holda noto'g'ri birlashtirish xavfi)
  if (fk) {
    const [kanonlar, aliaslar] = await Promise.all([
      prisma.tgCanonProduct.findMany({
        where: { fuzzyKey: fk, mergedIntoId: null },
        select: { id: true, categoryId: true },
        take: 2,
      }),
      prisma.tgProductAlias.findMany({ where: { fuzzyKey: fk }, select: { canonId: true }, take: 5 }),
    ]);
    const idlar = new Set<number>([...kanonlar.map((k) => k.id), ...aliaslar.map((a) => a.canonId)]);
    if (idlar.size === 1) {
      const canon = await tirikKanon([...idlar][0]);
      if (canon) {
        return { canonId: canon.id, categoryId: canon.categoryId, source: "FUZZY", score: 0.85 };
      }
    }
  }

  return null;
}

/** LLM ga beriladigan nomzodlar. Reyestr kichik bo'lsa — hammasi. */
export async function nomzodKanonlar(raw: string): Promise<KanonQisqa[]> {
  const jami = await prisma.tgCanonProduct.count({ where: { mergedIntoId: null } });

  if (jami <= REYESTR_PROMPTGA) {
    return prisma.tgCanonProduct.findMany({
      where: { mergedIntoId: null },
      select: { id: true, name: true, categoryId: true, hits: true },
      orderBy: { id: "asc" }, // BARQAROR tartib — prompt prefiksi o'zgarmasin (kesh)
    });
  }

  // Katta reyestr: trigram bo'yicha eng yaqinlari + eng ko'p uchraganlari
  const fk = fuzzyKey(raw) || canonKey(raw);
  const yaqin = await prisma.$queryRaw<KanonQisqa[]>`
    SELECT id, name, "categoryId", hits
    FROM "TgCanonProduct"
    WHERE "mergedIntoId" IS NULL AND word_similarity(${fk}, "fuzzyKey") >= 0.4
    ORDER BY word_similarity(${fk}, "fuzzyKey") DESC
    LIMIT ${NOMZOD_MAX}
  `;
  return yaqin;
}

/**
 * Kanonni oladi yoki yaratadi. RACE-SAFE: `nameKey` UNIQUE bo'lgani uchun ikki parallel
 * chaqiruvdan biri P2002 oladi va mavjudini o'qiydi.
 */
export async function kanonniOlYokiYarat(input: {
  name: string;
  categoryId: number | null;
  source?: "AI" | "MANUAL";
  synonym?: string;
}): Promise<{ id: number; categoryId: number | null; yangi: boolean }> {
  const name = kanonNom(input.name);
  const nameKey = canonKey(name);
  if (!nameKey) throw new Error("Kanon nomi bo'sh.");

  const bor = await prisma.tgCanonProduct.findUnique({ where: { nameKey } });
  if (bor) {
    const tirik = await tirikKanon(bor.id);
    if (tirik) {
      await prisma.tgCanonProduct.update({
        where: { id: tirik.id },
        data: {
          lastSeenAt: new Date(),
          ...(input.synonym && !bor.synonyms.includes(input.synonym)
            ? { synonyms: { push: input.synonym } }
            : {}),
          ...(tirik.categoryId == null && input.categoryId ? { categoryId: input.categoryId } : {}),
        },
      });
      return { id: tirik.id, categoryId: tirik.categoryId ?? input.categoryId, yangi: false };
    }
  }

  try {
    const yaratildi = await prisma.tgCanonProduct.create({
      data: {
        name,
        nameKey,
        fuzzyKey: fuzzyKey(name),
        categoryId: input.categoryId,
        source: input.source ?? "AI",
        synonyms: input.synonym ? [input.synonym] : [],
      },
    });
    return { id: yaratildi.id, categoryId: yaratildi.categoryId, yangi: true };
  } catch (e) {
    // P2002 — parallel chaqiruv bizdan oldin yaratdi
    if ((e as { code?: string }).code === "P2002") {
      const qayta = await prisma.tgCanonProduct.findUnique({ where: { nameKey } });
      if (qayta) return { id: qayta.id, categoryId: qayta.categoryId, yangi: false };
    }
    throw e;
  }
}

/** Variantni kanonga bog'lash: alias yozuvi + so'rov(lar)ni yangilash. */
export async function bogla(input: {
  raw: string;
  canonId: number;
  categoryId: number | null;
  source: "EXACT" | "FUZZY" | "AI" | "MANUAL";
  score: number | null;
  requestId?: number;
  /** Shu normKey ga ega BARCHA so'rovlarga qo'llash (qo'lda tuzatishda). */
  hammaga?: boolean;
}): Promise<void> {
  const nk = canonKey(input.raw);
  if (!nk) return;

  await prisma.tgProductAlias.upsert({
    where: { normKey: nk },
    create: {
      normKey: nk,
      fuzzyKey: fuzzyKey(input.raw),
      raw: input.raw.slice(0, 120),
      canonId: input.canonId,
      source: input.source,
      score: input.score,
      hits: 1,
    },
    update: {
      canonId: input.canonId,
      source: input.source,
      score: input.score,
      hits: { increment: 1 },
    },
  });

  const data = {
    canonId: input.canonId,
    categoryId: input.categoryId,
    matchStatus: input.source === "MANUAL" ? "MANUAL" : input.source === "AI" ? "AI" : "AUTO",
    matchScore: input.score,
  };

  if (input.hammaga) {
    await prisma.tgRequest.updateMany({ where: { normKey: nk }, data });
  } else if (input.requestId) {
    await prisma.tgRequest.update({ where: { id: input.requestId }, data });
  }

  await prisma.tgCanonProduct.update({
    where: { id: input.canonId },
    data: { hits: { increment: 1 }, lastSeenAt: new Date() },
  });
}

/**
 * Ikki kanonni birlashtirish. QAYTARIB BO'LMAYDI — shuning uchun jurnalga yoziladi.
 * Manba TOMBSTONE bo'lib qoladi (o'chirilmaydi): `nameKey` band turishi kerak, aks
 * holda o'sha nom keyingi safar yangi kanon bo'lib qaytadan yaratiladi.
 */
export async function kanonlarniBirlashtir(
  sourceId: number,
  targetId: number,
  userId?: number
): Promise<{ movedAliases: number; movedRequests: number }> {
  if (sourceId === targetId) throw new Error("Kanonni o'ziga birlashtirib bo'lmaydi.");

  const [manba, maqsad] = await Promise.all([
    prisma.tgCanonProduct.findUnique({ where: { id: sourceId } }),
    prisma.tgCanonProduct.findUnique({ where: { id: targetId } }),
  ]);
  if (!manba || !maqsad) throw new Error("Kanon topilmadi.");
  if (maqsad.mergedIntoId != null) throw new Error("Maqsad kanon allaqachon birlashtirilgan.");

  return prisma.$transaction(async (tx) => {
    const a = await tx.tgProductAlias.updateMany({
      where: { canonId: sourceId },
      data: { canonId: targetId },
    });
    const r = await tx.tgRequest.updateMany({
      where: { canonId: sourceId },
      data: { canonId: targetId, categoryId: maqsad.categoryId },
    });

    await tx.tgCanonProduct.update({
      where: { id: sourceId },
      data: { mergedIntoId: targetId, mergedAt: new Date() },
    });
    // Manba sinonimlari maqsadga ko'chadi — kelajakda o'sha yozilishlar topilsin
    const yangiSin = [...new Set([...maqsad.synonyms, ...manba.synonyms, manba.name])];
    await tx.tgCanonProduct.update({
      where: { id: targetId },
      data: { synonyms: yangiSin, hits: { increment: manba.hits } },
    });

    await tx.tgCanonMerge.create({
      data: {
        sourceId,
        targetId,
        sourceName: manba.name,
        targetName: maqsad.name,
        movedAliases: a.count,
        movedRequests: r.count,
        userId: userId ?? null,
      },
    });

    return { movedAliases: a.count, movedRequests: r.count };
  });
}

/** Ehtimoliy dublikat juftliklar — admin ko'rib chiqishi uchun (real vaqtda hisoblanadi). */
export async function ehtimoliyDublikatlar(
  chegara = 0.55,
  limit = 40
): Promise<{ aId: number; aName: string; bId: number; bName: string; sim: number }[]> {
  const rows = await prisma.$queryRaw<
    { aId: number; aName: string; bId: number; bName: string; sim: number }[]
  >`
    SELECT a.id AS "aId", a.name AS "aName", b.id AS "bId", b.name AS "bName",
           similarity(a."fuzzyKey", b."fuzzyKey") AS sim
    FROM "TgCanonProduct" a
    JOIN "TgCanonProduct" b
      ON a.id < b.id
     AND a."mergedIntoId" IS NULL AND b."mergedIntoId" IS NULL
     AND similarity(a."fuzzyKey", b."fuzzyKey") >= ${chegara}
    ORDER BY sim DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ ...r, sim: Number(r.sim) }));
}
