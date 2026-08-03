/**
 * Moliya anomaliyalari — "bugun nimaga e'tibor berish kerak?" savoliga javob.
 *
 * Har signal manba tahlilida topilgan REAL muammoga mos keladi (MOLIYA_PLAN.md):
 * qulflanmagan kunlar, kamomad, kontragentsiz yirik to'lov, hisobdor shaxsda
 * eskirib qolgan qoldiq, davr boshi kiritilmagan hisob.
 *
 * Sof funksiyalar — DB'siz test qilinadi.
 */

export type Signal = {
  /** Turi — UI guruhlash va ikonka uchun. */
  kind:
    | "yopilmagan"
    | "kamomad"
    | "kontragentsiz"
    | "podotchyot"
    | "davr-boshi-yoq"
    | "manfiy-qoldiq";
  severity: "yuqori" | "orta" | "past";
  title: string;
  detail: string;
  /** Bosilganda qaysi sahifaga o'tadi. */
  href: string;
};

export type YopilmaganKirish = { accountId: number; name: string; kunlar: number };
export type KamomadKirish = { accountId: number; name: string; onDate: string; diff: number };
export type YirikKirish = { id: number; onDate: string; accountName: string; articleName: string; amount: number };
export type PodotchyotKirish = { id: number; name: string; ochiq: number; oxirgiKun: number | null };
export type QoldiqKirish = { accountId: number; name: string; qoldiq: number; openingMissing: boolean };

const uzs = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n));

/**
 * Signallarni yig'adi. Chegara qiymatlari chaqiruvchidan keladi (AppSetting'dan),
 * shuning uchun bu modul sozlamaga bog'lanmaydi va sinash oson.
 */
export function signallar(input: {
  yopilmagan: YopilmaganKirish[];
  kamomad: KamomadKirish[];
  yirikKontragentsiz: YirikKirish[];
  podotchyot: PodotchyotKirish[];
  qoldiqlar: QoldiqKirish[];
  /** Necha kundan ortiq yopilmasa signal (default 2). */
  yopishKechikishi?: number;
  /** Hisobdor shaxsda shu kundan uzoq turgan ochiq qoldiq signal beradi (default 7). */
  podotchyotYoshi?: number;
}): Signal[] {
  const kechikish = input.yopishKechikishi ?? 2;
  const yosh = input.podotchyotYoshi ?? 7;
  const out: Signal[] = [];

  for (const y of input.yopilmagan) {
    if (y.kunlar < kechikish) continue;
    out.push({
      kind: "yopilmagan",
      severity: y.kunlar >= kechikish * 3 ? "yuqori" : "orta",
      title: `${y.name} — ${y.kunlar} kundan beri yopilmagan`,
      detail: "Kunlik sanash bajarilmasa kamomad qachon paydo bo'lganini aniqlab bo'lmaydi.",
      href: "/moliya/yopish",
    });
  }

  for (const k of input.kamomad) {
    out.push({
      kind: "kamomad",
      severity: Math.abs(k.diff) >= 1_000_000 ? "yuqori" : "orta",
      title: `${k.name} · ${k.onDate} — ${k.diff < 0 ? "kamomad" : "ortiqcha"} ${uzs(Math.abs(k.diff))}`,
      detail: "Fizik sanash tizim hisobiga mos kelmadi.",
      href: `/moliya/yopish?sana=${k.onDate}`,
    });
  }

  for (const t of input.yirikKontragentsiz) {
    out.push({
      kind: "kontragentsiz",
      severity: "orta",
      title: `Kontragentsiz yirik to'lov — ${uzs(t.amount)}`,
      detail: `${t.onDate} · ${t.accountName} · ${t.articleName}. Kimga ketgani yozilmagan.`,
      href: `/moliya/kassa?from=${t.onDate}&to=${t.onDate}`,
    });
  }

  for (const p of input.podotchyot) {
    if (p.ochiq <= 0) continue;
    const eski = p.oxirgiKun != null && p.oxirgiKun >= yosh;
    out.push({
      kind: "podotchyot",
      severity: eski ? "yuqori" : "past",
      title: `${p.name} — ochiq qoldiq ${uzs(p.ochiq)}`,
      detail: eski
        ? `Oxirgi harakat ${p.oxirgiKun} kun oldin — hisobot berilmagan.`
        : "Hisobdor shaxsda pul turibdi.",
      href: "/moliya/kontragentlar",
    });
  }

  for (const q of input.qoldiqlar) {
    if (q.qoldiq < 0) {
      out.push({
        kind: "manfiy-qoldiq",
        severity: "yuqori",
        title: `${q.name} — qoldiq manfiy (${uzs(q.qoldiq)})`,
        detail: q.openingMissing
          ? "Davr boshi kiritilmagan — eng ehtimolli sabab."
          : "Yetishmayotgan kirim yozuvi yoki juftlanmagan ko'chirish.",
        href: "/moliya/qoldiq",
      });
    } else if (q.openingMissing) {
      out.push({
        kind: "davr-boshi-yoq",
        severity: "past",
        title: `${q.name} — davr boshi kiritilmagan`,
        detail: "Qoldiq faqat yozuvlar yig'indisi, ya'ni tasdiqlanmagan.",
        href: "/moliya/qoldiq",
      });
    }
  }

  const TARTIB = { yuqori: 0, orta: 1, past: 2 } as const;
  return out.sort((a, b) => TARTIB[a.severity] - TARTIB[b.severity]);
}
