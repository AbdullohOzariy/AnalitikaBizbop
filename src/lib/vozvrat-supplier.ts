/**
 * Vozvrat qatorini yetkazib beruvchiga (Supplier) bog'lash.
 *
 * MUAMMO: vozvratlar ALOHIDA bazada (`bizbop`, xom pg.Pool) — Prisma bilan cross-DB
 * JOIN mumkin emas. `vozvratlar.sku_kod` (→ `Product.code`) faqat ~7% qatorda
 * to'ldirilgan (Excel importda doim null), `vozvratlar.taminotchi` esa ERKIN MATN
 * (~97% to'ldirilgan, lekin imlo xatolari bilan: "Platinum tpade", "PONEDA",
 * "ERUO", "millenium"/"mellennium"). Shuning uchun moslik BOSQICHMA-BOSQICH:
 *
 *   1. sku_kod → Product.code → Product.supplierId   → "aniq"
 *   2. normalizatsiyadan keyin nomlar TENG            → "aniq"
 *   3. qisman moslik (biri ikkinchisining ichida)     → "taxminiy"
 *   4. fuzzy (token-darajali Levenshtein qamrovi)     → "taxminiy"
 *   5. hech biri                                      → "topilmadi"
 *
 * ISHLASH: moslik jadvali (nom indeksi + trigram teskari indeksi) BIR MARTA
 * quriladi, natijalar normalizatsiyalangan matn bo'yicha memo'lanadi — har
 * vozvrat qatori uchun 317 ta postavshikni aylanib chiqilmaydi.
 *
 * Tashqi kutubxona YO'Q (Levenshtein/trigram shu yerda).
 */

// ─── Tiplar ──────────────────────────────────────────────────────────────────

/** Moslik ishonchliligi: sku_kod/aniq nom = "aniq", qisman/fuzzy = "taxminiy". */
export type VozvratMatchConfidence = "aniq" | "taxminiy" | "topilmadi";

/** Moslik qaysi bosqichda topilgani (diagnostika/admin uchun). */
export type VozvratMatchUsul = "id" | "sku" | "nom" | "qisman" | "fuzzy" | "yoq";

export type VozvratMatch = {
  supplierId: number | null;
  confidence: VozvratMatchConfidence;
  usul: VozvratMatchUsul;
  /** 0..1 — fuzzy/qisman bosqichdagi o'xshashlik bahosi (aniq moslikda 1). */
  score: number;
};

/** Matcher qurish uchun minimal postavshik ma'lumoti. */
export type SupplierNameRef = { id: number; name: string };

/** Vozvrat qatoridan moslik uchun kerak bo'ladigan maydonlar. */
export type VozvratMatchInput = {
  /**
   * Miniapp postavshik pickeri yozadigan `vozvratlar.taminotchi_id`.
   * Server tomonda `Supplier` bo'yicha validatsiyadan o'tgan — taxmin emas,
   * shuning uchun zanjirning eng boshida turadi.
   */
  taminotchiId?: number | null;
  skuKod?: number | null;
  taminotchi?: string | null;
};

export type SupplierMatcher = {
  match(input: VozvratMatchInput): VozvratMatch;
  /** Indeksdagi postavshiklar soni (diagnostika). */
  readonly supplierCount: number;
};

const TOPILMADI: VozvratMatch = { supplierId: null, confidence: "topilmadi", usul: "yoq", score: 0 };

// ─── Sozlamalar (chegaralar) ─────────────────────────────────────────────────

/** Qisman moslik uchun normalizatsiyadan keyingi minimal uzunlik — "1-", "ok" kabi
 *  qoldiqlar 300 ta nomning ichiga tushib ketmasin. */
const MIN_QISMAN_LEN = 4;

/** Fuzzy bosqichi uchun minimal uzunlik — 3-4 harfli qoldiqda Levenshtein shovqin. */
const MIN_FUZZY_LEN = 5;

/** Fuzzy qabul chegarasi (token qamrovi 0..1). Tanlash asosi modul oxirida. */
const FUZZY_THRESHOLD = 0.72;

/** Eng yaxshi va ikkinchi nomzod orasidagi minimal farq — teng o'xshashlikda
 *  taxmin qilmaymiz (noto'g'ri postavshikka yozib qo'yishdan ko'ra "topilmadi" yaxshi). */
const AMBIGUITY_GAP = 0.05;

// ─── Normalizatsiya ──────────────────────────────────────────────────────────

/** Huquqiy shakllar — butun so'z sifatida olib tashlanadi (lotin + kirill). */
const HUQUQIY_SHAKL = /\b(?:mchj|ooo|ооо|xk|qk|mas|ltd|llc|jv|ip|yatt)\b/gu;

/** Raqamli prefiks: "1-EURO FOOD", "12 . ASIA" → prefikssiz. */
const RAQAMLI_PREFIKS = /^\d+\s*[-_.]\s*/u;

/** Tirnoq/qo'shtirnoq variantlari (apostrof o'zbekcha nomlarda ko'p: O'RIKZOR). */
const TIRNOQLAR = /['"`‘’“”«»ʻʼ]/gu;

/**
 * Postavshik nomini solishtirishga tayyorlaydi:
 * kichik harf → tirnoqlarni o'chirish → raqamli prefiksni kesish →
 * harf-raqamdan boshqasini probelga → huquqiy shakllarni olib tashlash → probellarni siqish.
 *
 * Eksport qilingan: admin/diagnostika sahifasi ham AYNAN shu qoidani ko'rsatishi kerak.
 */
export function normalizeSupplierName(raw: string | null | undefined): string {
  if (!raw) return "";
  // trim() prefiksdan OLDIN: RAQAMLI_PREFIKS `^` ga bog'langan, boshdagi probel bo'lsa
  // "  1 - EURO" dagi "1" kesilmay qolardi.
  let s = raw.toLowerCase().replace(TIRNOQLAR, "").trim();
  s = s.replace(RAQAMLI_PREFIKS, "");
  s = s.replace(/[^\p{L}\p{N}]+/gu, " ");
  s = s.replace(HUQUQIY_SHAKL, " ");
  return s.replace(/\s+/g, " ").trim();
}

// ─── O'xshashlik primitivlari ────────────────────────────────────────────────

/** Levenshtein masofasi (ikki qatorli DP — nomlar qisqa, xotira O(min(n,m))). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Qisqarog'i ustun bo'lsin — qator uzunligi min(n,m)
  if (a.length > b.length) [a, b] = [b, a];
  let prev = new Array<number>(a.length + 1);
  let cur = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;
  for (let j = 1; j <= b.length; j++) {
    cur[0] = j;
    const bj = b.charCodeAt(j - 1);
    for (let i = 1; i <= a.length; i++) {
      const cost = a.charCodeAt(i - 1) === bj ? 0 : 1;
      cur[i] = Math.min(cur[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[a.length];
}

/** 0..1 o'xshashlik: 1 − masofa/uzunroq. */
function levRatio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 0;
  return 1 - levenshtein(a, b) / max;
}

/** Trigram to'plami (pg_trgm uslubida chekka to'ldirish bilan) — nomzod tanlash uchun. */
function trigrams(s: string): string[] {
  const padded = `  ${s} `;
  const out: string[] = [];
  for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3));
  return out;
}

/**
 * "Qamrov" bahosi: SO'ROV tokenlarining har biri nomzodda qanchalik topilgan —
 * token uzunligi bo'yicha vaznlangan o'rtacha Levenshtein o'xshashligi.
 *
 * Nega token darajasida: postavshik nomlari ko'p so'zli va vozvrat matni odatda
 * QISQAROQ ("PONEDA" ↔ "POBEDA GRUPP"). Butun qator bo'yicha Levenshtein bunday
 * holatda 0.4 gacha tushib ketadi — token bo'yicha esa 0.83 (to'g'ri javob).
 */
function tokenCoverage(qTokens: readonly string[], cTokens: readonly string[]): number {
  let ogirlik = 0;
  let yigindi = 0;
  for (const q of qTokens) {
    let eng = 0;
    for (const c of cTokens) {
      const r = levRatio(q, c);
      if (r > eng) eng = r;
      if (eng === 1) break;
    }
    ogirlik += q.length;
    yigindi += q.length * eng;
  }
  return ogirlik === 0 ? 0 : yigindi / ogirlik;
}

// ─── Matcher ─────────────────────────────────────────────────────────────────

type Entry = { id: number; norm: string; tokens: string[] };

/**
 * Moslik jadvalini BIR MARTA quradi va qayta ishlatiladigan matcher qaytaradi.
 *
 * @param suppliers            barcha postavshiklar (id + name)
 * @param productSupplierByCode  Product.code → supplierId (sku_kod bosqichi uchun;
 *                               berilmasa 1-bosqich o'tkazib yuboriladi)
 * @param opts.fuzzyThreshold  fuzzy qabul chegarasi (default 0.72)
 */
export function buildSupplierMatcher(
  suppliers: readonly SupplierNameRef[],
  productSupplierByCode?: ReadonlyMap<number, number | null>,
  opts?: { fuzzyThreshold?: number }
): SupplierMatcher {
  const threshold = opts?.fuzzyThreshold ?? FUZZY_THRESHOLD;

  const entries: Entry[] = [];
  const byNorm = new Map<string, number[]>(); // normalizatsiyalangan nom → supplierId[]
  const gramIndex = new Map<string, number[]>(); // trigram → entries indeksi
  const knownIds = new Set<number>(); // taminotchi_id ni tekshirish uchun

  for (const s of suppliers) {
    knownIds.add(s.id);
    const norm = normalizeSupplierName(s.name);
    if (!norm) continue;
    const idx = entries.length;
    entries.push({ id: s.id, norm, tokens: norm.split(" ") });

    const bor = byNorm.get(norm);
    if (bor) bor.push(s.id);
    else byNorm.set(norm, [s.id]);

    for (const g of new Set(trigrams(norm))) {
      const list = gramIndex.get(g);
      if (list) list.push(idx);
      else gramIndex.set(g, [idx]);
    }
  }

  // Bir xil `taminotchi` matni 268 qatorda o'nlab marta takrorlanadi — memo.
  const memo = new Map<string, VozvratMatch>();

  /** Trigram teskari indeksi orqali nomzodlar (0 ta umumiy trigram → 0.72 ga chiqa olmaydi). */
  function nomzodlar(norm: string): number[] {
    const seen = new Set<number>();
    for (const g of new Set(trigrams(norm))) {
      const list = gramIndex.get(g);
      if (list) for (const i of list) seen.add(i);
    }
    return [...seen];
  }

  function matchByName(raw: string): VozvratMatch {
    const norm = normalizeSupplierName(raw);
    if (!norm) return TOPILMADI;

    const kesh = memo.get(norm);
    if (kesh) return kesh;

    const natija = hisobla(norm);
    memo.set(norm, natija);
    return natija;
  }

  function hisobla(norm: string): VozvratMatch {
    // 2-bosqich — normalizatsiyadan keyin AYNAN teng.
    const teng = byNorm.get(norm);
    if (teng) {
      // Bir xil normal nomli bir nechta postavshik ("1-X" va "2-X") — nom bo'yicha
      // ajratib bo'lmaydi: eng kichik id, lekin "aniq" DEB ATAMAYMIZ.
      return teng.length === 1
        ? { supplierId: teng[0], confidence: "aniq", usul: "nom", score: 1 }
        : { supplierId: Math.min(...teng), confidence: "taxminiy", usul: "nom", score: 1 };
    }

    const cands = nomzodlar(norm);
    if (cands.length === 0) return TOPILMADI;

    // 3-bosqich — qisman moslik (biri ikkinchisining ichida). Vozvrat matnida
    // raqamli prefiks/shahar qo'shimchasi bo'lmaydi, shuning uchun bu bosqich ko'p ishlaydi.
    //
    // FAQAT BITTA postavshik mos kelsa qabul qilamiz. Ko'p bo'lsa — "eng yaqin uzunlik"
    // kabi evristika bilan BIRINI TANLAMAYMIZ: "euro food trade" ham "…toshkent",
    // ham "…samarqand" ichida bor va uzunlik farqi (9 va 10) tanlov uchun asos emas —
    // bu jim ravishda noto'g'ri filialga yozib qo'yardi. Bunday holat fuzzy bosqichiga
    // tushadi, u ham ajrata olmasa "topilmadi" bo'ladi.
    if (norm.length >= MIN_QISMAN_LEN) {
      const mos = new Set<number>();
      for (const i of cands) {
        const e = entries[i];
        if (e.norm.length < MIN_QISMAN_LEN) continue;
        if (e.norm.includes(norm) || norm.includes(e.norm)) mos.add(e.id);
      }
      if (mos.size === 1) {
        return { supplierId: [...mos][0], confidence: "taxminiy", usul: "qisman", score: 1 };
      }
    }

    // 4-bosqich — fuzzy (imlo xatolari: tpade→trade, PONEDA→POBEDA, millenium→millennium).
    if (norm.length < MIN_FUZZY_LEN) return TOPILMADI;
    const qTokens = norm.split(" ");
    let best = 0;
    let bestId = -1;
    let ikkinchi = 0;
    for (const i of cands) {
      const e = entries[i];
      const score = tokenCoverage(qTokens, e.tokens);
      if (score > best) {
        ikkinchi = best;
        best = score;
        bestId = e.id;
      } else if (score > ikkinchi) {
        ikkinchi = score;
      }
    }
    if (bestId === -1 || best < threshold) return TOPILMADI;
    // Ikki nomzod deyarli teng — taxmin qilmaymiz.
    if (ikkinchi >= threshold && best - ikkinchi < AMBIGUITY_GAP) return TOPILMADI;
    return { supplierId: bestId, confidence: "taxminiy", usul: "fuzzy", score: best };
  }

  return {
    supplierCount: entries.length,
    match(input: VozvratMatchInput): VozvratMatch {
      // 1-bosqich — taminotchi_id: miniapp pickeri yozgan, server tomonda
      // Supplier bo'yicha tekshirilgan. Taxminiy emas, shuning uchun birinchi.
      // Indeksda yo'q id (postavshik o'chirilgan) — keyingi bosqichlarga tushadi.
      if (input.taminotchiId != null && knownIds.has(input.taminotchiId)) {
        return { supplierId: input.taminotchiId, confidence: "aniq", usul: "id", score: 1 };
      }
      // 2-bosqich — sku_kod (Excel importda null, lekin miniapp
      // katalogidan tanlanganda to'ldiriladi).
      if (input.skuKod != null && productSupplierByCode) {
        const sid = productSupplierByCode.get(input.skuKod);
        if (sid != null) return { supplierId: sid, confidence: "aniq", usul: "sku", score: 1 };
      }
      if (!input.taminotchi) return TOPILMADI;
      return matchByName(input.taminotchi);
    },
  };
}

/*
 * FUZZY CHEGARASI (0.72) — qanday tanlangani:
 *
 * Baho = so'rov tokenlarining vaznlangan Levenshtein qamrovi (tokenCoverage).
 * Jonli ma'lumotdagi real holatlar:
 *   "platinum tpade"           ↔ "platinum trade"            → 0.92  ✓ qabul
 *   "millenium"                ↔ "millennium ..."            → 0.90  ✓ qabul
 *   "eruo food trade toshkent" ↔ "euro food trade toshkent"  → 0.90  ✓ qabul
 *   "asia notional distrubition" ↔ "asia national distrubition savushkin/galinablanca"
 *                                                            → 0.96  ✓ qabul
 *   "poneda"                   ↔ "pobeda grupp"              → 0.83  ✓ qabul
 * Eng xavfli YAQIN-lekin-BOSHQA juftlik (shahar bilan farqlanuvchi nomlar):
 *   "euro food trade toshkent" ↔ "euro food trade samarqand" → 0.70  ✗ rad
 *
 * Ya'ni real imlo xatolari 0.83+ da, chinakam boshqa postavshik esa 0.70 da turadi —
 * 0.72 shu ikki to'plam orasidagi eng keng bo'shliqda. Undan pastga tushirish
 * (0.65) filial/shahar bilan farqlanuvchi nomlarni chalkashtira boshlaydi, yuqoriga
 * ko'tarish (0.85) esa "poneda"/"pobeda grupp" kabi qisqa matnlarni yo'qotadi.
 *
 * Qo'shimcha himoya: AMBIGUITY_GAP — ikki nomzod ikkalasi ham chegaradan o'tsa va
 * farqi 0.05 dan kichik bo'lsa, natija "topilmadi". Noto'g'ri postavshikka yozib
 * qo'yish (jim xato) ochiq "biriktirilmagan" dan qimmatroq.
 */

