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
import { isChek, parseChek, tolovTuri } from "./chek";

export type QaytaIshlashNatija = {
  korildi: number;
  yaratildi: number;
  yangilandi: number;
  chekEmas: number;
  xato: number;
  /** Birinchi marta uchragan to'lov nomlari — Sozlamalarda tasdiqlanishi kerak. */
  yangiTolovTuri: number;
};

/**
 * Ayni paytda bitta drenaj ishlashi uchun bayroq.
 *
 * Navbatni ikki joy bo'shatadi: har POST'dan keyin (`after`) va har 5 daqiqada
 * (cron). 1C har 20 soniyada yuborgani uchun ular ustma-ust tushadi va bir xil
 * hodisalarni ikki marta o'qib, bir xil chekni yozishga urinadi. Upsert buni
 * xatosiz hal qiladi, lekin ish baribir ikki barobar bajarilardi.
 */
let ishlayapti = false;

/**
 * PENDING hodisalarni chekka aylantiradi.
 * @param limit bir chaqiruvda nechta hodisa (katta partiyada bo'lib ishlaydi)
 */
export async function cheklarniQaytaIshla(
  limit = 500,
): Promise<QaytaIshlashNatija> {
  const bosh: QaytaIshlashNatija = {
    korildi: 0,
    yaratildi: 0,
    yangilandi: 0,
    chekEmas: 0,
    xato: 0,
    yangiTolovTuri: 0,
  };
  // Allaqachon ishlayapti — bu chaqiruv jim chiqadi. Hodisa yo'qolmaydi:
  // ishlayotgani ularni baribir oladi, olmasa 5 daqiqadan keyin cron oladi.
  if (ishlayapti) return bosh;
  ishlayapti = true;
  try {
    return await drenaj(limit);
  } finally {
    ishlayapti = false;
  }
}

async function drenaj(limit: number): Promise<QaytaIshlashNatija> {
  const events = await prisma.integrationEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { id: "asc" },
    take: limit,
    select: { id: true, payload: true, attempts: true },
  });

  const natija: QaytaIshlashNatija = {
    korildi: events.length,
    yaratildi: 0,
    yangilandi: 0,
    chekEmas: 0,
    xato: 0,
    yangiTolovTuri: 0,
  };
  if (events.length === 0) return natija;

  // shop → branchId moslik (Sozlamalarda qo'lda biriktiriladi)
  const branches = await prisma.branch.findMany({
    where: { onecShopId: { not: null } },
    select: { id: true, onecShopId: true },
  });
  const shopToBranch = new Map(branches.map((b) => [b.onecShopId!, b.id]));

  // To'lov turi moslashuvi — QO'LDA sozlanadigan jadval (Sozlamalar).
  // Yangi nom uchraganda avtomatik qo'shiladi (taxminiy tur, isConfirmed=false),
  // ya'ni u Sozlamalarda "tekshirilmagan" bo'lib ko'rinadi va tushumdan
  // jimgina tushib qolmaydi.
  const tolovMap = new Map(
    (
      await prisma.paymentTypeMap.findMany({
        select: { name: true, kind: true },
      })
    ).map((t) => [t.name, t.kind]),
  );

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
    const kodlar = [
      ...new Set(
        c.lines.map((l) => l.itemCode).filter((x): x is number => x != null),
      ),
    ];
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

    let mavjud: { id: number } | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        // Statistika uchun: chek yangimi yoki yangilanmoqdami. Poyga holatida
        // bir-ikkiga adashishi mumkin — yozuvga ta'sir qilmaydi.
        mavjud = await tx.receipt.findUnique({
          where: { shop_pos_businessDate_number_session: kalit },
          select: { id: true },
        });

        // UPSERT — "topib ko'r, keyin yarat" ATAYLAB ishlatilmaydi: ikki drenaj
        // bir vaqtda ishlaganda (POST'dan keyingi `after` va 5 daqiqalik cron)
        // ikkalasida ham "topilmadi" rost bo'lib chiqadi va ikkinchisi
        // `Unique constraint failed` xatosiga uchraydi. Bu 2026-08-07 da
        // jonli oqimda sodir bo'ldi. Upsert bu qarorni bazaga topshiradi.
        const r = await tx.receipt.upsert({
          where: { shop_pos_businessDate_number_session: kalit },
          create: { ...kalit, ...sarlavha },
          update: sarlavha,
        });

        // Qayta yuborilgan chek — qatorlar/to'lovlar QAYTA yoziladi (1C tuzatgan
        // bo'lishi mumkin).
        await tx.receiptLine.deleteMany({ where: { receiptId: r.id } });
        await tx.receiptPayment.deleteMany({ where: { receiptId: r.id } });

        await tx.receiptLine.createMany({
          data: c.lines.map((l) => ({
            receiptId: r.id,
            lineNo: l.lineNo,
            itemCode: l.itemCode,
            productId:
              l.itemCode != null ? (codeToId.get(l.itemCode) ?? null) : null,
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
            // Moslashuv jadvali USTUN: odam tasdiqlagan qaror taxmindan muhimroq.
            kind: tolovMap.get(p.name) ?? p.kind,
            value: p.value,
          })),
        });

        await tx.integrationEvent.update({
          where: { id: ev.id },
          data: { status: "PROCESSED", processedAt: new Date(), error: null },
        });
      });

      // Yangi to'lov nomlarini ro'yxatga qo'shamiz — Sozlamalarda ko'rinsin.
      for (const p of c.payments) {
        if (tolovMap.has(p.name)) continue;
        await prisma.paymentTypeMap
          .create({
            data: { name: p.name, kind: tolovTuri(p.name), isConfirmed: false },
          })
          .catch(() => undefined); // parallel so'rovda unique to'qnashuvi — muhim emas
        tolovMap.set(p.name, tolovTuri(p.name));
        natija.yangiTolovTuri++;
      }

      if (mavjud) natija.yangilandi++;
      else natija.yaratildi++;
    } catch (e) {
      // O'TKINCHI xatolar (bir vaqtda yozish to'qnashuvi, baza uzilishi)
      // PENDING'da QOLDIRILADI — keyingi drenaj qayta urinib ko'radi.
      // FAILED faqat 5 urinishdan keyin: FAILED hodisa hech qachon qayta
      // ishlanmaydi (`where: status PENDING`), ya'ni o'tkinchi nosozlik uchun
      // uni darhol FAILED qilish chekni mangu yo'qotib qo'yardi.
      const kod = (e as { code?: string })?.code;
      const otkinchi =
        kod === "P2002" ||
        kod === "P2034" ||
        kod === "P1001" ||
        kod === "P1017";
      const urinish = ev.attempts + 1;

      await prisma.integrationEvent.update({
        where: { id: ev.id },
        data: {
          status: otkinchi && urinish < 5 ? "PENDING" : "FAILED",
          error: e instanceof Error ? e.message.slice(0, 400) : "Noma'lum xato",
          attempts: { increment: 1 },
        },
      });
      natija.xato++;
    }
  }

  return natija;
}
