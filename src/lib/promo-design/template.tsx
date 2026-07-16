/**
 * Aksiya dizayn banneri (next/og Satori JSX) — A4 (landscape) va Instagram (portrait).
 * Satori cheklovi: FAQAT flexbox; har ko'p-bolali <div> ga display:"flex" SHART;
 * flexDirection default "row"; ranglar inline hex.
 * Shrift: matn "VelaSans", raqamlar "Golos" (route'da loadDesignFonts orqali yuklanadi).
 */
import type { DesignData } from "./data";

// Katalog banneri (catalog.tsx) shu yordamchilarni qayta ishlatadi — nusxa ko'paymasin.
export const NF = new Intl.NumberFormat("uz-UZ");
export const money = (n: number) => NF.format(Math.round(n));
const fmtLimit = (n: number) => (n % 1 === 0 ? String(n) : n.toLocaleString("uz-UZ", { maximumFractionDigits: 3 }));

// Supermarket narx uslubi: 99 990 → katta "99" + ko'tarilgan "990" (ostida "so'm").
export const splitPrice = (n: number): { main: string; sup: string | null } => {
  const v = Math.round(n);
  if (v < 1000) return { main: String(v), sup: null };
  return { main: NF.format(Math.floor(v / 1000)), sup: String(v % 1000).padStart(3, "0") };
};

// ── Matn eni (taxminiy) ──────────────────────────────────────────────────────
// Satori matnni panelga sig'dirish uchun SIQMAYDI — sig'masa ustma-ust chizadi.
// Shuning uchun shriftni oldindan o'lchab kichraytiramiz. Koeffitsiyentlar chizilgan
// bannerdan o'lchab olingan: Golos raqami ≈ 0.6em, bo'sh joy ≈ 0.26em, VelaSans ≈ 0.5em.
export const golosWidth = (s: string, size: number) =>
  size * [...s].reduce((a, ch) => a + (ch === " " ? 0.26 : 0.6), 0);
const SOM_WIDTH = (size: number) => size * 4 * 0.5; // "so'm" — VelaSans, 4 belgi

/**
 * Ko'tarilgan narx bloki ("249" + ko'tarilgan "990" + ostida "so'm") berilgan enga
 * sig'masa — uchala shriftni bir xil nisbatda kichraytirish koeffitsiyenti (≤1).
 * 6 xonali narx Instagram formatida "990" ni "249" ustiga chizib yuborardi.
 */
export function splitPriceScale(
  main: string, sup: string | null, mainSize: number, supSize: number, somSize: number, avail: number
): number {
  const supW = Math.max(sup ? golosWidth(sup, supSize) : 0, SOM_WIDTH(somSize));
  const total = golosWidth(main, mainSize) + 10 + supW;
  return total <= avail ? 1 : avail / total;
}

export const GREEN = "#22C55E";
const GREEN_DARK = "#15803D";
const BLUE = "#2563EB";

/** Mahsulot rasmi — imageZoom (x1..x2, kasr: 1.3/1.7 ham) bilan KATTAROQ ko'rsatiladi.
 *  QIRQILMAYDI: quti (w×h) layout'da o'z o'lchamida qoladi, rasm elementi esa zoom
 *  marta katta chiziladi (overflow ko'rinadi) — mahsulot PNG atrofi shaffof/oq
 *  bo'lgani uchun shunchaki yirikroq ko'rinadi. Placeholder'da zoom yo'q. */
export function ProductImage({ src, w, h, zoom, placeholder }: { src: string; w: number; h: number; zoom: number; placeholder: boolean }) {
  const z = placeholder ? 1 : Math.min(2, Math.max(1, zoom || 1));
  return (
    <div style={{ display: "flex", width: w, height: h, alignItems: "center", justifyContent: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        width={Math.round(w * z)}
        height={Math.round(h * z)}
        style={{ objectFit: "contain", opacity: placeholder ? 0.2 : 1, flexShrink: 0 }}
        alt=""
      />
    </div>
  );
}

type Format = "a4" | "instagram";

type Sizes = {
  W: number; H: number; leftPct: string; pad: number; radius: number;
  titleSize: number; ruSize: number; oldSize: number; newSize: number; dateSize: number;
  badgeSize: number; circleSize: number; circlePct: number; circleTop: number; circleRight: number;
  imgW: number; imgH: number; limitSize: number; brand: boolean;
};

const A4: Sizes = {
  W: 1414, H: 1000, leftPct: "42%", pad: 60, radius: 90,
  titleSize: 62, ruSize: 32, oldSize: 44, newSize: 110, dateSize: 34,
  badgeSize: 30, circleSize: 180, circlePct: 60, circleTop: 90, circleRight: 70,
  imgW: 620, imgH: 620, limitSize: 26, brand: false,
};
const INSTA: Sizes = {
  W: 1080, H: 1350, leftPct: "40%", pad: 52, radius: 80,
  titleSize: 50, ruSize: 26, oldSize: 38, newSize: 96, dateSize: 30,
  badgeSize: 28, circleSize: 158, circlePct: 54, circleTop: 70, circleRight: 56,
  imgW: 560, imgH: 760, limitSize: 24, brand: true,
};

// ─── HAFTA CHEGIRMASI varianti (dizayner maketi) ────────────────────────────────
// Farqlar: narx supermarket uslubida (katta + ko'tarilgan mayda qism), tepasida eski
// narx (ustma chizilgan); ko'k doira chegirma bo'lsa "-N% TEJANG", bo'lmasa "Barakali
// xarid"; pastda ijtimoiy tarmoq CTA + handle.

// DIQQAT: o'ng panelga ANIQ kenglik (rightPct) shart — flexGrow bo'lsa uzun CTA matni
// panelni kontent eniga cho'zib, hammasini kanvasdan chiqarib yuboradi (Yoga min-width).
type HSizes = {
  W: number; H: number; leftPct: string; rightPct: string; pad: number; radius: number;
  titleSize: number; ruSize: number; oldSize: number;
  priceMain: number; priceSup: number; priceSom: number;
  dateSize: number; badgeSize: number; circleSize: number; circleText: number; circlePct: number;
  circleTop: number; circleRight: number; imgW: number; imgH: number;
  ctaSize: number; ctaW: number; handleSize: number; limitSize: number;
  showLimit: boolean; // limit qatori faqat A4 (chop) formatida ko'rsatiladi
};

const H_A4: HSizes = {
  W: 1414, H: 1000, leftPct: "44%", rightPct: "56%", pad: 60, radius: 90,
  titleSize: 60, ruSize: 32, oldSize: 46, priceMain: 150, priceSup: 70, priceSom: 48, dateSize: 34,
  badgeSize: 30, circleSize: 165, circleText: 32, circlePct: 56, circleTop: 200, circleRight: 110,
  imgW: 560, imgH: 540, ctaSize: 26, ctaW: 600, handleSize: 24, limitSize: 26, showLimit: true,
};
const H_INSTA: HSizes = {
  W: 1080, H: 1350, leftPct: "46%", rightPct: "54%", pad: 52, radius: 80,
  titleSize: 50, ruSize: 26, oldSize: 44, priceMain: 185, priceSup: 84, priceSom: 58, dateSize: 30,
  badgeSize: 28, circleSize: 160, circleText: 30, circlePct: 54, circleTop: 380, circleRight: 100,
  imgW: 460, imgH: 600, ctaSize: 27, ctaW: 470, handleSize: 25, limitSize: 24, showLimit: false,
};

const CTA_TEXT =
  "Hafta aksiyalaridan har doim xabardor bo’lish uchun bizning ijtimoiy tarmoqlarimizdagi sahifalarga obuna bo’ling!";

function HaftaBanner({ data, S, logoData }: { data: DesignData; S: HSizes; logoData: string }) {
  const img = data.imageData ?? logoData;
  const placeholder = !data.imageData;
  const price = splitPrice(data.promoPrice);
  // Narx chap panelga sig'masa kichrayadi (padding ikki tomondan ayriladi).
  const availW = Math.round((parseFloat(S.leftPct) / 100) * S.W) - S.pad * 2;
  const k = splitPriceScale(price.main, price.sup, S.priceMain, S.priceSup, S.priceSom, availW);
  const pMain = Math.round(S.priceMain * k);
  const pSup = Math.round(S.priceSup * k);
  const pSom = Math.round(S.priceSom * k);

  return (
    <div style={{ display: "flex", width: S.W, height: S.H, fontFamily: "VelaSans", backgroundColor: "#ffffff" }}>
      {/* ── CHAP: yashil panel ── */}
      <div
        style={{
          display: "flex", flexDirection: "column",
          width: S.leftPct, height: "100%", backgroundColor: GREEN, padding: S.pad,
          borderTopRightRadius: S.radius, borderBottomRightRadius: S.radius,
        }}
      >
        {/* nom */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: S.titleSize, fontWeight: 700, color: "#ffffff", lineHeight: 1.08 }}>
            {data.titleUz}
          </div>
          {data.titleRu && (
            <div style={{ display: "flex", fontSize: S.ruSize, color: "#eafff1", marginTop: 14 }}>{data.titleRu}</div>
          )}
        </div>

        {/* narx — supermarket uslubi, pastga surilgan (maket bo'yicha); tepasida eski narx */}
        <div style={{ display: "flex", flexGrow: 1, flexDirection: "column", justifyContent: "flex-end" }}>
          {!data.nPlusM && data.regularPrice > data.promoPrice && (
            /* Yaxlit ustma chiziq: text-decoration span'lar orasida uzilib, balandligi
               farq qilardi (Golos va VelaSans metrikalari har xil) — o'rniga bitta
               absolute chiziq butun blok bo'ylab, vertikal o'rtadan. */
            <div
              style={{
                display: "flex", position: "relative", alignSelf: "flex-start", alignItems: "baseline",
                fontSize: S.oldSize, color: "#dcfce7", marginBottom: 14,
              }}
            >
              <span style={{ fontFamily: "Golos" }}>{money(data.regularPrice)}</span>
              <span style={{ marginLeft: 10 }}>so&apos;m</span>
              <div style={{ position: "absolute", left: 0, right: 0, top: "52%", height: Math.max(3, Math.round(S.oldSize * 0.09)), backgroundColor: "#dcfce7" }} />
            </div>
          )}
          <div style={{ display: "flex", alignItems: "flex-start", color: "#ffffff" }}>
            <div style={{ display: "flex", fontSize: pMain, fontWeight: 700, fontFamily: "Golos", lineHeight: 0.8 }}>
              {price.main}
            </div>
            {price.sup ? (
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 10 }}>
                <div style={{ display: "flex", fontSize: pSup, fontWeight: 700, fontFamily: "Golos", lineHeight: 0.9 }}>
                  {price.sup}
                </div>
                <div style={{ display: "flex", fontSize: pSom, fontWeight: 700, lineHeight: 1, marginTop: -4 }}>
                  so&apos;m
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", fontSize: pSom, fontWeight: 700, marginLeft: 12, alignSelf: "flex-end" }}>
                so&apos;m
              </div>
            )}
          </div>
        </div>

        {/* limit (bo'lsa) + sana */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: Math.round(S.pad * 0.6) }}>
          {S.showLimit && data.limitN != null && (
            /* Bitta matn tuguni — tor panelda tabiiy o'raladi (span'lar satori'da inline oqmaydi) */
            <div style={{ display: "flex", fontSize: S.limitSize, color: "#eafff1", fontWeight: 700, marginBottom: 10, lineHeight: 1.3 }}>
              {`Barchaga birdek yetishi uchun limit: ${fmtLimit(data.limitN)}\u00A0${data.limitUnit}`}
            </div>
          )}
          <div style={{ display: "flex", fontSize: S.dateSize, color: "#ffffff", fontWeight: 700 }}>{data.dateText}</div>
        </div>
      </div>

      {/* ── O'NG: oq panel ── */}
      <div style={{ display: "flex", flexDirection: "column", width: S.rightPct, height: "100%", padding: S.pad, position: "relative" }}>
        {/* badge */}
        <div style={{ display: "flex" }}>
          <div
            style={{
              display: "flex", backgroundColor: GREEN, color: "#ffffff", fontSize: S.badgeSize,
              fontWeight: 700, padding: "12px 28px", borderRadius: 9999,
            }}
          >
            {data.badgeText}
          </div>
        </div>

        {/* mahsulot rasmi (markaz) */}
        <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <ProductImage src={img} w={S.imgW} h={S.imgH} zoom={data.imageZoom} placeholder={placeholder} />
        </div>

        {/* Ko'k doira (absolute, rasm ustida): chegirma bo'lsa foiz, bo'lmasa "Barakali xarid" */}
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            position: "absolute", top: S.circleTop, right: S.circleRight,
            width: S.circleSize, height: S.circleSize, borderRadius: 9999, backgroundColor: BLUE,
          }}
        >
          {/* Fragment EMAS — satori fragment bolalarini row qilib yotqizadi; column div shart */}
          {data.nPlusM ? (
            <div style={{ display: "flex", fontSize: Math.round(S.circlePct * 1.15), fontWeight: 700, color: "#ffffff", lineHeight: 1, fontFamily: "Golos" }}>
              {data.nPlusM.buy}+{data.nPlusM.free}
            </div>
          ) : data.discountPct > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: S.circlePct, fontWeight: 700, color: "#ffffff", lineHeight: 1, fontFamily: "Golos" }}>
                -{data.discountPct}%
              </div>
              <div style={{ display: "flex", fontSize: Math.round(S.circlePct * 0.4), fontWeight: 700, color: "#ffffff", marginTop: 5 }}>
                TEJANG
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: S.circleText, fontWeight: 700, color: "#ffffff", lineHeight: 1.15 }}>Barakali</div>
              <div style={{ display: "flex", fontSize: S.circleText, fontWeight: 700, color: "#ffffff", lineHeight: 1.15 }}>xarid</div>
            </div>
          )}
        </div>

        {/* ijtimoiy tarmoq CTA + handle */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", width: S.ctaW, fontSize: S.ctaSize, color: GREEN, textAlign: "center", lineHeight: 1.35 }}>
            {CTA_TEXT}
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 18 }}>
            <svg width={S.handleSize + 2} height={S.handleSize + 2} viewBox="0 0 24 24" fill="none">
              <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="#9ca3af" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="4.6" stroke="#9ca3af" strokeWidth="1.8" />
              <circle cx="17.3" cy="6.7" r="1.4" fill="#9ca3af" />
            </svg>
            <div style={{ display: "flex", fontSize: S.handleSize, color: "#9ca3af", marginLeft: 10 }}>bizbop_supermarket</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── BIZBOP NARX varianti (to'q-sariq maket) ───────────────────────────────────
// Farqlar: to'q-sariq fon, o'ngda oq panel (chap burchaklari yumaloq) — tepasida badge +
// bizbop logo, markazda mahsulot; sana va doira YO'Q; eski narx ham supermarket uslubida,
// ustidan QIZIL QIYSHIQ chiziq; A4'da yashil/qizil limit qatorlari, Insta'da "Barcha filiallarda".

const ORANGE = "#FC3A05"; // brend rangi (foydalanuvchi bergan kod)
export const RED_STRIKE = "#E02B20";
const LOGO_RATIO = 3563 / 1165; // public/logo.png nisbatlari

// "BIZBOP NARX" badge shakli — dizaynerning "Asset 1.svg" fayli (barg motivi:
// yuqori-chap va pastki-o'ng burchaklar katta egri, qolganlari o'tkir), fill #FF3700.
const BADGE_PATH = "M24.43,0C10.94,0,0,14.83,0,33.13v5.68h147.99c13.49,0,24.43-14.83,24.43-33.13V0H24.43Z";
const BADGE_VIEWBOX = "0 0 172.42 38.81";
const BADGE_FILL = "#FF3700";

type BSizes = {
  W: number; H: number; leftPct: string; rightPct: string; pad: number; radius: number;
  smallSize: number; titleSize: number; ruSize: number;
  oldMain: number; oldSup: number; oldSom: number;
  newMain: number; newSup: number; newSom: number;
  badgeSize: number; badgeW: number; badgeH: number; logoH: number; imgW: number; imgH: number;
  limitUz: number; limitRu: number; branchSize: number;
  // N+M ko'k doira badge (mahsulot rasmi ustida) — o'ng oq panelda absolute joylashadi
  circleSize: number; circleTop: number; circleRight: number;
  showLimit: boolean; // limit qatorlari faqat A4 (chop) formatida
};

const B_A4: BSizes = {
  W: 1414, H: 1000, leftPct: "53%", rightPct: "47%", pad: 60, radius: 80,
  smallSize: 26, titleSize: 62, ruSize: 30,
  oldMain: 64, oldSup: 34, oldSom: 26,
  newMain: 160, newSup: 74, newSom: 50,
  badgeSize: 30, badgeW: 252, badgeH: 57, logoH: 44, imgW: 470, imgH: 560,
  limitUz: 22, limitRu: 13, branchSize: 30,
  circleSize: 172, circleTop: 200, circleRight: 66, showLimit: true,
};
const B_INSTA: BSizes = {
  W: 1080, H: 1350, leftPct: "50%", rightPct: "50%", pad: 52, radius: 70,
  smallSize: 24, titleSize: 50, ruSize: 28,
  oldMain: 76, oldSup: 40, oldSom: 30,
  newMain: 185, newSup: 84, newSom: 58,
  badgeSize: 26, badgeW: 222, badgeH: 50, logoH: 36, imgW: 420, imgH: 680,
  limitUz: 24, limitRu: 17, branchSize: 30,
  circleSize: 166, circleTop: 330, circleRight: 56, showLimit: false,
};

/** Supermarket uslubidagi narx bloki (katta ming qism + ko'tarilgan 3 raqam + so'm).
 *  `avail` — panelda mavjud en: narx sig'masa shriftlar shu yerda kichrayadi. */
function SupPrice({ value, main, sup, som, avail }: { value: number; main: number; sup: number; som: number; avail: number }) {
  const p = splitPrice(value);
  const k = splitPriceScale(p.main, p.sup, main, sup, som, avail);
  const mS = Math.round(main * k);
  const sS = Math.round(sup * k);
  const soS = Math.round(som * k);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", color: "#ffffff" }}>
      <div style={{ display: "flex", fontSize: mS, fontWeight: 700, fontFamily: "Golos", lineHeight: 0.8 }}>{p.main}</div>
      {p.sup ? (
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 8 }}>
          <div style={{ display: "flex", fontSize: sS, fontWeight: 700, fontFamily: "Golos", lineHeight: 0.9 }}>{p.sup}</div>
          <div style={{ display: "flex", fontSize: soS, fontWeight: 700, lineHeight: 1, marginTop: -3 }}>so&apos;m</div>
        </div>
      ) : (
        <div style={{ display: "flex", fontSize: soS, fontWeight: 700, marginLeft: 10, alignSelf: "flex-end" }}>so&apos;m</div>
      )}
    </div>
  );
}

function BizbopBanner({ data, S, logoData }: { data: DesignData; S: BSizes; logoData: string }) {
  const img = data.imageData ?? logoData;
  const placeholder = !data.imageData;
  // Narxlar chap to'q-sariq panelga sig'sin (6 xonali narx ustma-ust tushib qolardi).
  const availW = Math.round((parseFloat(S.leftPct) / 100) * S.W) - S.pad * 2;

  return (
    <div style={{ display: "flex", width: S.W, height: S.H, fontFamily: "VelaSans", backgroundColor: ORANGE }}>
      {/* ── CHAP: to'q-sariq panel ── */}
      <div style={{ display: "flex", flexDirection: "column", width: S.leftPct, height: "100%", padding: S.pad }}>
        <div style={{ display: "flex", fontSize: S.smallSize, fontWeight: 700, color: "#ffffff" }}>
          Mahsulotlar miqdori cheklangan.
        </div>

        {/* nom */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: Math.round(S.pad * 0.9) }}>
          <div style={{ display: "flex", fontSize: S.titleSize, fontWeight: 700, color: "#ffffff", lineHeight: 1.08 }}>
            {data.titleUz}
          </div>
          {data.titleRu && (
            <div style={{ display: "flex", fontSize: S.ruSize, color: "#ffe9df", marginTop: 16 }}>{data.titleRu}</div>
          )}
        </div>

        {/* narxlar — pastga yopishgan */}
        <div style={{ display: "flex", flexGrow: 1, flexDirection: "column", justifyContent: "flex-end" }}>
          {!data.nPlusM && data.regularPrice > data.promoPrice && (
            <div style={{ display: "flex", position: "relative", alignSelf: "flex-start", marginBottom: 18 }}>
              <SupPrice value={data.regularPrice} main={S.oldMain} sup={S.oldSup} som={S.oldSom} avail={availW} />
              {/* qizil qiyshiq ustma chiziq (o'ngga pastga qiya, maketdagidek) — butun blok bo'ylab */}
              <div
                style={{
                  position: "absolute", left: "-7%", right: "-7%", top: "46%",
                  height: Math.max(5, Math.round(S.oldMain * 0.1)),
                  backgroundColor: RED_STRIKE, transform: "rotate(7deg)",
                }}
              />
            </div>
          )}
          <SupPrice value={data.promoPrice} main={S.newMain} sup={S.newSup} som={S.newSom} avail={availW} />
          {!S.showLimit && (
            <div style={{ display: "flex", fontSize: S.branchSize, fontWeight: 700, color: "#ffffff", marginTop: Math.round(S.pad * 1.1) }}>
              Barcha filiallarda
            </div>
          )}
        </div>
      </div>

      {/* ── O'NG: oq panel (chap burchaklari yumaloq) ── */}
      <div
        style={{
          display: "flex", flexDirection: "column", width: S.rightPct, height: "100%",
          backgroundColor: "#ffffff", padding: S.pad, position: "relative",
          borderTopLeftRadius: S.radius, borderBottomLeftRadius: S.radius,
        }}
      >
        {/* badge (Asset 1.svg shakli) + logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", position: "relative", width: S.badgeW, height: S.badgeH, alignItems: "center", justifyContent: "center" }}>
            <svg width={S.badgeW} height={S.badgeH} viewBox={BADGE_VIEWBOX} style={{ position: "absolute", top: 0, left: 0 }}>
              <path fill={BADGE_FILL} d={BADGE_PATH} />
            </svg>
            <div style={{ display: "flex", fontSize: S.badgeSize, fontWeight: 700, color: "#ffffff" }}>{data.badgeText}</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoData} width={Math.round(S.logoH * LOGO_RATIO)} height={S.logoH} alt="" />
        </div>

        {/* mahsulot rasmi (markaz) */}
        <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <ProductImage src={img} w={S.imgW} h={S.imgH} zoom={data.imageZoom} placeholder={placeholder} />
        </div>

        {/* N+M ko'k doira badge — mahsulot rasmi ustida (absolute; rasmdan KEYIN — ustiga chiziladi) */}
        {data.nPlusM && (
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "absolute", top: S.circleTop, right: S.circleRight,
              width: S.circleSize, height: S.circleSize, borderRadius: 9999, backgroundColor: BLUE,
            }}
          >
            <div style={{ display: "flex", fontSize: Math.round(S.circleSize * 0.42), fontWeight: 700, color: "#ffffff", fontFamily: "Golos", lineHeight: 1 }}>
              {data.nPlusM.buy}+{data.nPlusM.free}
            </div>
          </div>
        )}

        {/* limit — faqat A4 (chop): yashil uz + qizil ru qatorlar */}
        {S.showLimit && data.limitN != null && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", width: "100%", justifyContent: "center", fontSize: S.limitUz, fontWeight: 700, color: GREEN, textAlign: "center", lineHeight: 1.25 }}>
              {`Barchaga birdek yetishi uchun limit ${fmtLimit(data.limitN)}\u00A0${data.limitUnit}.`}
            </div>
            <div style={{ display: "flex", width: "100%", justifyContent: "center", fontSize: S.limitRu, fontWeight: 700, color: RED_STRIKE, textAlign: "center", lineHeight: 1.3, marginTop: 6 }}>
              {`Чтобы дать возможность каждому приобрести данный товар: ${fmtLimit(data.limitN)}\u00A0${data.limitUnit === "kg" ? "кг" : "шт"} в одни руки`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DesignBanner({ data, format, logoData }: { data: DesignData; format: Format; logoData: string }) {
  if (data.variant === "hafta") {
    return <HaftaBanner data={data} S={format === "a4" ? H_A4 : H_INSTA} logoData={logoData} />;
  }
  if (data.variant === "bizbop") {
    return <BizbopBanner data={data} S={format === "a4" ? B_A4 : B_INSTA} logoData={logoData} />;
  }
  const S = format === "a4" ? A4 : INSTA;
  const img = data.imageData ?? logoData;
  const placeholder = !data.imageData;

  return (
    <div style={{ display: "flex", width: S.W, height: S.H, fontFamily: "VelaSans", backgroundColor: "#ffffff" }}>
      {/* ── CHAP: yashil panel ── */}
      <div
        style={{
          display: "flex", flexDirection: "column",
          width: S.leftPct, height: "100%", backgroundColor: GREEN, padding: S.pad,
          borderTopRightRadius: S.radius, borderBottomRightRadius: S.radius,
        }}
      >
        {/* nom */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: S.titleSize, fontWeight: 700, color: "#ffffff", lineHeight: 1.05 }}>
            {data.titleUz}
          </div>
          {data.titleRu && (
            <div style={{ display: "flex", fontSize: S.ruSize, color: "#eafff1", marginTop: 12 }}>{data.titleRu}</div>
          )}
        </div>

        {/* narxlar — pastga yopishgan (sana ustida ozgina tepada) */}
        <div style={{ display: "flex", flexGrow: 1, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {!data.nPlusM && data.regularPrice > data.promoPrice && (
              <div style={{ display: "flex", alignItems: "baseline", fontSize: S.oldSize, color: "#dcfce7" }}>
                <span style={{ fontFamily: "Golos", textDecoration: "line-through" }}>{money(data.regularPrice)}</span>
                <span style={{ marginLeft: 12, textDecoration: "line-through" }}>so&apos;m</span>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
              <div style={{ display: "flex", fontSize: S.newSize, fontWeight: 700, color: "#ffffff", lineHeight: 0.95, fontFamily: "Golos" }}>
                {money(data.promoPrice)}
              </div>
              <div style={{ display: "flex", fontSize: Math.round(S.newSize * 0.42), fontWeight: 700, color: "#ffffff", lineHeight: 1 }}>
                so&apos;m
              </div>
            </div>
          </div>
        </div>

        {/* sana */}
        <div style={{ display: "flex", fontSize: S.dateSize, color: "#ffffff", fontWeight: 700, marginTop: 28 }}>{data.dateText}</div>
      </div>

      {/* ── O'NG: oq panel ── */}
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, height: "100%", padding: S.pad, position: "relative" }}>
        {/* badge */}
        <div style={{ display: "flex" }}>
          <div
            style={{
              display: "flex", backgroundColor: GREEN, color: "#ffffff", fontSize: S.badgeSize,
              fontWeight: 700, padding: "12px 28px", borderRadius: 9999,
            }}
          >
            {data.badgeText}
          </div>
        </div>

        {/* mahsulot rasmi (markaz) */}
        <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <ProductImage src={img} w={S.imgW} h={S.imgH} zoom={data.imageZoom} placeholder={placeholder} />
        </div>

        {/* chegirma/N+M doirasi (absolute, o'ng-yuqori) */}
        {(data.nPlusM || data.discountPct > 0) && (
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              position: "absolute", top: S.circleTop, right: S.circleRight,
              width: S.circleSize, height: S.circleSize, borderRadius: 9999, backgroundColor: BLUE,
            }}
          >
            {data.nPlusM ? (
              <div style={{ display: "flex", fontSize: Math.round(S.circlePct * 1.15), fontWeight: 700, color: "#ffffff", lineHeight: 1, fontFamily: "Golos" }}>
                {data.nPlusM.buy}+{data.nPlusM.free}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ display: "flex", fontSize: S.circlePct, fontWeight: 700, color: "#ffffff", lineHeight: 1, fontFamily: "Golos" }}>
                  -{data.discountPct}%
                </div>
                <div style={{ display: "flex", fontSize: Math.round(S.circlePct * 0.34), fontWeight: 700, color: "#ffffff", marginTop: 4 }}>
                  TEJANG
                </div>
              </div>
            )}
          </div>
        )}

        {/* limit + brand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {data.limitN != null && (
            <div style={{ display: "flex", fontSize: S.limitSize, color: GREEN_DARK, fontWeight: 700 }}>
              <span style={{ marginRight: 7 }}>Barchaga birdek yetishi uchun limit:</span>
              <span style={{ fontFamily: "Golos" }}>{fmtLimit(data.limitN)}</span>
              <span style={{ marginLeft: 6 }}>{data.limitUnit}</span>
            </div>
          )}
          {S.brand && (
            <div style={{ display: "flex", fontSize: S.limitSize, color: "#9ca3af", marginTop: 14 }}>bizbop_supermarket</div>
          )}
        </div>
      </div>
    </div>
  );
}
