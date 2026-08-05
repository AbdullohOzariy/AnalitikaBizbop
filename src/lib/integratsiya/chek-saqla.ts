/**
 * Xom hodisa (IntegrationEvent) → chek bazasi (Receipt).
 *
 * IDEMPOTENT: tabiiy kalit (shop+pos+businessDate+number+session) bo'yicha
 * upsert. 1C bir chekni qayta yuborsa dublikat bo'lmaydi.
 *
 * XATO BO'LSA HODISA YO'QOLMAYDI: status FAILED bo'ladi va sabab yoziladi,
 * xom payload esa joyida qoladi — tuzatilgach qayta ishlanadi.
 */
import { prisma } from "@/lib/prisma";
import { isChek, parseChek } from "./chek";

export type QaytaIshlashNatija = {
  korildi: number;
  yaratildi: number;
  yangilandi: number;
  chekEmas: number;
  xato: number;
};

/**
 * PENDING hodisalarni chekka aylantiradi.
 * @param limit bir chaqiruvda nechta hodisa (katta partiyada bo'lib ishlaydi)
 */
export async function cheklarniQaytaIshla(limit = 500): Promise<QaytaIshlashNatija> {
  const events = await prisma.integrationEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { id: "asc" },
    take: limit,
    select: { id: true, payload: true },
  });

  const natija: QaytaIshlashNatija = {
    korildi: events.length,
    yaratildi: 0,
    yangilandi: 0,
    chekEmas: 0,
    xato: 0,
  };
  if (events.length === 0) return natija;

  // shop → branchId moslik (Sozlamalarda qo'lda biriktiriladi)
  const branches = await prisma.branch.findMany({
    where: { onecShopId: { not: null } },
    select: { id: true, onecShopId: true },
  });
  const shopToBranch = new Map(branches.map((b) => [b.onecShopId!, b.id]));

  for (const ev of events) {
    // Chek emas — hujjat bo'lishi mumkin. SKIPPED emas, PENDING'da QOLDIRAMIZ:
    // hujjat bazasi qurilgach o'sha qayta ishlaydi.
    if (!isChek(ev.payload)) {
      natija.chekEmas++;
      continue;
    }

    const c = parseChek(ev.payload);
    if ("error" in c) {
      await prisma.integrationEvent.update({
        where: { id: ev.id },
        data: { status: "FAILED", error: c.error, attempts: { increment: 1 } },
      });
      natija.xato++;
      continue;
    }

    // SKU moslashtirish: item.id = nomenklatura kodi = Product.code
    const kodlar = [...new Set(c.lines.map((l) => l.itemCode).filter((x): x is number => x != null))];
    const products = kodlar.length
      ? await prisma.product.findMany({
          where: { code: { in: kodlar } },
          select: { id: true, code: true },
        })
      : [];
    const codeToId = new Map(products.map((p) => [p.code, p.id]));

    const kalit = {
      shop: c.shop,
      pos: c.pos,
      businessDate: c.businessDate,
      number: c.number,
      session: c.session,
    };

    const sarlavha = {
      openAt: c.openAt,
      type: c.type,
      status: c.status,
      fiscal: c.fiscal,
      receiptBarcode: c.receiptBarcode,
      card: c.card,
      cashierId: c.cashierId,
      cashierName: c.cashierName,
      qtyBuys: c.qtyBuys,
      qtyPositions: c.qtyPositions,
      sum: c.sum,
      sumWithDiscs: c.sumWithDiscs,
      totalSum: c.totalSum,
      branchId: shopToBranch.get(c.shop) ?? null,
      eventId: ev.id,
    };

    try {
      const mavjud = await prisma.receipt.findUnique({
        where: { shop_pos_businessDate_number_session: kalit },
        select: { id: true },
      });

      await prisma.$transaction(async (tx) => {
        // Qayta yuborilgan chek — qatorlar/to'lovlar QAYTA yoziladi (1C tuzatgan
        // bo'lishi mumkin). Sarlavha ham yangilanadi.
        if (mavjud) {
          await tx.receiptLine.deleteMany({ where: { receiptId: mavjud.id } });
          await tx.receiptPayment.deleteMany({ where: { receiptId: mavjud.id } });
          await tx.receipt.update({ where: { id: mavjud.id }, data: sarlavha });
        }
        const r = mavjud ?? (await tx.receipt.create({ data: { ...kalit, ...sarlavha } }));

        await tx.receiptLine.createMany({
          data: c.lines.map((l) => ({
            receiptId: r.id,
            lineNo: l.lineNo,
            itemCode: l.itemCode,
            productId: l.itemCode != null ? codeToId.get(l.itemCode) ?? null : null,
            art: l.art,
            name: l.name,
            barcode: l.barcode,
            classCode: l.classCode,
            packageCode: l.packageCode,
            qty: l.qty,
            storno: l.storno,
            sum: l.sum,
            sumR: l.sumR,
            sumWD: l.sumWD,
            sumWT: l.sumWT,
            totalSum: l.totalSum,
          })),
        });

        await tx.receiptPayment.createMany({
          data: c.payments.map((p) => ({
            receiptId: r.id,
            name: p.name,
            kind: p.kind,
            value: p.value,
          })),
        });

        await tx.integrationEvent.update({
          where: { id: ev.id },
          data: { status: "PROCESSED", processedAt: new Date(), error: null },
        });
      });

      if (mavjud) natija.yangilandi++;
      else natija.yaratildi++;
    } catch (e) {
      await prisma.integrationEvent.update({
        where: { id: ev.id },
        data: {
          status: "FAILED",
          error: e instanceof Error ? e.message.slice(0, 400) : "Noma'lum xato",
          attempts: { increment: 1 },
        },
      });
      natija.xato++;
    }
  }

  return natija;
}
