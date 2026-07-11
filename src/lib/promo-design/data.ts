/**
 * Dizayn banner uchun ma'lumot — guruh yoki guruhsiz SKU bo'yicha.
 * Narx/chegirma/limit/sana/badge avtomatik; nom qo'lda (designTitle) yoki fallback.
 */
import { prisma } from "@/lib/prisma";
import type { PromoType } from "@/generated/prisma/client";
import { formatPromoDateRange } from "./date";

// Banner badge matni (5 turli — FLASH ham). Namunaga mos: HAFTA_CHEGIRMA → "HAFTA CHEGIRMASI".
const BADGE: Record<PromoType, string> = {
  KUN_TAKLIFI: "KUN TAKLIFI",
  HAFTA_CHEGIRMA: "HAFTA CHEGIRMASI",
  BIZBOP_NARX: "BIZBOP NARX",
  AAARZON: "A-A-ARZON NARX!",
  FLASH: "FLASH AKSIYA",
};

export type DesignData = {
  kind: "item" | "group";
  id: number;
  titleUz: string;
  titleRu: string | null;
  imageData: string | null;
  imageZoom: number; // rasm kattalashtirish (x1..x2, kasr: 1.3/1.7) — qirqilmasdan yirikroq ko'rinish
  regularPrice: number;
  promoPrice: number;
  discountPct: number; // butun foiz (regularPrice'dan tejaganini). N+M da = effektiv chegirma
  // N+M ("N ol, M tekin") mexanikasi — null bo'lmasa banner "N+M" ko'rsatadi (narx-chegirma emas).
  nPlusM: { buy: number; free: number } | null;
  limitN: number | null;
  limitUnit: string; // limit birligi: dona/ta/kg (dizayn dialogida tanlanadi)
  badgeText: string;
  dateText: string; // "25-iyundan 1-iyulgacha"
  fileTag: string;
  // Banner ko'rinishi: HAFTA_CHEGIRMA — yashil dizayner maketi (katta narx + doira + CTA);
  // BIZBOP_NARX — to'q-sariq maket (eski narx qizil qiyshiq chiziq bilan, sana/doirasiz);
  // qolgan turlar — klassik.
  variant: "hafta" | "bizbop" | "classic";
};

type PriceRow = { regularPrice: number; promoPrice: number; promoLimit: number | null; buyQty: number | null; freeQty: number | null };
type PickResult = { regular: number; promo: number; limit: number | null; buyQty: number | null; freeQty: number | null };

/** Guruhda har xil narx bo'lsa — eng ko'p uchragan (regularPrice, promoPrice) juftligi;
 *  teng bo'lsa eng arzon promoPrice. limit/N+M — shu juftlikdagi birinchi mos qiymat. */
function pickPrice(items: PriceRow[]): PickResult {
  if (items.length === 0) return { regular: 0, promo: 0, limit: null, buyQty: null, freeQty: null };
  if (items.length === 1) {
    const it = items[0];
    return { regular: it.regularPrice, promo: it.promoPrice, limit: it.promoLimit, buyQty: it.buyQty, freeQty: it.freeQty };
  }
  const counts = new Map<string, { regular: number; promo: number; count: number }>();
  for (const it of items) {
    const key = `${it.regularPrice}|${it.promoPrice}`;
    const c = counts.get(key) ?? { regular: it.regularPrice, promo: it.promoPrice, count: 0 };
    c.count++;
    counts.set(key, c);
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count || a.promo - b.promo)[0];
  const inBest = (it: PriceRow) => it.regularPrice === best.regular && it.promoPrice === best.promo;
  const limit = items.find((it) => inBest(it) && it.promoLimit != null)?.promoLimit ?? null;
  // N+M — g'olib juftlikdagi birinchi to'liq N+M qatordan (bo'lmasa null).
  const nm = items.find((it) => inBest(it) && it.buyQty != null && it.freeQty != null);
  return { regular: best.regular, promo: best.promo, limit, buyQty: nm?.buyQty ?? null, freeQty: nm?.freeQty ?? null };
}

function build(p: {
  kind: "item" | "group"; id: number;
  titleUz: string; titleRu: string | null; imageData: string | null; imageZoom: number;
  regular: number; promo: number; limit: number | null; limitUnit: string;
  buyQty: number | null; freeQty: number | null;
  type: PromoType; startDate: Date; endDate: Date | null;
}): DesignData {
  const isNM = p.buyQty != null && p.freeQty != null && p.buyQty > 0 && p.freeQty > 0;
  const nPlusM = isNM ? { buy: p.buyQty!, free: p.freeQty! } : null;
  // N+M da narx tushmaydi (promo=regular) — chegirma effektiv: M dona N+M donadan tekin.
  const discountPct = isNM
    ? Math.round((p.freeQty! / (p.buyQty! + p.freeQty!)) * 100)
    : p.regular > 0 ? Math.round((1 - p.promo / p.regular) * 100) : 0;
  const fileTag = `${p.id}-${p.titleUz}`.replace(/[^\w\d-]+/g, "_").slice(0, 50);
  return {
    kind: p.kind,
    id: p.id,
    titleUz: p.titleUz,
    titleRu: p.titleRu,
    imageData: p.imageData,
    imageZoom: p.imageZoom,
    regularPrice: p.regular,
    promoPrice: p.promo,
    discountPct,
    nPlusM,
    limitN: p.limit,
    limitUnit: p.limitUnit,
    badgeText: BADGE[p.type] ?? "AKSIYA",
    dateText: formatPromoDateRange(p.startDate, p.endDate),
    fileTag,
    variant: p.type === "HAFTA_CHEGIRMA" ? "hafta" : p.type === "BIZBOP_NARX" ? "bizbop" : "classic",
  };
}

export async function getDesignData(kind: "item" | "group", id: number): Promise<DesignData | null> {
  if (kind === "group") {
    const g = await prisma.promoItemGroup.findUnique({
      where: { id },
      select: {
        name: true, designTitle: true, designTitleRu: true, imageData: true, imageZoom: true, limitUnit: true,
        campaign: { select: { type: true, startDate: true, endDate: true } },
        items: { select: { regularPrice: true, promoPrice: true, promoLimit: true, buyQty: true, freeQty: true } },
      },
    });
    if (!g) return null;
    const items: PriceRow[] = g.items.map((it) => ({
      regularPrice: Number(it.regularPrice),
      promoPrice: Number(it.promoPrice),
      promoLimit: it.promoLimit != null ? Number(it.promoLimit) : null,
      buyQty: it.buyQty, freeQty: it.freeQty,
    }));
    const price = pickPrice(items);
    return build({
      kind, id,
      titleUz: g.designTitle?.trim() || g.name,
      titleRu: g.designTitleRu?.trim() || null,
      imageData: g.imageData,
      imageZoom: g.imageZoom,
      regular: price.regular, promo: price.promo, limit: price.limit, limitUnit: g.limitUnit,
      buyQty: price.buyQty, freeQty: price.freeQty,
      type: g.campaign.type, startDate: g.campaign.startDate, endDate: g.campaign.endDate,
    });
  }

  const it = await prisma.promoItem.findUnique({
    where: { id },
    select: {
      designTitle: true, designTitleRu: true, imageData: true, imageZoom: true, limitUnit: true,
      regularPrice: true, promoPrice: true, promoLimit: true, buyQty: true, freeQty: true,
      product: { select: { name: true } },
      campaign: { select: { type: true, startDate: true, endDate: true } },
    },
  });
  if (!it) return null;
  return build({
    kind, id,
    titleUz: it.designTitle?.trim() || it.product.name,
    titleRu: it.designTitleRu?.trim() || null,
    imageData: it.imageData,
    imageZoom: it.imageZoom,
    regular: Number(it.regularPrice),
    promo: Number(it.promoPrice),
    limit: it.promoLimit != null ? Number(it.promoLimit) : null,
    limitUnit: it.limitUnit,
    buyQty: it.buyQty, freeQty: it.freeQty,
    type: it.campaign.type, startDate: it.campaign.startDate, endDate: it.campaign.endDate,
  });
}

/**
 * Bitta aksiyaning BARCHA dizaynlari (har guruh + har guruhsiz SKU) — birdan yuklash uchun.
 * `onlyWithImage` → faqat mahsulot rasmi yuklab tayyorlangan dizaynlar (placeholder'larsiz).
 * Tartib: avval guruhlar (sortOrder), so'ng guruhsiz SKU'lar (id).
 */
export async function getCampaignDesigns(
  campaignId: number,
  opts: { onlyWithImage?: boolean } = {}
): Promise<DesignData[]> {
  const c = await prisma.promoCampaign.findUnique({
    where: { id: campaignId },
    select: {
      type: true, startDate: true, endDate: true,
      itemGroups: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true, name: true, designTitle: true, designTitleRu: true, imageData: true, imageZoom: true, limitUnit: true,
          items: { select: { regularPrice: true, promoPrice: true, promoLimit: true, buyQty: true, freeQty: true } },
        },
      },
      items: {
        where: { groupId: null },
        orderBy: { id: "asc" },
        select: {
          id: true, designTitle: true, designTitleRu: true, imageData: true, imageZoom: true, limitUnit: true,
          regularPrice: true, promoPrice: true, promoLimit: true, buyQty: true, freeQty: true,
          product: { select: { name: true } },
        },
      },
    },
  });
  if (!c) return [];

  const out: DesignData[] = [];
  for (const g of c.itemGroups) {
    if (opts.onlyWithImage && !g.imageData) continue;
    const items: PriceRow[] = g.items.map((it) => ({
      regularPrice: Number(it.regularPrice),
      promoPrice: Number(it.promoPrice),
      promoLimit: it.promoLimit != null ? Number(it.promoLimit) : null,
      buyQty: it.buyQty, freeQty: it.freeQty,
    }));
    const price = pickPrice(items);
    out.push(build({
      kind: "group", id: g.id,
      titleUz: g.designTitle?.trim() || g.name,
      titleRu: g.designTitleRu?.trim() || null,
      imageData: g.imageData,
      imageZoom: g.imageZoom,
      regular: price.regular, promo: price.promo, limit: price.limit, limitUnit: g.limitUnit,
      buyQty: price.buyQty, freeQty: price.freeQty,
      type: c.type, startDate: c.startDate, endDate: c.endDate,
    }));
  }
  for (const it of c.items) {
    if (opts.onlyWithImage && !it.imageData) continue;
    out.push(build({
      kind: "item", id: it.id,
      titleUz: it.designTitle?.trim() || it.product.name,
      titleRu: it.designTitleRu?.trim() || null,
      imageData: it.imageData,
      imageZoom: it.imageZoom,
      regular: Number(it.regularPrice),
      promo: Number(it.promoPrice),
      limit: it.promoLimit != null ? Number(it.promoLimit) : null,
      limitUnit: it.limitUnit,
      buyQty: it.buyQty, freeQty: it.freeQty,
      type: c.type, startDate: c.startDate, endDate: c.endDate,
    }));
  }
  return out;
}
