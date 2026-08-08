/**
 * Kassa cheki (ЧекККМ) — xom 1C payloadidan TALQIN qilingan ko'rinishga.
 *
 * Sof funksiyalar: DB'ga tegmaydi, shuning uchun to'liq test qilinadi.
 * Maydonlar ma'nosi 1C jamoasi bilan tasdiqlangan (1C_INTEGRATION_BRIEF.md, Ilova G):
 *   item.id  = nomenklatura kodi (bizdagi Product.code)
 *   barcode  = sarlavhada CHEKNIKI, qatorda NOMENKLATURANIKI
 *   sumR     = ⚠️ ma'nosi hali aytilmagan — xom saqlanadi, talqin qilinmaydi
 */

/** Chek payloadi shu shaklga o'xshaydimi. 1C hujjat TURI maydonini bermaydi,
 *  shuning uchun shakl bo'yicha aniqlaymiz. Tur maydoni qo'shilsa — shu yerda
 *  bitta qatorga almashadi. */
export function isChek(p: unknown): boolean {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    Array.isArray(o.positions) &&
    Array.isArray(o.payments) &&
    (typeof o.shop === "number" || typeof o.pos === "number") &&
    typeof o.number !== "undefined"
  );
}

export type ChekQator = {
  lineNo: number;
  itemCode: number | null;
  art: string | null;
  name: string;
  barcode: string | null;
  classCode: string | null;
  packageCode: string | null;
  qty: number;
  storno: number;
  sum: number;
  sumR: number;
  sumWD: number;
  sumWT: number;
  totalSum: number;
};

export type ChekTolov = { name: string; kind: PaymentKind; value: number };

/**
 * To'lov turi kodi (`PaymentKindDef.code`).
 *
 * Qat'iy birlashma EMAS: turlar ro'yxatini foydalanuvchi Sozlamalarda o'zi
 * boshqaradi (Payme, Click, bonus...). Quyidagi `tolovTuri` faqat TUG'MA
 * to'rttasini taxmin qiladi; qolganini odam `PaymentTypeMap` orqali biriktiradi.
 */
export type PaymentKind = string;

export type Chek = {
  shop: number;
  pos: number;
  number: string;
  session: number;
  openAt: Date;
  /** Fiskal havoladan olingan yopilish payti; `null` — havola yo'q yoki noto'g'ri. */
  closeAt: Date | null;
  businessDate: Date;
  type: number;
  status: string;
  fiscal: string | null;
  receiptBarcode: string | null;
  card: string | null;
  cashierId: number | null;
  cashierName: string | null;
  qtyBuys: number | null;
  qtyPositions: number;
  sum: number;
  sumWithDiscs: number;
  totalSum: number;
  lines: ChekQator[];
  payments: ChekTolov[];
};

const num = (v: unknown, def = 0): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return def;
};

const txt = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
};

/**
 * To'lov turini nomdan TAXMIN qiladi.
 *
 * Bu faqat BOSHLANG'ICH taxmin: yakuniy qaror `PaymentTypeMap` jadvalida,
 * Sozlamalarda qo'lda tasdiqlanadi. Shuning uchun bu yerda xato bo'lsa ham
 * tuzatish deploysiz bo'ladi.
 *
 * Tanilmagan nom OTHER bo'ladi va hisobotda ko'rinadi — jimgina naqdga
 * qo'shilib ketmaydi (bu tushumni buzardi).
 */
export function tolovTuri(name: string): PaymentKind {
  const s = name.toLowerCase().replace(/\s+/g, " ").trim();

  // TARTIB MUHIM: "нал" bo'lagi NAQD BO'LMAGAN so'zlar ichida ham uchraydi —
  // "без­нал­ичный" va "Терми­нал". Naqdni oldin tekshirsak, ular naqd deb
  // hisoblanardi va butun kassa sverkasi buzilardi (aynan shu narsa uchun
  // integratsiya qilinyapti). "Терминал" jonli ma'lumotda AYNAN shunday
  // xato tushgan — 2026-08-07 da topilib tuzatildi.
  if (/безнал|перечис|перевод|o'tkaz|otkaz|transfer|bank/.test(s))
    return "TRANSFER";
  if (
    /терминал|terminal|карт|плас|karta|plastik|card|uzcard|humo|visa|master/.test(
      s,
    )
  ) {
    return "CARD";
  }
  if (/нал|naqd|cash/.test(s)) return "CASH";
  // Payme/Click/Uzum kabi ilovalar ATAYLAB OTHER: ular kassaga naqd tushirmaydi,
  // lekin plastikmi yoki o'tkazmami — buxgalteriya qarori. Sozlamalarda
  // tasdiqlanadi va hisobotda "boshqa" bo'lib ko'rinib turadi.
  return "OTHER";
}

/**
 * `openDate` "04.08.26" + `openTime` "16:49:04" → aniq payt.
 * Zona berilmagani uchun qiymat Asia/Tashkent deb olinadi va UTC ga o'giriladi:
 * hisobot kuni (businessDate) shu bilan to'g'ri chiqadi.
 */
const TASHKENT_OFFSET_MS = 5 * 3_600_000;

/** Xizmat vaqtining oqilona yuqori chegarasi (2 soat) — izohga qarang. */
const MAX_XIZMAT_MS = 2 * 3_600_000;

export function chekVaqti(openDate: unknown, openTime: unknown): Date | null {
  const d = txt(openDate);
  if (!d) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/.exec(d);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);

  const t = txt(openTime) ?? "00:00:00";
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  const [hh, mi, ss] = tm
    ? [Number(tm[1]), Number(tm[2]), Number(tm[3] ?? 0)]
    : [0, 0, 0];

  // Toshkent vaqti sifatida o'qib, UTC ga o'giramiz.
  const utc =
    Date.UTC(year, Number(mm) - 1, Number(dd), hh, mi, ss) - TASHKENT_OFFSET_MS;
  const dt = new Date(utc);
  if (Number.isNaN(dt.getTime())) return null;
  // Rollover tekshiruvi: "31.02.26" jimgina martga surilmasin.
  const chk = new Date(utc + TASHKENT_OFFSET_MS);
  if (chk.getUTCMonth() !== Number(mm) - 1 || chk.getUTCDate() !== Number(dd))
    return null;
  return dt;
}

/**
 * Chek YOPILGAN payt — fiskal havoladan.
 *
 *   https://ofd.soliq.uz/check?t=...&r=...&c=20260807210536&s=...
 *                                          ^^^^^^^^^^^^^^ YYYYMMDDHHMMSS
 *
 * ZAXIRA manba: 1C `closeDate` ni yubormagan chekda ishlatiladi.
 *
 * TASDIQLANGAN (2026-08-08, 91 chek): 1C `closeDate` ni to'ldira boshlagach
 * ikkala manba solishtirildi — farq 2–5 sekund (74 tasida 3 sek). Fiskal vaqt
 * chek fiskal modulda ro'yxatdan o'tgan lahza, `closeDate` esa 1C uni yopgan
 * lahza; orasida borib-kelish. Ya'ni faraz to'g'ri chiqdi.
 *
 * Vaqt Toshkent zonasida deb olinadi (`chekVaqti` bilan bir xil).
 */
export function fiskalVaqt(fiscal: unknown): Date | null {
  const s = txt(fiscal);
  if (!s) return null;
  const m = /[?&]c=(\d{14})(?:&|$)/.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi, se] = [
    +m[1].slice(0, 4),
    +m[1].slice(4, 6),
    +m[1].slice(6, 8),
    +m[1].slice(8, 10),
    +m[1].slice(10, 12),
    +m[1].slice(12, 14),
  ];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59)
    return null;
  const utc = Date.UTC(y, mo - 1, d, h, mi, se) - TASHKENT_OFFSET_MS;
  const dt = new Date(utc);
  if (Number.isNaN(dt.getTime()) || y < 2000) return null;
  // Rollover: "31.02" jimgina martga surilmasin
  const chk = new Date(utc + TASHKENT_OFFSET_MS);
  if (chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null;
  return dt;
}

/**
 * Chek YOPILGAN payt — ikki manbadan, ustunlik tartibida.
 *
 * 1) `closeDate` — 1C ning O'Z qiymati. ⚠️ Nomi "Date" bo'lsa ham ICHIDA
 *    VAQT keladi ("14:31:44"), sana emas. Sana `openDate` dan olinadi.
 * 2) Fiskal havoladagi `c=` — zaxira. Uzoq vaqt yagona manba edi, chunki
 *    `closeDate` bo'sh kelardi.
 *
 * IKKALASI TEKSHIRILDI (2026-08-08, 91 ta chek): farq atigi 2–5 sekund
 * (74 tasida 3 sek). Fiskal vaqt — chek fiskal modulda ro'yxatdan o'tgan
 * lahza, `closeDate` — 1C uni yopgan lahza; orasida borib-kelish.
 * 1C niki aniqroq, shuning uchun u ustun.
 *
 * YARIM TUN: `closeDate` da sana yo'q, shuning uchun natija ochilishdan
 * oldin chiqsa bir kun qo'shiladi (23:58 da ochilib 00:01 da yopilgan chek).
 */
export function yopilishVaqti(o: Record<string, unknown>, openAt: Date): Date | null {
  const cd = txt(o.closeDate);
  if (cd && /^\d{1,2}:\d{2}(:\d{2})?$/.test(cd)) {
    const od = txt(o.openDate);
    const m = od ? /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/.exec(od) : null;
    if (m) {
      const [, dd, mm, yy] = m;
      const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
      const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(cd)!;
      let utc =
        Date.UTC(year, Number(mm) - 1, Number(dd), Number(tm[1]), Number(tm[2]), Number(tm[3] ?? 0)) -
        TASHKENT_OFFSET_MS;
      // Yarim tundan o'tgan bo'lsa — ertasi kun.
      if (utc < openAt.getTime()) utc += 86_400_000;
      const d = new Date(utc);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return fiskalVaqt(o.fiscal);
}

/** Toshkent kuni (hisobot sanasi) — openAt dan olinadi. */
export function hisobotKuni(openAt: Date): Date {
  const t = new Date(openAt.getTime() + TASHKENT_OFFSET_MS);
  return new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()),
  );
}

export function parseChek(p: unknown): Chek | { error: string } {
  if (!isChek(p)) return { error: "Payload chek shakliga mos kelmadi." };
  const o = p as Record<string, unknown>;

  const openAt = chekVaqti(o.openDate, o.openTime);
  if (!openAt)
    return { error: `Sana o'qilmadi: openDate=${JSON.stringify(o.openDate)}` };

  const number = txt(o.number);
  if (!number) return { error: "Chek raqami yo'q." };

  const shop = num(o.shop, -1);
  const pos = num(o.pos, -1);
  if (shop < 0 || pos < 0) return { error: "shop/pos ko'rsatilmagan." };

  const user = (o.user ?? {}) as Record<string, unknown>;

  const lines: ChekQator[] = (o.positions as unknown[]).map((raw, i) => {
    const q = (raw ?? {}) as Record<string, unknown>;
    const item = (q.item ?? {}) as Record<string, unknown>;
    return {
      lineNo: i + 1,
      // item.id — nomenklatura kodi (1C tasdiqladi)
      itemCode: typeof item.id === "number" ? item.id : null,
      art: txt(item.art),
      name: txt(item.name) ?? "—",
      barcode: txt(q.barcode),
      classCode: txt(item.class_code),
      packageCode: txt(item.package_code),
      qty: num(q.qty),
      storno: num(q.storno),
      sum: num(q.sum),
      sumR: num(q.sumR),
      sumWD: num(q.sumWD),
      sumWT: num(q.sumWT),
      totalSum: num(q.totalSum),
    };
  });

  const payments: ChekTolov[] = (o.payments as unknown[]).map((raw) => {
    const t = (raw ?? {}) as Record<string, unknown>;
    const name = txt(t.name) ?? "—";
    return { name, kind: tolovTuri(name), value: num(t.value) };
  });

  // Chek sarlavhasidagi summalar HAR DOIM KELMAYDI. 1C bergan namunada `sum`,
  // `sumWithDiscs`, `totalSum` bor edi, jonli oqimda esa YO'Q — natijada barcha
  // cheklar 0 summa bilan tushib qoldi (2026-08-07 da aniqlandi).
  //
  // Yo'q bo'lsa qatorlardan yig'amiz. Manba tanlovi ataylab:
  //   totalSum — TO'LOVLARDAN: bu haqiqatan olingan pul, tushum shu.
  // Kelgan bo'lsa 1C ning qiymati ustun — kelajakda maydon qaytsa o'zi ishlaydi.
  const bor = (v: unknown) => v !== undefined && v !== null && v !== "";
  const yig = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  // STORNO QATORLAR HISOBGA OLINMAYDI. Bekor qilingan qator chekda qoladi
  // (kassir nima qilgani ko'rinsin uchun), lekin summaga KIRMAYDI. Buni
  // qo'shib yuborish 2026-08-07 da jonli ma'lumotda summani 2.2% ga
  // shishirgan edi; stornosiz yig'indi esa to'lov summasiga AYNAN teng chiqadi.
  const faol = lines.filter((l) => l.storno === 0);

  const sum = bor(o.sum) ? num(o.sum) : yig(faol.map((l) => l.sum));
  const sumWithDiscs = bor(o.sumWithDiscs)
    ? num(o.sumWithDiscs)
    : yig(faol.map((l) => l.sumWD));
  const totalSum = bor(o.totalSum)
    ? num(o.totalSum)
    : payments.length > 0
      ? yig(payments.map((p) => p.value))
      : yig(faol.map((l) => l.totalSum));

  return {
    shop,
    pos,
    number,
    session: num(o.session),
    openAt,
    // Faqat ochilishdan KEYIN va OQILONA oraliqda. Kassa soati noto'g'ri
    // sozlangan bo'lsa teskari qiymat "manfiy xizmat vaqti" berardi; oldinga
    // siljigan soat esa soatlab "xizmat" ko'rsatardi va o'rtachani buzardi.
    // Kuzatilgan eng uzun haqiqiy chek — 1425 sek, shuning uchun 2 soat
    // xavfsiz chegara (himoya, tuzatish emas: hozir bitta ham rad etilmaydi).
    closeAt: (() => {
      const f = yopilishVaqti(o, openAt);
      if (!f) return null;
      const d = f.getTime() - openAt.getTime();
      return d >= 0 && d <= MAX_XIZMAT_MS ? f : null;
    })(),
    businessDate: hisobotKuni(openAt),
    type: num(o.type),
    status: txt(o.status) ?? "",
    fiscal: txt(o.fiscal),
    receiptBarcode: txt(o.barcode), // sarlavhadagi barcode — CHEKNIKI
    card: txt(o.card),
    cashierId: typeof user.id === "number" ? user.id : null,
    cashierName: txt(user.name),
    qtyBuys: o.qtyBuys === undefined ? null : num(o.qtyBuys),
    qtyPositions: num(o.qtyPositions, lines.length),
    sum,
    sumWithDiscs,
    totalSum,
    lines,
    payments,
  };
}
