/**
 * Kassa qoldig'ini hisoblash — MARKAZLASHGAN.
 *
 * Qoldiq HECH QACHON saqlanmaydi: manba jadvalda u formula sifatida qotib qolgan edi
 * va kun ichida manfiyga tushardi (yozuvlar xronologik emasligi sababli). Bu yerda
 * u doim davr boshi + yozuvlardan qayta hisoblanadi.
 *
 * Kelishuv: `CashAccountOpening.onDate` — SHU KUN BOSHIGA qoldiq. Ya'ni o'sha kunning
 * o'zidagi yozuvlar qoldiqqa QO'SHILADI.
 */

export type OpeningRow = { accountId: number; onDate: Date; amount: number };
export type TxnSum = { accountId: number; direction: string; amount: number };

export type Qoldiq = {
  accountId: number;
  /** Hisobga olingan davr boshi (eng oxirgi sanash), yo'q bo'lsa null. */
  openingDate: Date | null;
  opening: number;
  kirim: number;
  chiqim: number;
  qoldiq: number;
  /** Davr boshi umuman kiritilmagan — qoldiq faqat yozuvlar yig'indisi, ya'ni ISHONCHSIZ. */
  openingMissing: boolean;
};

/**
 * Har bir hisob uchun eng oxirgi `onDate <= asOf` bo'lgan ochilishni tanlaydi.
 * Bir hisobda bir necha sanash bo'lishi mumkin (har inventarizatsiyada yangisi).
 */
export function pickOpenings(rows: OpeningRow[], asOf: Date): Map<number, OpeningRow> {
  const best = new Map<number, OpeningRow>();
  for (const r of rows) {
    if (r.onDate > asOf) continue;
    const cur = best.get(r.accountId);
    if (!cur || r.onDate > cur.onDate) best.set(r.accountId, r);
  }
  return best;
}

/**
 * Qoldiqni yig'adi. `sums` — davr boshidan asOf gacha bo'lgan yozuvlar yig'indisi
 * (chaqiruvchi tomon filtrlaydi: har hisob uchun o'z openingDate'idan boshlab).
 */
export function hisobla(
  accountIds: number[],
  openings: Map<number, OpeningRow>,
  sums: TxnSum[]
): Qoldiq[] {
  const kirim = new Map<number, number>();
  const chiqim = new Map<number, number>();
  for (const s of sums) {
    const m = s.direction === "IN" ? kirim : chiqim;
    m.set(s.accountId, (m.get(s.accountId) ?? 0) + s.amount);
  }

  return accountIds.map((id) => {
    const op = openings.get(id);
    const k = kirim.get(id) ?? 0;
    const c = chiqim.get(id) ?? 0;
    const boshi = op?.amount ?? 0;
    return {
      accountId: id,
      openingDate: op?.onDate ?? null,
      opening: boshi,
      kirim: k,
      chiqim: c,
      qoldiq: boshi + k - c,
      openingMissing: !op,
    };
  });
}

/** Qoldiq ishonchlimi — `trustedFrom` belgilangan va davr boshi kiritilgan bo'lsa. */
export function ishonchli(q: Qoldiq, trustedFrom: Date | null, asOf: Date): boolean {
  if (q.openingMissing) return false;
  if (!trustedFrom) return false;
  return trustedFrom <= asOf;
}
