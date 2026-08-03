# Moliya moduli — reja va qabul qilingan qarorlar

> Holat (2026-08-03): **F1, F3, F4 qurildi va ishlaydi.** 9 ta sahifa:
> `/moliya/kassa` (jurnal + kiritish + ko'chirish) · `/moliya/qoldiq` (fizik sanash) ·
> `/moliya/yopish` (kunlik yopish + qulf) · `/moliya/nazorat` (anomaliyalar) ·
> `/moliya/dds` (hisobot) · `/moliya/kontragentlar` (reyestr + birlashtirish) ·
> `/moliya/import` (tarix ko'chirish) · `/moliya/moslanmagan` · `/moliya/malumotnoma`.
>
> **Qolgan:** F2 miniapp · F6 HR (ish haqi) integratsiyasi.
> **Kutilmoqda:** real `.xlsx` fayl (import shu bilan sinaladi), fizik sanash raqamlari,
> 6 ta modda tasnifi tasdiqlanishi.
> Manba tahlili: "Копия Касса-Асосий" Google Sheet (fileId `1EcimeS_aZn0Gh2_ejlEHJKTKO8nAAoj4XGYTXzbARBg`),
> 01.03–02.08.2026, aylanma ~76.3 mlrd UZS, 11 kassa, ~68 «Статья ДДС».

---

## 1. Nima uchun bu modul kerak

Hozirgi kassa kitobining **arifmetikasi toza** (namunada 246/246 qatorda qoldiq izchil),
lekin **semantikasi buzilgan**. 28.02–05.03 namunasi bo'yicha o'lchandi:

| Ko'rsatkich | Jadval ko'rsatadi | Haqiqat |
|---|---|---|
| Chiqim | 1 435 254 000 | **706 232 000** operatsion |
| — xarajat bo'lmagan qism | — | **729 022 000** (50.8%) |
| — faqat Инкасса | — | 609 500 000 (chiqimning 42.5%) |
| Kirim | 1 445 190 000 | **1 154 971 500** operatsion |
| — egadan kiritilgan pul (Молиявий ёрдам) | — | 280 000 000 |
| «Иш хаки» | 556 552 000 | real ish haqi **132 089 000** + podotchyot **424 463 000** |

Ya'ni **xarajat 2.03×, tushum 1.25× sun'iy shishgan**. Jadval bo'yicha «+9.9 mln farq» chiqadi —
bu «nolga ishlayapmiz» degan noto'g'ri xulosaga olib keladi.

**Chegara:** tovar tannarxi bu kitobda tushumning atigi 9.7% ini tashkil qiladi (retailda odatda 70–78%).
Xarid, soliq, ijara, kredit asosan bank orqali. Shuning uchun modul **P&L emas, TREASURY**
(naqd/pul oqimi xazinasi). P&L keyin mavjud sotuv/chiqim/zakaz modullariga ulanadi.

### Tekshirilgan va RAD ETILGAN da'volar

Adversarial tekshiruvda quyidagilar **xato** deb topildi — ularga tayanmaslik kerak:

- ~~«Смарт (Uchquduq) kitobda yuritilmaydi»~~ — yuritiladi. Yig'ma varaqda qatori vizual bo'sh
  ko'rinadi, lekin qiymatlari bor: ochilish −35 259 000, kirim 124 700 000, chiqim 554 236 500,
  yopilish −464 795 500. Arifmetika buni tasdiqlaydi.
- ~~«Yig'ma varaq jurnaldan 283.6 mln farq qiladi — xato»~~ — xato emas, **kutilgan**:
  ochilish qoldiqlari (28.02 «Остатка» yozuvlari) + mart natijasi = 01.04 dagi davr boshi.
- ~~«Investitsion qurilish operatsion bilan aralashgan»~~ — moddalari **alohida** («Зарафшон Малл
  курилиш хараражатлари», «Навоий Малл...»). Muammo aralashishda emas, hisobotda ajratilmasligida.

---

## 2. Qabul qilingan qarorlar (loyiha egasi)

| # | Qaror |
|---|---|
| 1 | **Platforma birlamchi manba bo'ladi**, Sheets'ning ko'zgusi emas. Kirim/chiqim shu yerda kiritiladi |
| 2 | **Miniapp** — telefondan kirim/chiqim kiritish (Telegram; `bot/miniapp/` infratuzilmasi tayyor) |
| 3 | **Bank va plastik** naqd bilan **bir joyda, qo'lda** kiritiladi — hisob turi maydoni bilan ajratiladi |
| 4 | **Har filial o'z kassasini yuritadi**, balanslar alohida; kassalararo **ko'chirish (переброс)** kerak. Filialda kassa bo'lmasligi ham mumkin — sozlanadi |
| 5 | **Tarix to'liq ko'chiriladi** (01.03.2026 dan), **qulflangan** holatda — hisobot uchun |
| 6 | **1C kerak emas** |
| 7 | **Qarz/sverka:** avval mavjud holat qo'lda kiritiladi, keyin sverkadan avtomatik oziqlanadi |
| 8 | **Ish haqi** — HR platforma bilan integratsiya, keyinroq |
| 9 | **FINANCE roli** — keng: Moliya to'liq + Analitika/Sotuv ko'rish. Izolyatsiyalanmagan |
| 10 | «Strategik hamkorlik» menyuda **Tizim ▸ Baza** ga ko'chadi |
| 11 | **Инкасса → bank hisobiga.** Ya'ni inkassatsiya = `CASH` hisobdan `BANK` hisobga ko'chirish, avtomatik neytral va o'z-o'zidan balanslanadi |
| 12 | **Kafe / o'yingoh nuqtalari** (Кафе Мега, Эддо, 3-этаж, 4-этаж, Маззона, Оила кафе) hozircha alohida savdo nuqtasi sifatida analitikaga **kirmaydi** — faqat hisob va xarajat markazi |
| 13 | **Zarafshon Malli, Navoiy Malli, Молхона — alohida biznes/loyiha.** Har biriga ketgan xarajat alohida ko'rinishi shart (loyiha kesimidagi hisobot) |
| 14 | Kassa yozuvlarini **2–5 kishi** kiritadi → hisob bo'yicha scope va kim kiritgani (`createdById`) majburiy |

---

## 3. Asosiy g'oya: muammolarni kiritish paytida yopish

Platforma birlamchi manba bo'lgani uchun ma'lumot sifati muammolari **keyin tozalanmaydi —
kiritishda oldi olinadi**:

| Manbadagi muammo | Kiritish qoidasi bilan yechim |
|---|---|
| Neytral moddalar xarajat bo'lib yig'iladi | Modda ma'lumotnomasida `isNeutral` bir marta belgilanadi → hamma hisobotga tarqaladi |
| Инкасса/Переброс bir tomonlama | Transfer moddasi tanlansa **qarshi hisob majburiy** → ikki bog'langan yozuv (double-entry) |
| Kirim moddasi chiqimga yozilgan («Камомад» → «Савдо тушуми») | Modda `direction` bilan qatorning yo'nalishi solishtiriladi, mos kelmasa **bloklanadi** |
| Kontragent bo'sh (to'lovlarning 72%ida) | Yirik summa (chegara AppSetting'da) → **kontragent majburiy** |
| Ismlar 3-4 xil imloda | Kontragent **reyestrdan tanlanadi**, erkin matn emas |
| Kun ichida qoldiq manfiy | Yozuv **vaqt bilan** saqlanadi (`occurredAt`), tartib buzilmaydi |
| Podotchyot qo'sh hisoblanadi | «Hisobdor shaxsga berildi» va «hisobdan yopildi» — **alohida moddalar**; ochiq qoldiq kuzatiladi |
| Qoldiq formula sifatida qotib qolgan | Qoldiq **hech qachon saqlanmaydi**, doim hisoblanadi |

---

## 4. Fazalar

### F1 — Poydevor + kiritish

1. **Moddalar ma'lumotnomasi** — 3 daraja: bo'lim (operatsion / investitsion / moliyaviy / texnik)
   → guruh → modda (~68 ta). Har moddada bayroqlar: `isNeutral`, `isTransfer`, `direction`.
   Seed manbasi: `info` varag'ining B ustuni + G→H moslashtirish lug'ati
   (Ойлик→Иш хаки, Камунал→Электр энергияси, Салярка→Ёнилги, Абонент туловлар→Интернет...).
   **Bu — modulning yuragi.** Bo'lim/guruh biriktirish moliyachi bilan birga o'tirib bajariladi (~2-3 soat).
2. **Hisoblar ro'yxati** — naqd kassalar + bank hisoblari + plastik (ekvayring). Filialga bog'lanishi
   ixtiyoriy; filialda kassa bor-yo'qligi sozlanadi.
3. **Kontragent reyestri** (minimal) — xodim / ta'minotchi / hisobdor shaxs / boshqa.
4. **`/moliya/kassa`** — kiritish formasi + jurnal (sana × hisob × bo'lim × modda filtri).
   Yuqorida 4 KPI: operatsion kirim · operatsion chiqim · moliyaviy · neytral-transfer.

### F2 — Miniapp
Telefondan kirim/chiqim kiritish. Cheklangan forma: hisob, modda, summa, kontragent, izoh, foto-chek.
Rol/scope: kassir faqat o'z hisobiga yozadi.

### F3 — Tarixni ko'chirish
Sheets → bir martalik import: checksum (manba jami bilan solishtirish, farq bo'lsa **butun partiya rad
etiladi**), `sourceRowHash` bilan idempotent, moslanmagan qatorlar ro'yxati. Ko'chirilgan yozuvlar
**qulflanadi** (`isLocked`) — tahrirlanmaydi, faqat hisobot uchun.

### F4 — Qarz va sverka
Mavjud qarzdorlik holati qo'lda kiritiladi → keyin `/sverka` moduli bilan bog'lanib avtomatik oziqlanadi.
Kunlik yopish (fizik sanash) va anomaliya nazorati shu fazada.

### F5 — Hisobotlar
DDS (bo'lim→guruh→modda drilldown, oylar yonma-yon, neytral sukut bo'yicha chiqarilgan) ·
naqd oqim kalendari · POS savdo ↔ kassa sverkasi · ta'minotchi kesimidagi to'lovlar.

### F6 — HR integratsiyasi
Ish haqi HR platformadan keladi, podotchyot o'rniga real hisob-kitob.

---

## 5. Model qoralamasi

Nomlash: model va maydonlar **inglizcha**, route'lar **o'zbekcha** (AGENTS.md).
Pul: `Decimal(18,2)`. Sana/TZ: `src/lib/date.ts` (Asia/Tashkent).

```
enum CashAccountKind  { CASH, BANK, CARD }
enum CashFlowSection  { OPERATING, INVESTING, FINANCING, TECHNICAL }
enum CashDirection    { IN, OUT }

CashAccount      id, name, kind, branchId?, costCenterId?, currency, isActive,
                 trustedFrom?   // shu sanadan qoldiq ishonchli
CashAccountAlias id, accountId, alias        // import uchun imlo variantlari

CostCenter       id, name, kind(BRANCH|PROJECT|COMPANY), branchId?
                 // pul QAYSI hisobdan chiqqani ≠ xarajat KIMGA tegishli
                 // dalil: 04.03 Маззона kassasidan to'landi, ish Зарафшон Малл uchun

CashFlowGroup    id, code, name, section, sortOrder
CashFlowArticle  id, code, name, groupId, direction, isNeutral, isTransfer, isActive
CashFlowArticleAlias

Counterparty     id, name, kind(EMPLOYEE|SUPPLIER|ACCOUNTABLE|OTHER), supplierId?
CounterpartyAlias

CashTxn          id, occurredAt, accountId, articleId, direction, amount,
                 counterpartyId?, costCenterId?, note, transferId?,
                 source(MANUAL|MINIAPP|IMPORT), isLocked, createdById, ...
CashTransfer     id, fromAccountId, toAccountId, amount, occurredAt
                 // har transfer = 2 ta CashTxn, kiritishda majburiy juftlanadi

CashAccountOpening  id, accountId, onDate, amount, source
CashDayClose        id, accountId, onDate, expected, counted, diff, closedById  // F4
UnmatchedCashRow    ...                                                          // F3
CashImportBatch     id, fileHash, sourceSumIn, sourceSumOut, status, ...          // F3
```

**Loyihalar** (Зарафшон Малл, Навоий Малл, Молхона) — `CostCenter.kind = PROJECT`.
Ular alohida biznes sifatida qaraladi: har biriga ketgan **jami xarajat** loyiha kesimida
ko'rinishi shart, hatto pul boshqa filial kassasidan chiqqan bo'lsa ham
(dalil: `04.03 · Маззона kassasi · Кунликчи 2 та · Зарафшон Малл курилиш`).

**Kirituvchilar 2–5 kishi** → `CashTxn.createdById` majburiy; har foydalanuvchiga ruxsat etilgan
hisoblar ro'yxati (scope) beriladi — kassir faqat o'z hisobiga yozadi, FINANCE hammasini ko'radi.

**Qoldiq hech qachon saqlanmaydi** — `CashAccountOpening` + `CashTxn` yig'indisidan hisoblanadi.
`trustedFrom` meros ishonchsizligini (Офис −30.2 mlrd) **o'chirmasdan izolyatsiya qiladi**:
undan oldingi davr hisobotda «tarixiy — tasdiqlanmagan» bayrog'i bilan chiqadi.

---

## 6. Rol va menyu

- `Role` enum'ga **`FINANCE`** qo'shiladi (Prisma migratsiyasi).
- `src/lib/roles.ts`: `canSeeFinance()` predikati; `canSeeAnalytics` ga FINANCE qo'shiladi.
- `auth.config.ts` ga **tegilmaydi** — FINANCE izolyatsiyalanmagan, himoya sahifa guard'ida.
- ⚠️ **Oldin tuzatilishi shart:** `/dashboard` guard fail → `redirect("/")` → `/dashboard` =
  **cheksiz halqa**. Yangi rol qo'shishdan oldin yopilsin.
- Menyu: [sidebar 3-darajali IA rejasi](#) — Moliya yuqori darajada, «Strategik hamkorlik» Tizim▸Baza da.

---

## 7. Hali javobsiz savollar

1. **Boshlanish qoldig'i** — har hisobda fizik qancha naqd bor? Nuqtalarni bir kunda sanab
   qog'ozga tushirish qachon mumkin? (usiz `trustedFrom` o'rnatilmaydi)
2. **Podotchyot (hisobdor shaxs) tarqatishi** — quyida batafsil.

### 7.1 Podotchyot savoli nima haqida

Jurnalda shunday naqsh bor:

```
01.03 · Мега маркет · Асомиддинова Гулчехра · «Иш хаки харажатлари» · чиқим 115 000 000
05.03 · Кафе Мега  · Асомиддинова Гулчехра · «Официантларга (хафталик)» · чиқим  14 891 000
```

Ya'ni bir odamga **katta summa bir yo'la beriladi**, keyin u boshqalarga tarqatadi.
Namunada shunday «ismli, izohsiz yirik» to'lovlar **424 463 000 so'm** — «Иш хаки» moddasining **76.3%** i.
Real ismma-ism ish haqi esa atigi 132 089 000.

Bundan ikki muammo chiqadi:
- **Qo'sh hisob:** avval «Gulchehraga 115 mln — ish haqi», keyin «ofitsiantlarga 14.9 mln — ish haqi».
  Bir pul ikki marta xarajat bo'lib yoziladi.
- **Kuzatuvsiz qoldiq:** Gulchehrada hozir qancha pul qolgani hech qayerda ko'rinmaydi.

**Savol:** Gulchehra (yoki Elyor) o'sha pulni kimlarga bergani **qayerdadir yoziladimi** —
daftar, alohida Excel, telefon yozuvi?

- **Ha, yoziladi** → biz o'sha manbani ham olamiz, kim qancha olgani aniq bo'ladi.
- **Yo'q, yozilmaydi** → platformada noldan quramiz: pul berilganda «hisobdor shaxsga berildi»
  deb yoziladi (xarajat emas, qarz), u tarqatgach hisobot beradi va qoldig'i yopiladi.
  Yopilmagan qoldiq ekranda qizil turadi.
