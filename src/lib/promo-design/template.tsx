/**
 * Aksiya dizayn banneri (next/og Satori JSX) — A4 (landscape) va Instagram (portrait).
 * Satori cheklovi: FAQAT flexbox; har ko'p-bolali <div> ga display:"flex" SHART;
 * flexDirection default "row"; ranglar inline hex. Shrift "DejaVu" (route fonts'da yuklanadi).
 */
import type { DesignData } from "./data";

const NF = new Intl.NumberFormat("uz-UZ");
const money = (n: number) => NF.format(Math.round(n));
const fmtLimit = (n: number) => (n % 1 === 0 ? String(n) : n.toLocaleString("uz-UZ", { maximumFractionDigits: 3 }));

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

export function DesignBanner({ data, format, logoData }: { data: DesignData; format: Format; logoData: string }) {
  const S = format === "a4" ? A4 : INSTA;
  const img = data.imageData ?? logoData;
  const placeholder = !data.imageData;

  return (
    <div style={{ display: "flex", width: S.W, height: S.H, fontFamily: "DejaVu", backgroundColor: "#ffffff" }}>
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
          <div style={{ display: "flex", fontSize: S.oldSize, color: "#dcfce7", textDecoration: "line-through" }}>
            {money(data.regularPrice)} so&apos;m
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
            <div style={{ display: "flex", fontSize: S.newSize, fontWeight: 700, color: "#ffffff", lineHeight: 0.95 }}>
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
            <div style={{ display: "flex", fontSize: S.circlePct, fontWeight: 700, color: "#ffffff", lineHeight: 1 }}>
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
              Barchaga birdek yetishi uchun limit: {fmtLimit(data.limitN)}ta
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
