/**
 * "Hafta chegirmasi" KATALOG banneri — butun aksiya bitta rasmda (dizayner maketi).
 * Format: A3 portret 150dpi (1754×2480). Sarlavha + moslashuvchan setka + futer.
 *
 * Satori cheklovlari (template.tsx bilan bir xil): FAQAT flexbox — CSS grid YO'Q,
 * shuning uchun setka tashqi column + har qator alohida row div; har ko'p-bolali
 * <div> ga display:"flex" SHART; Fragment ishlatilmaydi; ranglar inline hex.
 */
import type { DesignData } from "./data";
import { ProductImage, money, splitPrice, golosWidth, GREEN, RED_STRIKE } from "./template";

// A3 portret 150dpi — maket nisbati (1:1.414) bilan bir xil.
const W = 1754;
const H = 2480;

// Maketdagi to'q-sariq: sarlavha paneli, chegirma badge'i va aksiya narxi — bittasi.
// Brend ORANGE (#FC3A05) dan ochiqroq/sariqroq: dizayner maketidan olingan.
const ORANGE = "#FF7A00";
const NAME_COLOR = "#16A34A"; // kartochkadagi mahsulot nomi (yashil)
const OLD_COLOR = "#8A8F98"; // eski narx (ustidan qizil chiziq tortiladi)

const PAD = 44; // sahifa yon chekkasi
const GAP = 22; // kartochkalar orasi
const HEAD_H = 560;
const FOOT_H = 150;

const LOGO_RATIO = 3563 / 1165; // public/logo.png nisbati (template.tsx bilan bir xil)

/**
 * Ustunlar soni — sahifa PORTRET bo'lgani uchun ustundan ko'ra qator ko'paygani ma'qul
 * (kartochka kvadratga yaqin qoladi). 9 ta → 3×3, ya'ni maketdagidek.
 */
function colsFor(n: number): number {
  if (n <= 2) return Math.max(1, n);
  if (n <= 4) return 2;
  if (n <= 12) return 3;
  if (n <= 20) return 4;
  return 5;
}

/** Elementlarni qatorlarga bo'lish (Satori'da grid yo'q — qo'lda). */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Bitta mahsulot kartochkasi: yashil ramka ichida oq karta. */
function Card({ d, w, h }: { d: DesignData; w: number; h: number }) {
  // Shrift o'lchovi KICHIK o'lchamdan (min(w,h)) — balandlikdan hisoblansa, kartochka
  // cho'ziq bo'lganda (masalan 5 ta mahsulot) narx kartochka ENIGA sig'may, nom bilan
  // bir-biriga kirib ketardi. min() ikkala yo'nalishda ham sig'ishini kafolatlaydi.
  const base = Math.min(w, h);
  const nameSize = Math.round(base * 0.048);
  const oldSize = Math.round(base * 0.055);
  const badgeW = Math.round(w * 0.28);
  const badgeH = Math.round(base * 0.135);
  const inset = Math.max(6, Math.round(base * 0.017));
  const pad = Math.round(base * 0.05);
  const price = splitPrice(d.promoPrice);
  const showOld = !d.nPlusM && d.regularPrice > d.promoPrice;

  // Narx nom ustiga chiqmasin: 6 xonali narx ("249 990") qat'iy o'lchamda nomga
  // yopishib qolardi. Nomga ajratilgan endan qolganiga sig'adigan shrift tanlanadi.
  const contentW = w - inset * 2 - pad * 2;
  const nameW = Math.round(contentW * 0.44);
  const colGap = Math.round(base * 0.03);
  const priceText = price.main + (price.sup ? ` ${price.sup}` : "");
  const newSize = Math.min(
    Math.round(base * 0.125),
    Math.floor((contentW - nameW - colGap) / golosWidth(priceText, 1))
  );

  return (
    <div
      style={{
        display: "flex", width: w, height: h, backgroundColor: GREEN,
        borderRadius: Math.round(base * 0.055), padding: inset,
      }}
    >
      {/* oq karta */}
      <div
        style={{
          display: "flex", flexDirection: "column", position: "relative",
          width: "100%", height: "100%", backgroundColor: "#ffffff",
          borderRadius: Math.round(base * 0.042), padding: pad,
        }}
      >
        {/* mahsulot rasmi — markazda, qolgan bo'sh joyni egallaydi */}
        <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <ProductImage
            src={d.imageData ?? ""}
            w={Math.round(w * 0.62)}
            h={Math.round(h * 0.5)}
            zoom={d.imageZoom}
            placeholder={false}
          />
        </div>

        {/* pastki qator: chapda nom, o'ngda narxlar */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex", width: nameW, marginRight: colGap, fontSize: nameSize,
              color: NAME_COLOR, fontWeight: 700, lineHeight: 1.25,
            }}
          >
            {d.titleUz}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            {showOld && (
              /* eski narx + qizil qiyshiq ustma chiziq (maketdagidek) */
              <div style={{ display: "flex", position: "relative", marginBottom: Math.round(h * 0.012) }}>
                <div style={{ display: "flex", fontSize: oldSize, fontFamily: "Golos", color: OLD_COLOR }}>
                  {money(d.regularPrice)}
                </div>
                {/* Chiziq markazi top:45% da to'g'ri turadi, lekin burchak KATTA bo'lsa qisqa
                    raqamda uchlari raqamdan chiqib ketadi (6° da chap uchi tepada qolgan edi) —
                    3° yetarli: strikethrough sifatida o'qiladi va barcha raqamni kesib o'tadi. */}
                <div
                  style={{
                    position: "absolute", left: "-6%", right: "-6%", top: "45%",
                    height: Math.max(2, Math.round(oldSize * 0.1)),
                    backgroundColor: RED_STRIKE, transform: "rotate(3deg)",
                  }}
                />
              </div>
            )}
            {/* aksiya narxi — maketda faqat son ("6 490"), "so'm" yozilmaydi */}
            <div style={{ display: "flex", alignItems: "flex-start", color: ORANGE }}>
              <div style={{ display: "flex", fontSize: newSize, fontWeight: 700, fontFamily: "Golos", lineHeight: 0.85 }}>
                {price.main}
              </div>
              {price.sup && (
                <div style={{ display: "flex", fontSize: newSize, fontWeight: 700, fontFamily: "Golos", lineHeight: 0.85, marginLeft: Math.round(newSize * 0.16) }}>
                  {price.sup}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* chegirma badge — o'ng yuqori burchakda (barg motivi: 2 burchagi katta egri) */}
        {d.discountPct > 0 && (
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              position: "absolute", top: pad * 0.5, right: pad * 0.5,
              width: badgeW, height: badgeH, backgroundColor: ORANGE,
              borderTopLeftRadius: Math.round(badgeH * 0.5), borderBottomRightRadius: Math.round(badgeH * 0.5),
              borderTopRightRadius: Math.round(badgeH * 0.16), borderBottomLeftRadius: Math.round(badgeH * 0.16),
            }}
          >
            <div style={{ display: "flex", fontSize: Math.round(badgeH * 0.42), fontWeight: 700, color: "#ffffff", fontFamily: "Golos", lineHeight: 1 }}>
              {d.nPlusM ? `${d.nPlusM.buy}+${d.nPlusM.free}` : `-${d.discountPct}%`}
            </div>
            <div style={{ display: "flex", fontSize: Math.round(badgeH * 0.2), fontWeight: 700, color: "#ffffff", marginTop: Math.round(badgeH * 0.05) }}>
              Tejamkorlik
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Sarlavha paneli — yashil blok + o'ngida to'q-sariq chegirma bloki. Fontlar
 * ENDAN miqyoslanadi: to'liq enda (w=W) joriy maket bilan AYNAN bir xil chiqadi
 * (ratio'lar shunday tanlangan); 10-mahsulot maketida esa 2 ustun eniga siqiladi.
 */
function HeaderPanel({ w, h, title, dateText, maxDiscount, titleRatio = 0.0855 }: {
  w: number; h: number; title: string; dateText: string; maxDiscount: number;
  // Sarlavha shrifti endan miqyoslanadi. To'liq enli banner default (0.0855) da
  // joriy maket bilan aynan bir xil; hero maketda (tor en) kattaroq nisbat beriladi.
  titleRatio?: number;
}) {
  return (
    <div style={{ display: "flex", position: "relative", width: w, height: h, backgroundColor: GREEN }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "68%", height: "100%", padding: PAD + 16 }}>
        <div style={{ display: "flex", fontSize: Math.round(w * titleRatio), fontWeight: 700, color: "#ffffff", lineHeight: 1.02 }}>{title}</div>
        <div style={{ display: "flex", fontSize: Math.round(w * 0.0239), fontWeight: 700, color: "#ffffff" }}>{dateText}</div>
      </div>

      {maxDiscount > 0 && (
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center",
            position: "absolute", top: 0, right: 0, width: "33%", height: "100%",
            backgroundColor: ORANGE, padding: PAD,
            borderTopLeftRadius: 44, borderBottomLeftRadius: 130, borderBottomRightRadius: 44,
          }}
        >
          <div style={{ display: "flex", fontSize: Math.round(w * 0.0844), fontWeight: 700, color: "#ffffff", fontFamily: "Golos", lineHeight: 1 }}>
            -{maxDiscount}%
          </div>
          <div style={{ display: "flex", fontSize: Math.round(w * 0.0262), fontWeight: 700, color: "#ffffff", marginTop: 4 }}>gacha</div>
          <div style={{ display: "flex", fontSize: Math.round(w * 0.0433), fontWeight: 700, color: "#ffffff", marginTop: 10 }}>tejamkorlik</div>
        </div>
      )}
    </div>
  );
}

/**
 * 10-mahsulot maketi (dizayner referensi): sarlavha SETKA ichida — yuqori qatorda
 * 2 ustunni egallaydi (chap yuqori burchakka to'liq yopishadi), 3-ustunda 1-mahsulot
 * ("hero" kartochka), keyin pastda 3×3 = 9 mahsulot. Odatiy 3+3+3+1 (oxirgi qator
 * bo'sh-yalang) o'rniga muvozanatli chiqadi.
 */
function HeroLayout({
  items, title, dateText, maxDiscount, logoData,
}: {
  items: DesignData[]; title: string; dateText: string; maxDiscount: number; logoData: string;
}) {
  const cols = 3;
  const gridW = W - PAD * 2;
  const cardW = Math.floor((gridW - GAP * (cols - 1)) / cols);
  const headerW = PAD + cardW * 2 + GAP; // chap chekkadan 2 ustun oxirigacha (full-bleed)
  // 4 qatorning HAMMASI bir xil balandlikda: 1-qator = sarlavha + hero, 2–4 = 3×3.
  // Hero'ni sarlavha balandligiga (640) cho'zsak, mahsulot rasmi kichik bo'lganda
  // karta bo'm-bo'sh/cho'ziq ko'rinardi — endi u pastdagi kartalar bilan bir xil.
  const rowH = Math.floor((H - FOOT_H - GAP * 3) / 4);
  const cardH = rowH;

  const hero = items[0];
  const rows = chunk(items.slice(1), cols); // qolgan 9 ta → 3×3

  return (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, fontFamily: "VelaSans", backgroundColor: "#ffffff" }}>
      {/* ── YUQORI QATOR: sarlavha (2 ustun) + hero kartochka (3-ustun) ── */}
      <div style={{ display: "flex", width: W, height: rowH }}>
        <HeaderPanel w={headerW} h={rowH} title={title} dateText={dateText} maxDiscount={maxDiscount} titleRatio={0.108} />
        <div style={{ display: "flex", marginLeft: GAP }}>
          <Card d={hero} w={cardW} h={rowH} />
        </div>
      </div>

      {/* ── PASTKI 3×3 SETKA ── */}
      <div style={{ display: "flex", flexDirection: "column", width: W, paddingLeft: PAD, paddingRight: PAD, marginTop: GAP }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: "flex", marginBottom: ri === rows.length - 1 ? 0 : GAP }}>
            {row.map((d, ci) => (
              <div key={d.kind + d.id} style={{ display: "flex", marginRight: ci === row.length - 1 ? 0 : GAP }}>
                <Card d={d} w={cardW} h={cardH} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── FUTER ── */}
      <Footer logoData={logoData} />
    </div>
  );
}

export function CatalogBanner({
  items, title, dateText, maxDiscount, logoData,
}: {
  items: DesignData[];
  title: string; // "Hafta chegirmasi"
  dateText: string; // "9-iyuldan 15-iyulgacha"
  maxDiscount: number; // eng katta chegirma foizi — sarlavhadagi "-45% gacha"
  logoData: string;
}) {
  // Roppa-rosa 10 ta mahsulot — dizayner maketiga mos hero setka (sarlavha ichida).
  if (items.length === 10) {
    return <HeroLayout items={items} title={title} dateText={dateText} maxDiscount={maxDiscount} logoData={logoData} />;
  }

  const cols = colsFor(items.length);
  const rows = chunk(items, cols);
  const gridW = W - PAD * 2;
  const cardW = Math.floor((gridW - GAP * (cols - 1)) / cols);
  const gridH = H - HEAD_H - FOOT_H - GAP;
  // Kartochka kvadratga yaqin qolsin: qator kam bo'lganda (5 ta → 2 qator) bo'sh joyni
  // teng bo'lib cho'zilsa, mahsulot rasmi kichkina qolib, karta bo'm-bo'sh ko'rinardi.
  // Ortgan balandlik setkani vertikal markazlashga ketadi.
  const fitH = Math.floor((gridH - GAP * (rows.length - 1)) / rows.length);
  const cardH = Math.min(fitH, Math.round(cardW * 1.15));

  return (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, fontFamily: "VelaSans", backgroundColor: "#ffffff" }}>
      {/* ── SARLAVHA: yashil panel, o'ngida to'q-sariq chegirma bloki ── */}
      <HeaderPanel w={W} h={HEAD_H} title={title} dateText={dateText} maxDiscount={maxDiscount} />

      {/* ── SETKA ── */}
      <div
        style={{
          display: "flex", flexDirection: "column", justifyContent: "center",
          width: W, height: gridH, paddingLeft: PAD, paddingRight: PAD, marginTop: GAP,
        }}
      >
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: "flex", marginBottom: ri === rows.length - 1 ? 0 : GAP }}>
            {row.map((d, ci) => (
              <div key={d.kind + d.id} style={{ display: "flex", marginRight: ci === row.length - 1 ? 0 : GAP }}>
                <Card d={d} w={cardW} h={cardH} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── FUTER: logo + ijtimoiy tarmoqlar ── */}
      <Footer logoData={logoData} />
    </div>
  );
}

/** Futer — logo (chapda) + ijtimoiy tarmoqlar (o'ngda). Ikkala maketda bir xil. */
function Footer({ logoData }: { logoData: string }) {
  return (
    <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "space-between", paddingLeft: PAD + 16, paddingRight: PAD + 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoData} width={Math.round(88 * LOGO_RATIO)} height={88} alt="" />
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* Instagram (template.tsx dagi bilan bir xil kontur) */}
        <svg width={52} height={52} viewBox="0 0 24 24" fill="none">
          <rect x="2" y="2" width="20" height="20" rx="5.5" stroke={GREEN} strokeWidth="1.8" />
          <circle cx="12" cy="12" r="4.6" stroke={GREEN} strokeWidth="1.8" />
          <circle cx="17.3" cy="6.7" r="1.4" fill={GREEN} />
        </svg>
        {/* Telegram */}
        <svg width={52} height={52} viewBox="0 0 24 24" fill="none" style={{ marginLeft: 14 }}>
          <path
            d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"
            fill={GREEN}
          />
        </svg>
        <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color: GREEN, marginLeft: 16 }}>bizbop_supermarket</div>
      </div>
    </div>
  );
}
