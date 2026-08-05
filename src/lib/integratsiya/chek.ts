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

export type PaymentKind = "CASH" | "CARD" | "TRANSFER" | "OTHER";

export type Chek = {
  shop: number;
  pos: number;
  number: string;
  session: number;
  openAt: Date;
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

  // TARTIB MUHIM: "безналичный" ichida "нал" bor. Naqdni oldin tekshirsak,
  // NAQD BO'LMAGAN to'lov naqd deb hisoblanardi — bu butun kassa sverkasini
  // buzadi (aynan shu narsa uchun integratsiya qilinyapti).
  if (/безнал|перечис|перевод|o'tkaz|otkaz|transfer|bank/.test(s)) return "TRANSFER";
  if (/карт|плас|karta|plastik|card|uzcard|humo|visa|master/.test(s)) return "CARD";
  if (/нал|naqd|cash/.test(s)) return "CASH";
  return "OTHER";
}

/**
 * `openDate` "04.08.26" + `openTime` "16:49:04" → aniq payt.
 * Zona berilmagani uchun qiymat Asia/Tashkent deb olinadi va UTC ga o'giriladi:
 * hisobot kuni (businessDate) shu bilan to'g'ri chiqadi.
 */
const TASHKENT_OFFSET_MS = 5 * 3_600_000;

export function chekVaqti(openDate: unknown, openTime: unknown): Date | null {
  const d = txt(openDate);
  if (!d) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/.exec(d);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);

  const t = txt(openTime) ?? "00:00:00";
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  const [hh, mi, ss] = tm ? [Number(tm[1]), Number(tm[2]), Number(tm[3] ?? 0)] : [0, 0, 0];

  // Toshkent vaqti sifatida o'qib, UTC ga o'giramiz.
  const utc = Date.UTC(year, Number(mm) - 1, Number(dd), hh, mi, ss) - TASHKENT_OFFSET_MS;
  const dt = new Date(utc);
  if (Number.isNaN(dt.getTime())) return null;
  // Rollover tekshiruvi: "31.02.26" jimgina martga surilmasin.
  const chk = new Date(utc + TASHKENT_OFFSET_MS);
  if (chk.getUTCMonth() !== Number(mm) - 1 || chk.getUTCDate() !== Number(dd)) return null;
  return dt;
}

/** Toshkent kuni (hisobot sanasi) — openAt dan olinadi. */
export function hisobotKuni(openAt: Date): Date {
  const t = new Date(openAt.getTime() + TASHKENT_OFFSET_MS);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}

export function parseChek(p: unknown): Chek | { error: string } {
  if (!isChek(p)) return { error: "Payload chek shakliga mos kelmadi." };
  const o = p as Record<string, unknown>;

  const openAt = chekVaqti(o.openDate, o.openTime);
  if (!openAt) return { error: `Sana o'qilmadi: openDate=${JSON.stringify(o.openDate)}` };

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

  return {
    shop,
    pos,
    number,
    session: num(o.session),
    openAt,
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
    sum: num(o.sum),
    sumWithDiscs: num(o.sumWithDiscs),
    totalSum: num(o.totalSum),
    lines,
    payments,
  };
}
