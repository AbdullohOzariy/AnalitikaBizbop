/**
 * TALAB PROGNOZI — foydalanuvchi qo'llanmasi (PDF).
 *
 *   npx tsx scripts/prognoz-qollanma-pdf.ts [chiqish/yo'li.pdf]
 *
 * DB'ga tegmaydi. Matndagi RAQAMLAR jonli o'lchovdan olingan va qo'lda yozilgan —
 * model o'zgarganda shu faylni ham yangilash kerak (`scripts/prognoz-sifat.ts`
 * chiqishi bilan solishtiring).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

const FONT = path.join(process.cwd(), "public/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "public/fonts/DejaVuSans-Bold.ttf");
const LOGO = path.join(process.cwd(), "public/logo.png");

const YASHIL = "#15803D";
const SARIQ = "#B45309";
const QIZIL = "#B91C1C";
const KULRANG = "#6B7280";
const QORA = "#111827";
const CHIZIQ = "#E5E7EB";

const M = 46; // chekka
const KENG = 595.28 - M * 2; // A4 eni − chekkalar

function main() {
  const chiqish = process.argv[2] || path.join(process.env.HOME || ".", "Desktop", "Prognoz-qollanma.pdf");
  const doc = new PDFDocument({ size: "A4", margin: M, font: FONT, bufferPages: true });
  doc.registerFont("bold", FONT_BOLD);
  doc.registerFont("reg", FONT);
  const oqim = fs.createWriteStream(chiqish);
  doc.pipe(oqim);

  // ── Yordamchilar ────────────────────────────────────────────────────────────
  const joy = (h: number) => {
    if (doc.y + h > doc.page.height - M - 24) doc.addPage();
  };
  const sarlavha2 = (matn: string) => {
    joy(46);
    doc.moveDown(0.8);
    doc.font("bold").fontSize(13).fillColor(QORA).text(matn);
    doc.moveDown(0.35);
  };
  const matn = (t: string, opts: { rang?: string; olcham?: number; bold?: boolean } = {}) => {
    joy(30);
    doc
      .font(opts.bold ? "bold" : "reg")
      .fontSize(opts.olcham ?? 10)
      .fillColor(opts.rang ?? QORA)
      .text(t, { width: KENG, align: "left", lineGap: 2.5 });
    doc.moveDown(0.35);
  };
  const nuqta = (t: string, rang = QORA) => {
    joy(24);
    const x = doc.x;
    doc.font("reg").fontSize(10).fillColor(KULRANG).text("•", x, doc.y, { continued: false, width: 12 });
    doc.moveUp();
    doc.fillColor(rang).text(t, x + 14, doc.y, { width: KENG - 14, lineGap: 2.5 });
    doc.x = x;
    doc.moveDown(0.25);
  };
  /** Oddiy jadval: sarlavha + qatorlar. Ustun kengliklari ulush sifatida. */
  const jadval = (bosh: string[], qatorlar: string[][], ulush: number[], ranglar?: (string | null)[][]) => {
    const w = ulush.map((u) => KENG * u);
    const qatorBalandligi = (r: string[]) =>
      Math.max(
        ...r.map((c, i) => doc.font("reg").fontSize(9).heightOfString(c, { width: w[i] - 8 }))
      ) + 8;

    joy(qatorBalandligi(bosh) + 30);
    let y = doc.y;
    // Sarlavha
    const hb = qatorBalandligi(bosh);
    doc.rect(M, y, KENG, hb).fill("#F9FAFB");
    bosh.forEach((c, i) => {
      const x = M + w.slice(0, i).reduce((a, b) => a + b, 0);
      doc.font("bold").fontSize(9).fillColor(KULRANG).text(c, x + 4, y + 4, { width: w[i] - 8 });
    });
    y += hb;

    for (const r of qatorlar) {
      const h = qatorBalandligi(r);
      if (y + h > doc.page.height - M - 24) {
        doc.addPage();
        y = doc.y;
      }
      r.forEach((c, i) => {
        const x = M + w.slice(0, i).reduce((a, b) => a + b, 0);
        doc
          .font(i === 0 ? "bold" : "reg")
          .fontSize(9)
          .fillColor(ranglar?.[qatorlar.indexOf(r)]?.[i] ?? QORA)
          .text(c, x + 4, y + 4, { width: w[i] - 8 });
      });
      y += h;
      doc.moveTo(M, y).lineTo(M + KENG, y).lineWidth(0.5).strokeColor(CHIZIQ).stroke();
    }
    doc.y = y + 8;
    doc.x = M;
  };

  // ── Muqova sarlavhasi ───────────────────────────────────────────────────────
  if (fs.existsSync(LOGO)) {
    try {
      doc.image(LOGO, M, M - 6, { height: 26 });
    } catch {
      /* logo o'qilmasa — sarlavhasiz davom etadi */
    }
  }
  doc.y = M + 34;
  doc.font("bold").fontSize(21).fillColor(QORA).text("Talab prognozi");
  doc.font("reg").fontSize(10.5).fillColor(KULRANG).text("Qisqacha qo'llanma — nima qiladi, qanday o'qiladi, qachon ishonish mumkin");
  doc.moveDown(0.2);
  doc.moveTo(M, doc.y + 4).lineTo(M + KENG, doc.y + 4).lineWidth(1).strokeColor(CHIZIQ).stroke();
  doc.moveDown(0.8);

  // ── 1. Nima qiladi ──────────────────────────────────────────────────────────
  sarlavha2("Nima qiladi");
  matn(
    "Har bir SKU × filial uchun keyingi 4 haftada jami qancha sotilishini aytadi. " +
      "Har hafta seshanba kuni o'zi qayta hisoblanadi."
  );
  jadval(
    ["Raqam", "Ma'nosi", "Nima uchun ishlatiladi"],
    [
      ["Prognoz (p50)", "4 haftada kutilgan sotuv", "Reja, byudjet"],
      ["Zaxira tavsiyasi (q90)", "Shuncha zaxira bo'lsa, talab 90% holatda qoplanadi", "Zakaz miqdori"],
    ],
    [0.26, 0.44, 0.3]
  );
  matn(
    "Zaxira tavsiyasi har doim prognozdan katta — bu ehtiyot zaxirasi. Talab har hafta tebranadi; " +
      "o'rtachaga qarab zakaz berilsa, vaqtning yarmida tovar yetmay qoladi."
  );

  // ── 2. Qanday hisoblaydi ────────────────────────────────────────────────────
  sarlavha2("Qanday hisoblaydi");
  matn("Formula ataylab sodda: yarmi o'tgan hafta + yarmi oxirgi 4 hafta o'rtachasi.", { bold: true });
  matn(
    "Murakkabroq usullar (Croston, ETS, top-down) sinab ko'rildi va yomonroq natija berdi. " +
      "Tekshiruv oddiy: model \"o'tgan haftani takrorlash\" degan eng sodda usuldan yaxshiroqmi? " +
      "Hozir model undan 6.7% aniqroq — kam ko'rinadi, lekin bu haqiqiy, o'lchangan farq."
  );
  matn(
    "Nega haftalik emas, 4 haftalik: haftalik raqamda model o'sha soddadan umuman ustun emas, " +
      "4 haftalik jamida esa ustun. Shu sabab tizim faqat 4 haftani ko'rsatadi. 12 haftalik prognoz " +
      "ham qilinmaydi — uni tekshirishga tarix yetmaydi.",
    { rang: KULRANG }
  );

  // ── 3. Sinflar ──────────────────────────────────────────────────────────────
  sarlavha2("Sinflar — nega ekran har xil");
  jadval(
    ["Sinf", "Ma'nosi", "Ekranda"],
    [
      ["Barqaror", "Har hafta sotiladi, miqdor tekis", "Grafik bor"],
      ["Notekis", "Har hafta sotiladi, miqdor sakraydi", "Grafik bor"],
      ["Siyrak", "Ba'zi haftalarda sotuv umuman yo'q", "Grafik yo'q"],
      ["Siyrak + notekis", "Siyrak va miqdor sakraydi", "Grafik yo'q"],
      ["Tarix kam", "Model qurish uchun ma'lumot yetarli emas", "Prognoz berilmaydi"],
    ],
    [0.24, 0.5, 0.26]
  );
  matn(
    "Siyrak tovarlarda haftalik grafik nol bilan cho'qqilar orasida sakraydi va \"sotuv tushdi\" degan " +
      "yolg'on taassurot beradi. Shuning uchun u yerda faqat 4 haftalik jami ko'rsatiladi.",
    { rang: KULRANG }
  );

  // ── 4. Ishonch belgisi ──────────────────────────────────────────────────────
  sarlavha2("Ishonch belgisi — eng muhim ustun");
  matn("Har SKU o'z prognozi fakt bilan solishtirilib baholanadi:");
  nuqta("Ishonchli — xato 30% dan kam. Prognozga tayanish mumkin.", YASHIL);
  nuqta("Taxminiy — xato 30–60%. Yo'nalish sifatida ishlatiladi.", SARIQ);
  nuqta("Ishonchsiz — xato 60% dan yuqori. Qarorni o'zingiz qabul qiling.", QIZIL);
  doc.moveDown(0.2);
  matn(
    "Hozirgi taqsimot: 11% ishonchli / 24% taxminiy / 65% ishonchsiz. Ya'ni SKU'larning uchdan ikkisida " +
      "prognoz faqat mo'ljal. Bu raqam ataylab yashirilmaydi — yashirilsa, ishonchsiz raqamga tayanib " +
      "zakaz berilardi."
  );
  matn(
    "Aniqlik ABC bo'yicha keskin farq qiladi: A tovarlarda 63%, B da 27%, C da esa manfiy. " +
      "Qisqasi — prognoz A tovarlarida ishlaydi, C da deyarli ishlamaydi (ular juda siyrak sotiladi).",
    { bold: true }
  );

  // ── 5. O'zini o'zi to'g'rilaydi ─────────────────────────────────────────────
  sarlavha2("O'zini o'zi to'g'rilaydi");
  matn("Model xatolarini eslab boradi va ikki narsani avtomatik sozlaydi:");
  nuqta("Tizimli xato — agar model doim ko'p aytayotgan bo'lsa, keyingi prognozlar pasaytiriladi.");
  nuqta(
    "Zaxira buferi — ABC sinfi va tovar hajmiga qarab alohida sozlanadi: ko'p sotiladigan tovarga " +
      "kattaroq bufer kerak."
  );
  doc.moveDown(0.2);
  matn("Bularning hech biri qo'lda kiritilmaydi — hammasi o'tgan haftalardagi haqiqiy xatolardan o'rganiladi.", {
    rang: KULRANG,
  });

  // ── 6. Nima qilmaydi ────────────────────────────────────────────────────────
  sarlavha2("Nima QILMAYDI");
  nuqta("Mavsumiylikni bilmaydi — tarix 29 hafta. Bir yil to'lmaguncha \"o'tgan yil shu paytda\" taqqoslash imkonsiz.");
  nuqta("Aksiyani hisobga olmaydi — flash-aksiya bo'lsa prognoz past qoladi.");
  nuqta("Yangi tovarga prognoz bermaydi — kamida 4 hafta sotuv tarixi kerak.");
  nuqta("Zakazga hali ulanmagan — raqamlar bor, lekin zakaz formasi ularni o'qimaydi (keyingi bosqich).");

  // ── 7. Amalda ishlatish ─────────────────────────────────────────────────────
  sarlavha2("Amalda qanday ishlatish");
  const qadamlar = [
    "Bo'lim: Analitika → Talab prognozi. Filialni tanlang.",
    "Ro'yxat so'mli qiymati bo'yicha tartiblangan — yuqoridagilar eng muhimi.",
    "Ishonchli va taxminiy SKU'larda zaxira tavsiyasini zakaz uchun asos qiling.",
    "Ishonchsizlarda o'z tajribangizga tayaning — model bu yerda yordamchi emas.",
    "\"Prognoz sifati\" sahifasi model qayerda ishlayotganini va qayerda yo'qligini ko'rsatadi.",
  ];
  qadamlar.forEach((q, i) => {
    joy(24);
    const x = doc.x;
    doc.font("bold").fontSize(10).fillColor(KULRANG).text(`${i + 1}.`, x, doc.y, { width: 16 });
    doc.moveUp();
    doc.font("reg").fillColor(QORA).text(q, x + 18, doc.y, { width: KENG - 18, lineGap: 2.5 });
    doc.x = x;
    doc.moveDown(0.25);
  });

  doc.moveDown(0.5);
  joy(70);
  const y0 = doc.y;
  doc.rect(M, y0, KENG, 52).fill("#FEF3C7");
  doc.font("bold").fontSize(10).fillColor("#92400E").text("Muhim eslatma", M + 12, y0 + 9, { width: KENG - 24 });
  doc
    .font("reg")
    .fontSize(9.5)
    .fillColor("#92400E")
    .text(
      "Zaxira tavsiyasi — bu \"shuncha zakaz bering\" degani EMAS. U kerakli zaxira darajasi. " +
        "Zakaz = zaxira tavsiyasi − hozirgi qoldiq − yo'ldagi tovar.",
      M + 12,
      y0 + 24,
      { width: KENG - 24, lineGap: 2 }
    );
  doc.y = y0 + 60;

  // ── Sahifa raqamlari ────────────────────────────────────────────────────────
  // DIQQAT: pastki chekkadan TASHQARIGA yozilgan matn pdfkit'da avtomatik YANGI
  // SAHIFA ochadi — natijada oxirida bo'sh sahifa paydo bo'ladi. Shuning uchun
  // raqam yozishdan oldin pastki chekka vaqtincha nolga tushiriladi.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const eski = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font("reg")
      .fontSize(8)
      .fillColor(KULRANG)
      .text(`${i + 1} / ${range.count}`, M, doc.page.height - 28, { width: KENG, align: "right" });
    doc.page.margins.bottom = eski;
  }

  doc.end();
  oqim.on("finish", () => console.log(`✅ Tayyor: ${chiqish}`));
}

main();
