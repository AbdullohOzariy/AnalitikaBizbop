/**
 * Aksiya dizayn banneri (next/og Satori JSX) — A4 (landscape) va Instagram (portrait).
 * Satori cheklovi: FAQAT flexbox; har ko'p-bolali <div> ga display:"flex" SHART;
 * flexDirection default "row"; ranglar inline hex.
 * Shrift: matn "VelaSans", raqamlar "Golos" (route'da loadDesignFonts orqali yuklanadi).
 */
import type { DesignData } from "./data";

const NF = new Intl.NumberFormat("uz-UZ");
const money = (n: number) => NF.format(Math.round(n));
const fmtLimit = (n: number) => (n % 1 === 0 ? String(n) : n.toLocaleString("uz-UZ", { maximumFractionDigits: 3 }));

// Supermarket narx uslubi: 99 990 → katta "99" + ko'tarilgan "990" (ostida "so'm").
const splitPrice = (n: number): { main: string; sup: string | null } => {
  const v = Math.round(n);
  if (v < 1000) return { main: String(v), sup: null };
  return { main: NF.format(Math.floor(v / 1000)), sup: String(v % 1000).padStart(3, "0") };
};

const GREEN = "#22C55E";
const GREEN_DARK = "#15803D";
const BLUE = "#2563EB";

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
// Farqlar: narx supermarket uslubida (katta + ko'tarilgan mayda qism), eski narx va
// chegirma % YO'Q, ko'k doira "Barakali xarid", pastda ijtimoiy tarmoq CTA + handle.

// DIQQAT: o'ng panelga ANIQ kenglik (rightPct) shart — flexGrow bo'lsa uzun CTA matni
// panelni kontent eniga cho'zib, hammasini kanvasdan chiqarib yuboradi (Yoga min-width).
type HSizes = {
  W: number; H: number; leftPct: string; rightPct: string; pad: number; radius: number;
  titleSize: number; ruSize: number; priceMain: number; priceSup: number; priceSom: number;
  dateSize: number; badgeSize: number; circleSize: number; circleText: number;
  circleTop: number; circleRight: number; imgW: number; imgH: number;
  ctaSize: number; ctaW: number; handleSize: number; limitSize: number;
  showLimit: boolean; // limit qatori faqat A4 (chop) formatida ko'rsatiladi
};

const H_A4: HSizes = {
  W: 1414, H: 1000, leftPct: "44%", rightPct: "56%", pad: 60, radius: 90,
  titleSize: 60, ruSize: 32, priceMain: 150, priceSup: 70, priceSom: 48, dateSize: 34,
  badgeSize: 30, circleSize: 165, circleText: 32, circleTop: 200, circleRight: 110,
  imgW: 560, imgH: 540, ctaSize: 26, ctaW: 600, handleSize: 24, limitSize: 26, showLimit: true,
};
const H_INSTA: HSizes = {
  W: 1080, H: 1350, leftPct: "46%", rightPct: "54%", pad: 52, radius: 80,
  titleSize: 50, ruSize: 26, priceMain: 185, priceSup: 84, priceSom: 58, dateSize: 30,
  badgeSize: 28, circleSize: 160, circleText: 30, circleTop: 380, circleRight: 100,
  imgW: 460, imgH: 600, ctaSize: 27, ctaW: 470, handleSize: 25, limitSize: 24, showLimit: false,
};

const CTA_TEXT =
  "Hafta aksiyalaridan har doim xabardor bo’lish uchun bizning ijtimoiy tarmoqlarimizdagi sahifalarga obuna bo’ling!";

function HaftaBanner({ data, S, logoData }: { data: DesignData; S: HSizes; logoData: string }) {
  const img = data.imageData ?? logoData;
  const placeholder = !data.imageData;
  const price = splitPrice(data.promoPrice);

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

        {/* narx — supermarket uslubi, pastga surilgan (maket bo'yicha) */}
        <div style={{ display: "flex", flexGrow: 1, alignItems: "flex-end" }}>
          <div style={{ display: "flex", alignItems: "flex-start", color: "#ffffff" }}>
            <div style={{ display: "flex", fontSize: S.priceMain, fontWeight: 700, fontFamily: "Golos", lineHeight: 0.8 }}>
              {price.main}
            </div>
            {price.sup ? (
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 10 }}>
                <div style={{ display: "flex", fontSize: S.priceSup, fontWeight: 700, fontFamily: "Golos", lineHeight: 0.9 }}>
                  {price.sup}
                </div>
                <div style={{ display: "flex", fontSize: S.priceSom, fontWeight: 700, lineHeight: 1, marginTop: -4 }}>
                  so&apos;m
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", fontSize: S.priceSom, fontWeight: 700, marginLeft: 12, alignSelf: "flex-end" }}>
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
              {`Barchaga birdek yetishi uchun limit: ${fmtLimit(data.limitN)}ta`}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} width={S.imgW} height={S.imgH} style={{ objectFit: "contain", opacity: placeholder ? 0.2 : 1 }} alt="" />
        </div>

        {/* "Barakali xarid" doirasi (absolute, rasm ustida) */}
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            position: "absolute", top: S.circleTop, right: S.circleRight,
            width: S.circleSize, height: S.circleSize, borderRadius: 9999, backgroundColor: BLUE,
          }}
        >
          <div style={{ display: "flex", fontSize: S.circleText, fontWeight: 700, color: "#ffffff", lineHeight: 1.15 }}>Barakali</div>
          <div style={{ display: "flex", fontSize: S.circleText, fontWeight: 700, color: "#ffffff", lineHeight: 1.15 }}>xarid</div>
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

export function DesignBanner({ data, format, logoData }: { data: DesignData; format: Format; logoData: string }) {
  if (data.variant === "hafta") {
    return <HaftaBanner data={data} S={format === "a4" ? H_A4 : H_INSTA} logoData={logoData} />;
  }
  const S = format === "a4" ? A4 : INSTA;
  const img = data.imageData ?? logoData;
  const placeholder = !data.imageData;

  return (
    <div style={{ display: "flex", width: S.W, height: S.H, fontFamily: "VelaSans", backgroundColor: "#ffffff" }}>
      {/* ── CHAP: yashil panel ── */}
      <div
        style={{
          display: "flex", flexDirection: "column", justifyContent: "space-between",
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

        {/* narxlar */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: S.oldSize, color: "#dcfce7" }}>
            <span style={{ fontFamily: "Golos", textDecoration: "line-through" }}>{money(data.regularPrice)}</span>
            <span style={{ marginLeft: 12, textDecoration: "line-through" }}>so&apos;m</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
            <div style={{ display: "flex", fontSize: S.newSize, fontWeight: 700, color: "#ffffff", lineHeight: 0.95, fontFamily: "Golos" }}>
              {money(data.promoPrice)}
            </div>
            <div style={{ display: "flex", fontSize: Math.round(S.newSize * 0.42), fontWeight: 700, color: "#ffffff", lineHeight: 1 }}>
              so&apos;m
            </div>
          </div>
        </div>

        {/* sana */}
        <div style={{ display: "flex", fontSize: S.dateSize, color: "#ffffff", fontWeight: 700 }}>{data.dateText}</div>
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} width={S.imgW} height={S.imgH} style={{ objectFit: "contain", opacity: placeholder ? 0.2 : 1 }} alt="" />
        </div>

        {/* chegirma doirasi (absolute, o'ng-yuqori) */}
        {data.discountPct > 0 && (
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              position: "absolute", top: S.circleTop, right: S.circleRight,
              width: S.circleSize, height: S.circleSize, borderRadius: 9999, backgroundColor: BLUE,
            }}
          >
            <div style={{ display: "flex", fontSize: S.circlePct, fontWeight: 700, color: "#ffffff", lineHeight: 1, fontFamily: "Golos" }}>
              -{data.discountPct}%
            </div>
            <div style={{ display: "flex", fontSize: Math.round(S.circlePct * 0.34), fontWeight: 700, color: "#ffffff", marginTop: 4 }}>
              TEJANG
            </div>
          </div>
        )}

        {/* limit + brand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {data.limitN != null && (
            <div style={{ display: "flex", fontSize: S.limitSize, color: GREEN_DARK, fontWeight: 700 }}>
              <span style={{ marginRight: 7 }}>Barchaga birdek yetishi uchun limit:</span>
              <span style={{ fontFamily: "Golos" }}>{fmtLimit(data.limitN)}</span>
              <span>ta</span>
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
