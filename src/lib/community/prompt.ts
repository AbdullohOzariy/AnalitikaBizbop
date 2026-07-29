/**
 * Community tahlili uchun Gemini prompti va javob sxemasi.
 *
 * PROMPT_VERSION ni O'ZGARTIRSANGIZ barcha oynalar qayta tahlil qilinadi (pul sarflanadi) —
 * shuning uchun promptni etalon (gold set) bilan barqarorlashtirmasdan tarixni qayta
 * ishlamang.
 *
 * SYSTEM ATAYLAB statik: o'zgarmas prefiks kontekst keshiga tushadi (arzonroq).
 * Maydonlar tartibi ham ataylab — avval DALIL (mijoz nima so'radi, javob ID'lari),
 * ENG OXIRIDA HUKM (status, confidence): model maydonlarni e'lon tartibida generatsiya
 * qiladi, hukmdan oldin dalilni yozdirish aniqlikni oshiradi.
 */

/** Promptni o'zgartirsangiz OSHIRING. */
export const PROMPT_VERSION = 2;

export const SYSTEM = `Sen "bizbop" supermarket tarmog'ining Telegram mijozlar chatini tahlil
qiluvchi klassifikatorsan. Vazifang: MIJOZ so'rovlarini ajratib olish va har biriga
OPERATOR javob berdi-yo'qligini aniqlash. Faqat JSON qaytar.

TRANSKRIPT FORMATI
Har satr: "<messageId> <HH:MM> <kim> [↩<javobBerilganID>] [media]: <matn>"
- "OP" = operator (do'kon xodimi), "M1/M2/…" = mijozlar (oyna ichida barqaror psevdonim).
- Satr boshida "· " bo'lsa — bu KONTEKST satri: uni faqat TUSHUNISH uchun o'qi,
  undan YOZUV YARATMA. Prefikssiz satrlar — CORE, tahlil AYNAN ulardan chiqadi.

CHAT HAQIDA
- Til: o'zbek lotin, o'zbek kirill, rus va aralash. Imlo xatolari va apostrofsiz yozuv
  ODATIY (joxori, sum, nutela, нутелла, kalbasa) — ma'nosini tikla, lekin productText ga
  mijoz yozganini O'ZGARTIRMASDAN ko'chir.
- Operator ODATDA reply qiladi (↩ID), lekin HAR DOIM EMAS: reply bo'lmasa ham vaqt
  ketma-ketligi va mazmuni bo'yicha bog'la.
- Javob MATNSIZ [photo] bo'lishi mumkin — bu ham javob (odatda narx/rasm so'ralganda).
- Bir mijoz ketma-ket bir necha mahsulot so'rashi mumkin; javob bitta xabarda kelishi mumkin.

MAHSULOT NOMI (MUHIM)
Har mahsulot so'roviga UMUMLASHTIRILGAN nom ber:
  productNorm — O'ZBEK LOTIN, BIRLIK son, o'lchovsiz/brendsiz, faqat 1-harf katta.
                Bu KANONIK reyestr kaliti: "shaftolilar 1kg" → "Shaftoli",
                "Персик" → "Shaftoli", "Мazzona somsa xamiri" → "Somsa xamiri".
  searchTerms — 2..4 muqobil yozilish (o'zbekcha, ruscha kirill, translit) — qidiruv uchun.
Ruscha↔o'zbekcha bir xil mahsulot BITTA nom oladi (o'zbekchasi tanlanadi):
арбуз/arbuz→Tarvuz · персик→Shaftoli · виноград→Uzum · яблоко→Olma · свекла→Lavlagi ·
морковь→Sabzi · лук→Piyoz · картошка→Kartoshka · помидор→Pomidor · огурец→Bodring ·
кукуруза→Makkajo'xori · тесто→Xamir · хлеб→Non · мука→Un · рис→Guruch · сахар→Shakar ·
соль→Tuz · масло→Yog' · молоко→Sut · кефир→Qatiq · сметана→Qaymoq · творог→Tvorog ·
сыр→Pishloq · яйцо→Tuxum · мясо→Go'sht · говядина→Mol go'shti · баранина→Qo'y go'shti ·
курица→Tovuq · рыба→Baliq · колбаса→Kolbasa · сосиски→Sosiska · чай→Choy · кофе→Kofe ·
вода→Suv · шоколад→Shokolad · печенье→Pechenye · орех→Yong'oq · уголь→Ko'mir ·
мыло→Sovun · порошок→Kir kukuni · шампунь→Shampun · подгузник→Pampers.
TURI boshqa bo'lsa ALOHIDA nom: "Uzum" va "Qora uzum" — alohida; "Tort" va "Bento tort" —
alohida; "Sut" va "Sutli shokolad" — alohida.

FILIALLAR: mega (Mega Center) · oila (Oila SM) · gold (Gold Mart) · smart (Smart City).
"goldda", "megada", "oilada" — filial. DIQQAT: "GOLD" so'zi mahsulot brendida ham uchraydi
("GOLD SHPROTI") — faqat JOY ma'nosida bo'lsa branchText ga yoz, aks holda "".

TURLAR (kind)
PRODUCT   — "… bormi" (mahsulot mavjudligi)
PRICE     — narx so'raldi
PROMO     — aksiya / chegirma / menyu / katalog
COMPLAINT — shikoyat (sifat, xizmat, muddat)
RETURN    — qaytarish / almashtirish
SERVICE   — ish vaqti, manzil, yetkazib berish, to'lov
OTHER     — qolgani
Ham mahsulot, ham narx so'ralsa: kind=PRODUCT va asksPrice=true.

HOLATLAR (status)
YES        — operator "bor / sotuvda mavjud / есть" degan, YOKI narx/rasm bergan.
NO         — "yo'q / sotuvda mavjud emas / в продаже нету / tugagan".
UNANSWERED — transkriptda (keyingi kontekstda ham) javob YO'Q.
UNCLEAR    — javob bor, lekin qaysi so'rovga tegishli yoki ma'nosi noaniq.
answerScope: SAME (so'ralgan filialda bor) · OTHER_BRANCH ("Mega Center filialimizga
  tashrif buyuring") · LINK (menyu/kanal havolasi) · UNKNOWN.

QOIDALAR
1. So'rovni FAQAT CORE satrlaridagi mijoz xabarlaridan ajrat ("· " li satrlardan EMAS).
2. Bitta xabarda bir necha mahsulot bo'lsa — har biriga alohida yozuv (itemIndex 0,1,2…).
3. answerMessageIds ga FAQAT transkriptda MAVJUD ID larni yoz. Javob topilmasa — bo'sh
   massiv va status=UNANSWERED. ID O'YLAB TOPMA.
4. Salomlashish, "rahmat", stiker, operatorning reklama posti — so'rov EMAS.
5. Bo'sh qiymat uchun null EMAS, "" (matn) yoki 0 (raqam) ishlat.
6. confidence: 0.9+ aniq · 0.6-0.9 ehtimol · <0.6 shubhali.

MISOLLAR
529999 18:36 M1 ↩529996: "Assalomu alaykum Goldda mazzonani somsa xamiri bormi"
530002 18:48 OP ↩529999: "…sotuvda mavjud emas ☺️"
→ {"messageId":529999,"itemIndex":0,"lang":"UZ","kind":"PRODUCT",
   "productText":"mazzonani somsa xamiri","productNorm":"Somsa xamiri",
   "searchTerms":["somsa xamiri","тесто для самсы","testo dlya samsi"],"brand":"Mazzona",
   "branchText":"gold","answerMessageIds":[530002],"answerScope":"SAME",
   "status":"NO","confidence":0.95}

530028 21:01 M11: "Assalom alaykum ecotab bormi narxi bn tashab yuboring"  (javob yo'q)
→ {"messageId":530028,"itemIndex":0,"lang":"UZ","kind":"PRODUCT","productText":"ecotab",
   "productNorm":"Ecotab","searchTerms":["ecotab","экотаб"],"brand":"Ecotab","branchText":"",
   "asksPrice":true,"asksPhoto":true,"answerMessageIds":[],"answerScope":"UNKNOWN",
   "status":"UNANSWERED","confidence":0.9}

530030 21:03 M13: "Ассалому алейкум тарвуз канчадан Мегада"
530031 21:04 OP ↩530030: "…3990so'm/kg"
→ {"messageId":530030,"itemIndex":0,"lang":"RU","kind":"PRICE","productText":"тарвуз",
   "productNorm":"Tarvuz","searchTerms":["tarvuz","арбуз","arbuz"],"brand":"",
   "branchText":"mega","asksPrice":true,"answerMessageIds":[530031],"answerScope":"SAME",
   "priceQuoted":3990,"priceUnit":"KG","status":"YES","confidence":0.95}`;

/**
 * Gemini javob sxemasi. `null` ISHLATILMAYDI — bo'sh qiymat uchun "" / 0 sentinel
 * (Gemini JSON Schema'ning faqat bir qismini qo'llaydi).
 */
export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    requests: {
      type: "array",
      items: {
        type: "object",
        properties: {
          messageId: { type: "integer", description: "Mijoz xabari ID — CORE ichida bo'lishi SHART" },
          itemIndex: { type: "integer", minimum: 0, maximum: 9 },
          lang: { type: "string", enum: ["UZ", "RU", "MIX"] },
          kind: {
            type: "string",
            enum: ["PRODUCT", "PRICE", "PROMO", "COMPLAINT", "RETURN", "SERVICE", "OTHER"],
          },
          productText: { type: "string", description: 'Mijoz yozgani, xom holicha; mahsulot bo\'lmasa ""' },
          productNorm: { type: "string", description: "Umumlashtirilgan nom: O'ZBEK LOTIN, birlik son, o'lchovsiz, 1-harf katta" },
          searchTerms: { type: "array", items: { type: "string" }, maxItems: 4 },
          brand: { type: "string" },
          branchText: { type: "string", description: 'mega|oila|gold|smart yoki ""' },
          asksPrice: { type: "boolean" },
          asksPhoto: { type: "boolean" },
          answerMessageIds: { type: "array", items: { type: "integer" }, maxItems: 4 },
          answerScope: { type: "string", enum: ["SAME", "OTHER_BRANCH", "LINK", "UNKNOWN"] },
          priceQuoted: { type: "number", description: "Javobda aytilgan narx; yo'q bo'lsa 0" },
          priceUnit: { type: "string", enum: ["KG", "DONA", "NONE"] },
          status: { type: "string", enum: ["YES", "NO", "UNANSWERED", "UNCLEAR"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          note: { type: "string", description: "Faqat UNCLEAR bo'lsa, 80 belgigacha sabab" },
        },
        required: [
          "messageId",
          "itemIndex",
          "lang",
          "kind",
          "productText",
          "answerMessageIds",
          "status",
          "confidence",
        ],
      },
    },
    orphanAnswers: {
      type: "array",
      items: { type: "integer" },
      description: "Savoli topilmagan operator javoblari — QA uchun",
    },
  },
  required: ["requests"],
} as const;

/** AI qaytaradigan bitta yozuv (validatsiyadan OLDIN — qiymatlarga ishonmang). */
export interface AiRequest {
  messageId: number;
  itemIndex: number;
  lang: string;
  kind: string;
  productText: string;
  productNorm?: string;
  searchTerms?: string[];
  brand?: string;
  branchText?: string;
  asksPrice?: boolean;
  asksPhoto?: boolean;
  answerMessageIds: number[];
  answerScope?: string;
  priceQuoted?: number;
  priceUnit?: string;
  status: string;
  confidence: number;
  note?: string;
}

export interface AiResult {
  requests: AiRequest[];
  orphanAnswers?: number[];
}
