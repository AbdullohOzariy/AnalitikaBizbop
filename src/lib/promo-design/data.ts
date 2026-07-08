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
  imageZoom: number; // rasm yaqinlashtirish (x1..x4) — kattaroq ko'rinish
  regularPrice: number;
  promoPrice: number;
  discountPct: number; // butun foiz (regularPrice'dan tejaganini)
  limitN: number | null;
  badgeText: string;
  dateText: string; // "25-iyundan 1-iyulgacha"
  fileTag: string;
  // Banner ko'rinishi: HAFTA_CHEGIRMA — dizayner maketi (katta narx + "Barakali xarid" +
  // ijtimoiy CTA; eski narx/chegirma % ko'rsatilmaydi), qolgan turlar — klassik.
  variant: "hafta" | "classic";
};

type PriceRow = { regularPrice: number; promoPrice: number; promoLimit: number | null };

/** Guruhda har xil narx bo'lsa — eng ko'p uchragan (regularPrice, promoPrice) juftligi;
 *  teng bo'lsa eng arzon promoPrice. limit — shu juftlikdagi birinchi non-null. */
function pickPrice(items: PriceRow[]): { regular: number; promo: number; limit: number | null } {
  if (items.length === 0) return { regular: 0, promo: 0, limit: null };
  if (items.length === 1) return { regular: items[0].regularPrice, promo: items[0].promoPrice, limit: items[0].promoLimit };
  const counts = new Map<string, { regular: number; promo: number; count: number }>();
  for (const it of items) {
    const key = `${it.regularPrice}|${it.promoPrice}`;
    const c = counts.get(key) ?? { regular: it.regularPrice, promo: it.promoPrice, count: 0 };
    c.count++;
    counts.set(key, c);
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count || a.promo - b.promo)[0];
  const limit = items.find((it) => it.regularPrice === best.regular && it.promoPrice === best.promo && it.promoLimit != null)?.promoLimit ?? null;
  return { regular: best.regular, promo: best.promo, limit };
}

function build(p: {
  kind: "item" | "group"; id: number;
  titleUz: string; titleRu: string | null; imageData: string | null; imageZoom: number;
  regular: number; promo: number; limit: number | null;
  type: PromoType; startDate: Date; endDate: Date | null;
}): DesignData {
  const discountPct = p.regular > 0 ? Math.round((1 - p.promo / p.regular) * 100) : 0;
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
    limitN: p.limit,
    badgeText: BADGE[p.type] ?? "AKSIYA",
    dateText: formatPromoDateRange(p.startDate, p.endDate),
    fileTag,
    variant: p.type === "HAFTA_CHEGIRMA" ? "hafta" : "classic",
  };
}

export async function getDesignData(kind: "item" | "group", id: number): Promise<DesignData | null> {
  if (kind === "group") {
    const g = await prisma.promoItemGroup.findUnique({
      where: { id },
      select: {
        name: true, designTitle: true, designTitleRu: true, imageData: true, imageZoom: true,
        campaign: { select: { type: true, startDate: true, endDate: true } },
        items: { select: { regularPrice: true, promoPrice: true, promoLimit: true } },
      },
    });
    if (!g) return null;
    const items: PriceRow[] = g.items.map((it) => ({
      regularPrice: Number(it.regularPrice),
      promoPrice: Number(it.promoPrice),
      promoLimit: it.promoLimit != null ? Number(it.promoLimit) : null,
    }));
    const price = pickPrice(items);
    return build({
      kind, id,
      titleUz: g.designTitle?.trim() || g.name,
      titleRu: g.designTitleRu?.trim() || null,
      imageData: g.imageData,
      imageZoom: g.imageZoom,
      regular: price.regular, promo: price.promo, limit: price.limit,
      type: g.campaign.type, startDate: g.campaign.startDate, endDate: g.campaign.endDate,
    });
  }

  const it = await prisma.promoItem.findUnique({
    where: { id },
    select: {
      designTitle: true, designTitleRu: true, imageData: true, imageZoom: true,
      regularPrice: true, promoPrice: true, promoLimit: true,
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
          id: true, name: true, designTitle: true, designTitleRu: true, imageData: true, imageZoom: true,
          items: { select: { regularPrice: true, promoPrice: true, promoLimit: true } },
        },
      },
      items: {
        where: { groupId: null },
        orderBy: { id: "asc" },
        select: {
          id: true, designTitle: true, designTitleRu: true, imageData: true, imageZoom: true,
          regularPrice: true, promoPrice: true, promoLimit: true,
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
    }));
    const price = pickPrice(items);
    out.push(build({
      kind: "group", id: g.id,
      titleUz: g.designTitle?.trim() || g.name,
      titleRu: g.designTitleRu?.trim() || null,
      imageData: g.imageData,
      imageZoom: g.imageZoom,
      regular: price.regular, promo: price.promo, limit: price.limit,
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
      type: c.type, startDate: c.startDate, endDate: c.endDate,
    }));
  }
  return out;
}
