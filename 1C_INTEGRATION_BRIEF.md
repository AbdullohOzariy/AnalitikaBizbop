# 1C ↔ Analitika BizBop — integratsiya brifi

> Maqsad: 1C mutaxassislari bilan uchrashuvga tayyorgarlik. Bu hujjat 3 narsani beradi:
> **(1)** bizning texnik pasport, **(2)** 1C'dan aniq nima kerakligi, **(3)** ulardan kutuvimiz
> va ularga beriladigan savollar.
>
> Holat: **REJA** (kod yozilmagan). Faqat `scripts/1c-explore.ts` — read-only razvedka skripti tayyor.

---

## 1. Bizning tomon — texnik pasport

| Qism | Tanlov |
|---|---|
| Ilova | **Next.js 16** (App Router) + **React 19** + TypeScript |
| Server logikasi | Server Actions + Route Handlers (Node.js 20 runtime) |
| ORM / DB | **Prisma 7** (`@prisma/adapter-pg`) + **PostgreSQL** (prod: Neon, `ap-southeast-1`) |
| Auth | NextAuth v5 (Credentials, bcrypt), ko'p rolli RBAC |
| UI | Tailwind CSS 4 + shadcn/ui + Recharts |
| Excel | SheetJS (`xlsx`) — hozirgi yagona kirish kanali |
| Fon ishlar | `node-cron` (`src/instrumentation.ts`) — kuniga 7 ta ish, 03:00–15:00 |
| Telegram | Telegraf 4 (2 bot + Mini App), webhook `src/app/api/tg` |
| AI | Anthropic SDK (kategoriyalash, prognoz yordamchisi) |
| Deploy | **Railway** (doimiy Node server, Docker emas), domen `analitika.oilagroup.uz` |
| Vaqt zonasi | Butun tizim **Asia/Tashkent** (`src/lib/date.ts`), DB'da `@db.Date` kunlik |
| Kod hajmi | ~100 Prisma modeli, 25 ta bo'lim (dashboard, sotuv, zakaz, logistika, promo, moliya, prognoz…) |

**Ma'lumot hajmi (hozirgi):** 4 filial (Mega Center, Smart City, Oila SM, Gold Mart) + markaziy ombor ·
**25 406 SKU** · 3 daraja iyerarxiya (guruh → kategoriya → subkategoriya, 118 subkategoriya) ·
kunlik SKU×filial kesimida sotuv+qoldiq.

---

## 2. Hozirgi holat — nima uchun integratsiya kerak

Bugun 1C'dan ma'lumot **qo'lda Excel eksport** qilinadi va platformaga yuklanadi:

| Fayl | Nima | Chastota | Muammo |
|---|---|---|---|
| Sotuv (v3 shablon) | SKU × filial: `Остаток / Количество / Продажи (Цена, Сумма) / Себестоимость (Цена, Сумма)` | kunlik/haftalik, qo'lda | shablon o'zgarsa parser sinadi; kechikadi; odam omili |
| `sr.xlsx` | chek soni, o'rtacha chek, chekdagi tovar soni | kunlik | qo'lda |
| Tashriflar | filial × kun | kunlik | qo'lda |

Qolgan hamma narsa (zakaz, qoldiq, ko'chirish, inventarizatsiya, chiqim) **platformada qo'lda**
yuritiladi yoki Telegram bot orqali kiritiladi — ya'ni 1C bilan **ikki marta ish** qilinmoqda.

**Integratsiyaning maqsadi:** qo'lda Excel yuklashni butunlay olib tashlash va ma'lumotni
1C'dan **avtomatik, kunlik/soatlik** olish. Analitika 1C'ning **o'quvchisi** bo'ladi.

---

## 3. 1C'dan kerak bo'lgan ma'lumotlar (prioritet bo'yicha)

> Obyekt nomlari konfiguratsiyaga qarab farq qiladi — quyida **tipik** nomlar. Aniq nomlarni
> `$metadata` dan ko'ramiz (bizda razvedka skripti bor).

### P0 — birinchi bosqich, ularsiz integratsiya ma'nosiz

| Bizdagi model | 1C manbasi (tipik) | Granularlik | Chastota |
|---|---|---|---|
| `Product` (SKU) | `Справочник.Номенклатура` (+ `ЕдиницыИзмерения`) | SKU | kunlik (o'zgarganlar) |
| `Category` (3 daraja) | `Номенклатура` iyerarxiyasi / `НоменклатурныеГруппы` / `ВидыНоменклатуры` | daraja | kunlik |
| `Supplier` | `Справочник.Контрагенты` (+ `Договоры`) | kontragent | kunlik |
| `Branch` | `Справочник.Склады` / `Магазины` / `Организации` | ob'yekt | bir marta + o'zgarish |
| `ProductSales.soldQty/amount/costAmount` | `РегистрНакопления.Продажи` + `СебестоимостьПродаж` (yoki `Отчет о розничных продажах` / `ЧекККМ`) | **SKU × filial × kun** | kunlik (kecha uchun) |
| `ProductSales.stockQty` | `РегистрНакопления.ТоварыНаСкладах` — **срез остатков на дату** | **SKU × filial × kun** | kunlik |

### P1 — ikkinchi bosqich, qo'lda ishni yo'q qiladi

| Bizdagi model | 1C manbasi (tipik) |
|---|---|
| `DailyMetrics` / `DailyReceiptMetric` (chek soni, o'rtacha chek, chekdagi tovar) | `ЧекККМ` / `ОтчетОРозничныхПродажах` agregati |
| `WarehouseStock` (markaziy ombor) | `ТоварыНаСкладах` (ombor) |
| `PurchaseOrder` | `Документ.ЗаказПоставщику` + `ПоступлениеТоваровУслуг` |
| `Distribution` / `BranchTransfer` | `Документ.ПеремещениеТоваров` |
| Chiqim (spisaniya/vozvrat) | `Документ.СписаниеТоваров`, `ВозвратТоваровПоставщику` |
| `InventoryCount` | `Документ.ИнвентаризацияТоваров` / `ПересчетТоваров` |
| Narx | `РегистрСведений.ЦеныНоменклатуры` / `УстановкаЦенНоменклатуры` |

### P2 — kelajak / muhokama

- **Tashriflar** (`DailyVisits`) — 1C'da bo'lmasligi mumkin (turniket/kassa tizimi). Savol beriladi.
- **Kassa/moliya** — hozircha 1C'dan **kerak emas** (loyiha qarori: naqd kassa platformada qo'lda
  yuritiladi). Lekin 1C'da `ПКО/РКО` bo'lsa — bilib qo'yish foydali.
- **Teskari yo'nalish (biz → 1C)**: zakazni (`ЗаказПоставщику`) platformadan 1C'ga yozish.
  **Faza 1'da EMAS**, lekin huquq modelini dizayn qilishda hisobga olinsin.

---

## 4. Integratsiya usuli — variantlar va bizning tanlov

| # | Usul | Plus | Minus | Bizning fikr |
|---|---|---|---|---|
| **A** | **Standart OData interfeysi** (`/odata/standard.odata`) | 1C tomonda **kod yozilmaydi**, faqat publikatsiya + huquq; barcha obyektlar bir xil naqshda; `$filter/$select/$expand` | katta hajmda sekinroq; registr "срез" uchun cheklov | ✅ **BIRINCHI TANLOV** |
| **B** | **HTTP-servis** (1C'da yozilgan maxsus endpoint) | aynan bizga kerak shaklda, agregat qilib beradi; tez | 1C dasturchi vaqti; har o'zgarishda ular kerak | ✅ **A yetmagan joyda** (masalan kunlik agregat, срез остатков) |
| C | DB'ga to'g'ridan-to'g'ri SQL (read replica) | eng tez | 1C sxemasi (`_Reference123_`) — o'qib bo'lmaydi, versiyada o'zgaradi; qo'llab-quvvatlanmaydi | ❌ tavsiya etilmaydi |
| D | Fayl almashinuv (CSV/XML papkaga) | eng sodda | kechikish, ishonchsizlik, hozirgi muammoning davomi | 🟡 zaxira variant |

**Taklif: A + B gibrid.** Ma'lumotnomalar (Номенклатура, Контрагенты, Склады) — OData orqali.
Og'ir agregatlar (kunlik sotuv+tannarx, срез остатков) — 1C tomonda **HTTP-servis** yoki
**tayyor OData `AccumulationRegister_..._RecordType`/virtual jadval** orqali.

---

## 5. 1C mutaxassislaridan ANIQ kutuvimiz (checklist)

Uchrashuvda shu ro'yxatni bosqichma-bosqich yuring — har bandga "ha/yo'q/kim qiladi/qachon" yozing.

### 5.1 Kirish (access)
- [ ] **Test bazasi** nusxasi + unga kirish — **birinchi navbatda** (prodga tegmaymiz)
- [ ] Veb-serverda publikatsiya: `Публикация на веб-сервере` → ✅ **«Публиковать стандартный интерфейс OData»**
- [ ] `Состав стандартного интерфейса OData` da bizga kerak obyektlar belgilansin (3-bo'lim ro'yxati)
- [ ] **Texnik foydalanuvchi** (`analitika_api`): faqat **o'qish** huquqlari +
      **«Право на использование стандартного интерфейса OData»**; interfaol kirish taqiqlansin
- [ ] **URL** (HTTPS, haqiqiy sertifikat bilan): `https://<host>/<base>/odata/standard.odata`
- [ ] Tarmoq: statik oq IP yoki VPN; agar **IP-whitelist** bo'lsa — bizning chiquvchi IP haqida
      quyida (7.2) o'qing

### 5.2 Ma'lumot shartnomasi (data contract)
- [ ] Har bir P0 obyekt uchun: **aniq nom**, kerakli **maydonlar ro'yxati**, misol yozuv
- [ ] **Identifikator:** har yozuvda `Ref_Key` (GUID) **va** `Код` — ikkalasi ham kerak
      (bizda hozir `Product.code` = 1C `Код`, `Category.code` = 1C kod)
- [ ] **Инкрементал yuklash:** yangi/o'zgargan yozuvlarni qanday ajratamiz —
      `DataVersion`, `ДатаИзменения` maydoni yoki hujjat `Date` bo'yicha filtr?
- [ ] **O'chirilgan/помеченные:** `DeletionMark`, `Posted` (`Проведен`) — biz nimani hisoblaymiz
- [ ] **Vaqt zonasi:** 1C sanalari qaysi zonada qaytadi (UTC yoki server lokal)? Biz Asia/Tashkent'da
      ishlaymiz — kun chegarasi aniq bo'lishi shart
- [ ] **Sotuv qayerdan olinadi:** hujjatdan (`ЧекККМ`) yoki registrdan (`Продажи`)?
      Qaysi biri "haqiqat manbai"?
- [ ] **Tannarx (`Себестоимость`) qachon aniq bo'ladi** — sotuv paytidami yoki **oy yopilgandan
      keyingina**? ⚠️ Bu bizning marja hisobotimiz uchun **kritik**: agar oy yopilishida
      qayta hisoblansa, biz **retro-yangilash** oqimini qurishimiz kerak
- [ ] **Qoldiq:** `срез остатков на дату` OData orqali olinadimi, yoki HTTP-servis kerakmi?

### 5.3 Ekspluatatsiya (operations)
- [ ] Qaysi **soatda** yuklashimiz mumkin (1C yopilish/reglament ishlaridan keyin)?
- [ ] So'rov **chastotasi/hajmi** cheklovlari bormi (rate limit, sessiya soni)?
- [ ] 1C **yangilanganda** (konfiguratsiya/reliz) bizni ogohlantirish tartibi — kim, qanday kanal
- [ ] **Mas'ul shaxs** (nom, telefon) va **javob berish vaqti** (SLA) — nosozlikda kimga yozamiz
- [ ] Test bazasi **prod bilan qanchalik mos** va qachon yangilanadi

### 5.4 Bizdan ular kutadigan narsa (biz beramiz)
- Bu brif + kerakli maydonlar aniq ro'yxati (3-bo'lim)
- Bizning chiquvchi IP (whitelist kerak bo'lsa)
- Test natijalari: `scripts/1c-explore.ts` chiqishi — nima ko'rinyapti, nima yetishmayapti
- Har bosqichdan keyin **qabul mezoni**: 1C hisoboti va bizning dashboard **bir xil raqam** berishi

---

## 6. Ularga beriladigan savollar (birinchi 10 daqiqa)

1. **Qaysi konfiguratsiya?** (`УТ 11.x` / `Розница 2.3` / `КА` / `УНФ` / **o'zi yozilgan**) va relizi?
2. **Platforma versiyasi** (8.3.x) va rejim: fayl yoki **client-server**? DBMS: MS SQL / PostgreSQL?
3. Baza **hajmi** va kunlik hujjat oqimi taxminan qancha?
4. **Veb-server** bormi (Apache/IIS) va tashqaridan HTTPS orqali ochilganmi?
5. **OData** ilgari ishlatilganmi? Boshqa integratsiyalar bormi (bank, marketpleys, EHF)?
6. 4 filial **1C'da qanday ajratilgan** — `Склад`, `Магазин`, `Организация` yoki `Подразделение`?
7. Sotuv 1C'ga **qanday tushadi** — kassa (ККМ) onlayn ulanganmi yoki kun oxirida hisobot bilanmi?
8. **Tannarx metodikasi** (o'rtacha / FIFO) va oy yopilishida qayta hisoblanadimi?
9. **Tashrif (mijoz oqimi)** ma'lumoti 1C'da bormi? Yo'q bo'lsa — qayerda?
10. Bizga ajratiladigan **odam-soat** va **muddat** qancha? Kim mas'ul?

---

## 7. Qizil chiziqlar (buzilmas shartlar)

1. **Faza 1'da 1C'ga hech narsa YOZILMAYDI.** Faqat o'qish. Texnik foydalanuvchida yozish
   huquqi bo'lmasin — bu ikkala tomonni ham himoya qiladi.
2. **Prod bazaga to'g'ridan-to'g'ri SQL yo'q.** Faqat qo'llab-quvvatlanadigan interfeys
   (OData / HTTP-servis).
3. **Ish vaqtida og'ir so'rov yo'q** — to'liq yuklash tunda, kunduzi faqat inkremental.
4. **Sirlar** (`ODATA_USER/PASS`) faqat ENV'da, kodga yozilmaydi, logga tushmaydi
   (`src/lib/tg-redact.ts` naqshi).
5. **Idempotentlik:** bir xil ma'lumot ikki marta kelsa dubl yaratmasin (bizda `@@unique` +
   `sourceRowHash` naqshi allaqachon bor).
6. **Excel yo'li o'chirilmaydi** — integratsiya barqaror ishlaganini isbotlagunicha zaxira
   sifatida qoladi.

### 7.2 Bizning tomondagi ma'lum risk — chiquvchi IP
Ilova **Railway**'da ishlaydi, chiquvchi IP **statik emas**. Agar 1C tomonda IP-whitelist talab
qilinsa, ikki yechim bor:
- **(a)** statik IP'li kichik VPS orqali proxy (bizning tomonda, ~1 kunlik ish), yoki
- **(b)** IP o'rniga **mTLS / uzun tokenli auth** + faqat o'qish huquqi.

Uchrashuvda qaysi biri ularga qulayligini aniqlang.

---

## 8. Bosqichlar va "tayyor" mezoni

| Faza | Ish | Qabul mezoni |
|---|---|---|
| **0. Razvedka** (1–2 kun) | Test bazaga OData ochiladi; biz `npx tsx scripts/1c-explore.ts` ishga tushiramiz | `$metadata` ochiladi, kerakli obyektlar ro'yxati qo'lda |
| **1. Shartnoma** (2–3 kun) | Har P0 obyekt uchun maydon xaritasi + misol yozuvlar; yetishmaganiga HTTP-servis TZ'si | Yozma **maydon xaritasi** hujjati (ikki tomon imzolagan) |
| **2. Ma'lumotnomalar** | Номенклатура / Контрагенты / Склады → `Product`, `Category`, `Supplier`, `Branch` sinxroni | SKU soni va nomlar 1C bilan **1:1**; alias/mismatch hisoboti bo'sh |
| **3. Sotuv + qoldiq** | Kunlik SKU×filial sotuv/tannarx/qoldiq avtomatik | Bir hafta davomida bizning dashboard va 1C hisoboti **teng** (og'ish < 0.1%) |
| **4. Excel o'chadi** | Qo'lda yuklash to'xtatiladi (kod qoladi) | 14 kun uzilishsiz avtomatik yuklash |
| **5. P1 hujjatlar** | Zakaz, ko'chirish, chiqim, inventarizatsiya | Har biri alohida qabul qilinadi |

---

## Ilova A — 1C mutaxassislariga yuborish uchun qisqa TZ (rus tilida)

> Buni to'g'ridan-to'g'ri nusxalab yuborish mumkin.

**Задача:** предоставить внешней аналитической платформе **доступ только на чтение** к данным 1С.

**Что нужно от вас:**

1. **Тестовая база** (копия) и доступ к ней — в первую очередь.
2. **Публикация на веб-сервере** с включённой опцией **«Публиковать стандартный интерфейс OData»**;
   в «Составе стандартного интерфейса OData» включить объекты из п.5.
3. **Технический пользователь** (`analitika_api`): роли **только на чтение** +
   право **«Использование стандартного интерфейса OData»**; интерактивный вход запретить.
4. **URL по HTTPS** с валидным сертификатом: `https://<host>/<base>/odata/standard.odata`.
   Если требуется белый список IP — сообщите, мы согласуем статический исходящий адрес.
5. **Необходимые объекты (приоритет 1):**
   - `Справочник.Номенклатура` (код, наименование, единица, родитель/иерархия, пометка удаления)
   - `Справочник.Контрагенты` (поставщики) и договоры
   - `Справочник.Склады` / `Магазины` (соответствие 4 филиалам)
   - **Продажи в разрезе номенклатура × склад × день**: количество, сумма, **себестоимость**
     (регистр накопления `Продажи` / `СебестоимостьПродаж` либо `ОтчетОРозничныхПродажах`)
   - **Остатки** `ТоварыНаСкладах` — **срез на дату**, номенклатура × склад
   - Показатели чеков за день: количество чеков, средний чек, среднее число товаров в чеке
6. **Вопросы, на которые нужен письменный ответ:**
   - Конфигурация и релиз; версия платформы; файловый или клиент-серверный режим.
   - Как отбирать **только изменённые** записи (`DataVersion`, дата изменения, дата документа)?
   - В каком часовом поясе возвращаются даты?
   - Когда **себестоимость** становится окончательной — в момент продажи или после закрытия месяца?
   - Доступен ли **срез остатков** через OData, или требуется отдельный **HTTP-сервис**?
   - В какие часы допустима выгрузка; есть ли ограничения по нагрузке?
   - Ответственный специалист и порядок уведомления при обновлении конфигурации.

**Что мы НЕ делаем:** не пишем в 1С, не обращаемся напрямую к СУБД, не выполняем тяжёлые
запросы в рабочее время. Все обращения — только через стандартный интерфейс OData
либо предоставленный вами HTTP-сервис.

---

## Ilova B — bizdagi razvedka skripti

```bash
# .env ga qo'shiladi (kodga yozilmaydi):
#   ODATA_URL=https://server/base/odata/standard.odata
#   ODATA_USER=analitika_api
#   ODATA_PASS=...

npx tsx scripts/1c-explore.ts                      # ochiq obyektlar ro'yxati (turlar bo'yicha)
npx tsx scripts/1c-explore.ts Catalog_Номенклатура --n 3   # namuna yozuv + maydonlar
```

Skript **faqat o'qiydi**, 401/404 xatolarini 1C tilida izohlaydi
(huquq yetmasa / publikatsiya yoqilmagan bo'lsa).
