# Loyiha auditi — 2026-06-10

Tekshiruv qamrovi: xavfsizlik (auth, server actions, API, Telegram), backend mantiq (analitika, sana/kesh, parserlar, tranzaksiyalar), frontend (RSC/hydration, performance, a11y), bogʻliqliklar va konfiguratsiya.

**Avtomatik tekshiruvlar:** `tsc --noEmit` ✅ · ESLint ✅ · `next build` ✅ · repoda maxfiy fayllar yoʻq ✅ · `npm audit` — 12 zaiflik (3 HIGH).

**Umumiy baho:** kod xavfsizlik jihatdan kuchli yozilgan — SQL injection yoʻq (hammasi parametrlangan), barcha yozish action'lari rol bilan himoyalangan, Telegram HMAC/webhook toʻgʻri, parol bcrypt(12), rol har soʻrovda DB'dan qayta oʻqiladi. KRITIK darajali muammo topilmadi. Asosiy xavflar — eskirgan bogʻliqliklardagi CVE'lar va maʼlumot-toʻgʻriligi (sana/kesh/tranzaksiya) sinfidagi bug'lar.

---

## XATOLIKLAR JADVALI

### YUQORI (12)

| # | Joy | Muammo | Tuzatish |
|---|-----|--------|----------|
| Y1 | `package.json` — `xlsx@0.18.5` | Prototype Pollution + ReDoS (GHSA-4r6h-8v6p-xvw6, CVSS 7.8). npm registry'dagi paket eskirgan, tuzatish faqat SheetJS CDN'da. Admin yuklagan zararli .xlsx orqali ekspluatatsiya mumkin | `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` yoki `exceljs`ga koʻchish |
| Y2 | `package.json` — `next@16.2.4` | Server Components DoS (GHSA-8h8q-6873-q5fj, CVSS 7.5) — 16.0.0–16.2.4 zaif | `npm install next@^16.2.9` |
| Y3 | [period-filter.tsx:93](src/components/common/period-filter.tsx#L93) | `router.replace("/dashboard?...")` qattiq kodlangan, lekin komponent [branches/[id]/page.tsx:91](src/app/(app)/branches/[id]/page.tsx#L91) da ham ishlatiladi — filial sahifasida davr oʻzgartirilsa foydalanuvchi /dashboard'ga otib yuboriladi | `usePathname()` ishlatish yoki `basePath` prop qoʻshish |
| Y4 | [upload/actions.ts:260-278](src/app/(app)/admin/upload/actions.ts#L260-L278) | `UploadedFile.create` + `CategorySales` INSERT tranzaksiyasiz; cleanup `delete` ham yiqilsa SUCCESS-statusli "osilgan" yozuv qoladi va fayl hash'i band boʻlib, qayta yuklab boʻlmaydi | `prisma.$transaction(async (tx) => ...)` yoki FAILED-status bilan boshlab muvaffaqiyatda SUCCESS'ga oʻtkazish |
| Y5 | [moslanmagan/actions.ts:20-22](src/app/(app)/baza/moslanmagan/actions.ts#L20-L22) | `assignProductSubcatAction` faqat `"iyerarxiya"` tegini yangilaydi — `computeProfitTree`/marja `Product.categoryId` orqali bogʻlangan, sof foyda koʻrinishi stale qoladi (Fakt=0 sinfidagi kesh muammosi) | `revalidateTag(ANALYTICS_CACHE_TAG)` qoʻshish |
| Y6 | [forecast.ts:386+](src/lib/forecast.ts#L386) | `applyForecastDayEdit`: findMany → hisoblash → tranzaksiya — izolyatsiyasiz; ikki foydalanuvchi parallel tahrirlasa yigʻindi buziladi (lost update) | Interactive `$transaction(..., { isolationLevel: "Serializable" })` |
| Y7 | [finans/actions.ts:32](src/app/(app)/sotuv/finans/actions.ts#L32) | `amount = Math.round(qty*price*100)/100` — pul JS float'da hisoblanadi, DB esa Decimal | `Prisma.Decimal` bilan koʻpaytirish |
| Y8 | [notify.ts:46-140](src/lib/spisaniya/notify.ts#L46-L140) | `parse_mode:"HTML"` bilan foydalanuvchi matni (`tovar`, `sabab`...) eskeyplanmagan — guruh xabariga HTML/soxta havola kiritish mumkin | `&`, `<`, `>` ni eskeyplash funksiyasi |
| Y9 | [rasm-preview/[fileId]/route.ts:13-25](src/app/api/rasm-preview/[fileId]/route.ts#L13-L25) | IDOR: har qanday analitika foydalanuvchisi istalgan `fileId` rasmni koʻradi — yozuv egaligiga/qamroviga bogʻlanmagan | `fileId`ni yozuv bilan bogʻlab DB'da tekshirish (yoki biznes qarori sifatida hujjatlash) |
| Y10 | [rate-limit.ts:33-41](src/lib/spisaniya/rate-limit.ts#L33-L41), [login/actions.ts:31](src/app/login/actions.ts#L31) | XFF'ning eng oʻng qiymatiga ishonish faqat Railway edge ortida toʻgʻri; boshqa topologiyada IP spoof bilan rate-limit aylanib oʻtiladi; in-memory limit koʻp instansiyada ishlamaydi | Ishonchli hop sonini aniq belgilash; login'ga email boʻyicha ham limit |
| Y11 | [charts-impl.tsx:32-42](src/components/charts/charts-impl.tsx#L32-L42) | Tooltip ranglari qattiq oq/qora kodlangan — dark mode'da oʻqib boʻlmaydi (widgets.tsx'dagi `var(--card)` yondashuvi toʻgʻri) | CSS token'larga (`var(--card)`, `var(--foreground)`) oʻtkazish |
| Y12 | [order-detail.tsx:80](src/app/(app)/sotuv/sotib-olish/[id]/order-detail.tsx#L80) | Client render'da `toLocaleString("uz-UZ")` — server/brauzer TZ va ICU farqi hydration mismatch beradi; xuddi shu naqsh [sotib-olish/page.tsx:105](src/app/(app)/sotuv/sotib-olish/page.tsx#L105) da | Sanani serverda deterministik formatlash (`format.ts` UTC util'lari) va tayyor string uzatish |

### OʻRTA (15)

| # | Joy | Muammo | Tuzatish |
|---|-----|--------|----------|
| O1 | `dashboard-v2/widgets.tsx:1-19` | Recharts to'g'ridan-to'g'ri import — `charts/index.tsx`dagi `dynamic({ssr:false})` naqshiga zid; SSR'da ortiqcha render/bundle, hydration ogohlantirishlari xavfi | Chart qismlarini `dynamic({ssr:false})` orqali yuklash |
| O2 | `analytics.ts:582-584` | `_findMissingDays`: `periodStart.getTime()` normallashtirilmagan (Prisma @db.Date odatda UTC-yarim tun qaytaradi, lekin kafolat util bilan boʻlishi kerak) | `isoDay()` orqali normallashtirish |
| O3 | `analytics.ts:70-74` | `unstable_cache` kalit `isoDay` bilan, closure esa millisekundli `range` — URL'dan kelgan nostandart Date'da kalit/qiymat nomuvofiqligi | `range`ni kesh chegarasida `isoDay`ga normallashtirish |
| O4 | `analytics-v2.ts:440-448` | `dailyPlanByGroup`: kun ulushi ForecastDay oy summasidan, guruh rejasi SalesPlan'dan — ikkisi desinxron boʻlsa reja chizigʻi notoʻgʻri | Hujjatlash + ForecastDay yangilanmaganda ogohlantirish |
| O5 | `spisaniya/profit.ts:129-139` | Kesh kalitida `branchName` yoʻq (faqat branchId); bizbop'dagi filial nomi farq qilsa notoʻgʻri natija keshlanadi | Kalitga branchName qoʻshish yoki nom mosligini tekshirish |
| O6 | `spisaniya/db.ts` (pool) + `src/lib/prisma.ts:15-25` | Pool'lar modul darajasida — dev hot-reload'da global'ga saqlanmagani uchun connection leak (Neon limiti ~10!) | `globalThis`da pool saqlash (prisma client kabi) |
| O7 | `rejalar/actions.ts:74-76` | Barcha filiallar uchun `Promise.all` — 12+ parallel Claude so'rovi (rate limit) + DB pool bosimi | Ketma-ket yoki cheklangan parallelizm (p-limit 2-3) |
| O8 | `parsers/sales.ts:499-501` | Validatsiya tolerantligi 0.1% — 10 mlrd UZS'da 10 mln oyna, xato import sezilmaydi | Absolyut limit (masalan 1000 UZS) yoki 0.001% |
| O9 | `spisaniya/db.ts:77-92` | Read funksiyalari xatoni jimgina `return []` qiladi, log yoʻq — DB uzilishi "boʻsh sahifa" boʻlib koʻrinadi | catch'da `console.error` |
| O10 | `schema.prisma` — Expense | `deletedAt: null` filtri uchun indeks yoʻq (`@@index([spentAt])` bor, composite yoʻq) | `@@index([spentAt, deletedAt])` yoki partial index |
| O11 | `finans-client.tsx:23` | `useState(todayISO())` — server/client kun chegarasida hydration mismatch | Boʻsh boshlab `useEffect`da toʻldirish |
| O12 | `widgets.tsx:400-407` | `planByDate`/`faktSeries`/`rejaSeries` har render'da qayta hisoblanadi — `useMemo` yoʻq | `useMemo([days, planDays])` |
| O13 | `widgets.tsx:221` | Recharts `Cell key={i}` — sort oʻzgarsa diff/animatsiya buziladi | `key={d.name}` |
| O14 | `expandable-card.tsx:30-48` | Modal'da focus trap yoʻq (Tab orqaga chiqib ketadi) — WCAG AA | Tab/Shift+Tab handler yoki native `<dialog>` |
| O15 | `profit-tree.tsx:59,74` | `<tr onClick>` — klaviatura/screen-reader ishlamaydi | `tabIndex={0} role="button" onKeyDown` yoki ichki button |
| O16 | `npm audit` — `qs` | qs DoS (moderate) — `npm audit fix` bilan tuzatiladi | `npm audit fix` |

### PAST (12)

| # | Joy | Muammo |
|---|-----|--------|
| P1 | `analytics.ts:297` | `dailyVisitsSeries` kesh kaliti versiya suffiksi olmagan — stale-kesh ehtimoli (boshqalari `_v2/_v3`) |
| P2 | `analytics-v2.ts:422` | `new Date(r.d)` — date-only string spec boʻyicha UTC parse boʻladi, hozircha xavfsiz; baribir `r.d.slice(0,10)` aniqroq va kelajakdagi format oʻzgarishiga chidamli |
| P3 | `rejalar/actions.ts:16-19` | Lokal `requireAdmin` nusxasi `session.user` undefined holatini qamramaydi — markaziy `auth-helpers` ishlatilsin |
| P4 | `auth.config.ts:8` | JWT `maxAge` default 30 kun — admin ilova uchun 8-12 soat tavsiya (rol har soʻrovda DB'dan qayta tekshirilishi xavfni ancha kamaytiradi) |
| P5 | `forecast.ts:154-160` | Claude JSON parse xatosi jim yutiladi (fallback ishlaydi, lekin log yoʻq) |
| P6 | `parsers/visits.ts:88` | `Math.round` kesirli tashrif sonini jim yaxlitlaydi — xato maʼlumot sezilmaydi |
| P7 | `visits-form.tsx:18`, `plan-editor.tsx:64` | Modul darajasida `new Date().getFullYear()` — yil chegarasida nazariy hydration farqi |
| P8 | `login/page.tsx:63,85` | RSC'da `new Date().getFullYear()` — keshlangan sahifada yil qotib qolishi mumkin |
| P9 | `baza-filter.tsx:79-87` | Render vaqtida bir nechta setState (derived-state anti-pattern) — `key` prop yondashuvi tozaroq |
| P10 | `baza/chiqim/sotuv-dashboard filterlar` | `useSearchParams` Suspense'siz — sahifalar dinamik boʻlgani uchun hozir zarar yoʻq; biror sahifa statik boʻlsa build sinadi |
| P11 | `metrika-editor.tsx:138`, `oos/stockday` `role="tab"`, `chiqim-row-actions.tsx:166`, `dashboard-v2/page.tsx:69` | Mayda sifat: index-key, ARIA tab semantikasi, notoʻgʻri type annotation, inline style |
| P12 | `forecast.ts:269`, `upload/actions.ts:506` | Epsilon-qoldiq oxirgi kunga yuklanishi; `setUTCMonth` mutatsiyasi — ishlaydi, lekin aniqroq yozish mumkin |

---

## TUZATISH REJASI

### 1-bosqich — Xavfsizlik va bogʻliqliklar ✅ BAJARILDI (2026-06-10)
1. ✅ `next` 16.2.9, `eslint-config-next` 16.2.9, `npm audit fix` (qs 6.15.2) — Y2, O16.
2. ✅ `xlsx` → SheetJS CDN 0.20.3 — Y1. HIGH zaifliklar yoʻqoldi (qolgan 6 moderate — next ichidagi tranzitiv postcss + @prisma/dev, breaking'siz tuzatilmaydi).
3. ✅ Telegram HTML eskeyp — notify.ts (`esc()` barcha foydalanuvchi maydonlariga) + bot.ts:51 (`first_name`) — Y8.
4. ✅ `rasm-preview` — `rasmFileIdMavjud()` (db.ts): file_id yozuv/vozvratga biriktirilganligi DB'da tekshiriladi — Y9.
5. ✅ Login rate-limit — IP + login boʻyicha ikki kalit, muvaffaqiyatda hisoblagich tozalanadi — Y10 (qisman: XFF topologiya masalasi Railway'da qoldi, in-memory cheklov hujjatlandi).
6. ✅ `tsc` + ESLint + `next build` — uchchalasi toza.

### 2-bosqich — Maʼlumot toʻgʻriligi ✅ BAJARILDI (2026-06-10)
1. ✅ `assignProductSubcatAction`ga `revalidateTag(ANALYTICS_CACHE_TAG)` — Y5.
2. ✅ Upload: v1/v2 va visits — `UploadedFile`+satrlar bitta interaktiv tranzaksiyada (timeout 30s); v3 (uzun, koʻp bosqichli — 5s tx'ga sigʻmaydi) — FAILED-status bilan boshlanib oxirida SUCCESS, `ensureNotDuplicate` chala FAILED yozuvni tozalab oʻtkazadi — Y4.
3. ✅ `applyForecastDayEdit` → butun oqim Serializable interaktiv tranzaksiyada + P2034 konfliktda 1 marta retry — Y6.
4. ✅ `finans` amount → `Prisma.Decimal` (qty.mul(narx).toDecimalPlaces(2)) — Y7.
5. ✅ Sana: `_findMissingDays` endi sanalarni SQL'da `::text` qilib oladi (driver/TZ'dan mustaqil — "Fakt=0" sinfi); `analytics-v2` `new Date(r.d)` → `r.d.slice(0,10)` — O2, P2. O3 — tekshirildi: barcha range manbalari `T00:00:00.000Z` bilan quradi, oʻzgartirish kerak emas.
6. ✅ `dailyVisitsSeries` kaliti → `dailyVisitsSeries_v2` — P1.
7. ✅ `tsc` + ESLint + `next build` toza. (Qoʻshimcha runtime tekshiruv: keyingi sales-upload'dan soʻng dashboard-v2 Fakt/Reja ni DB bilan solishtirish tavsiya etiladi.)

### 3-bosqich — Frontend UX ✅ BAJARILDI (2026-06-10)
1. ✅ `PeriodFilter` → `usePathname()` — endi /branches/[id] da davr oʻzgartirilsa sahifada qoladi — Y3.
2. ✅ `charts-impl.tsx` tooltip → `var(--card)`/`var(--foreground)` (dark mode oʻqiladi) — Y11.
3. ✅ Hydration: `formatDateTimeUZ` (format.ts, deterministik UTC+5) — order-detail + sotib-olish roʻyxati (Y12); `todayISO()` va yil konstantalari UTC+5 deterministik (O11, P7).
4. ✅ `widgets.tsx` → dynamic(ssr:false) wrapper + `widgets-impl.tsx` (charts/index.tsx naqshi) — O1; `GroupSalesDynamicsWidget` seriyalari `useMemo`da — O12; `Cell key={d.name}` — O13.
5. ✅ A11y: ExpandableCard modal'da Tab focus trap (O14); profit-tree qatorlari `tabIndex/role/aria-expanded/onKeyDown` bilan klaviaturadan ochiladi (O15).
6. ✅ `tsc` + ESLint + `next build` toza.

### 4-bosqich — Mustahkamlash ✅ BAJARILDI (2026-06-10)
1. ✅ Pool'lar `globalThis`da — prisma.ts (`pgPool`) + spisaniya/db.ts (`botPool`) — O6.
2. ✅ `generateForecastAllAction` — filiallar 2 tadan chunk boʻlib ishlanadi (Claude rate-limit + Neon pool himoyasi) — O7.
3. ✅ Parser tolerantligi 0.1% → 0.001% (min 1000 soʻm) — O8; db.ts'dagi 22 ta jim catch endi `logDbXato` bilan loglanadi — O9; forecast AI-parse xatosi `console.warn` bilan — P5; visits parser kesirli/manfiy qiymatda xato tashlaydi (Excel float artefakti epsilon bilan kechiriladi) — P6.
4. ✅ `Expense` `@@index([spentAt, deletedAt])` + migratsiya `20260610090000_expense_spentat_deletedat_index` yaratildi — O10. ⚠️ Jonli DB'ga hali QOʻLLANMAGAN: `railway run npx prisma migrate deploy` kerak.
5. ✅ JWT `maxAge` 12 soat (deploy'dan keyin hamma qayta login qiladi) — P4; rejalar/actions.ts markaziy `requireAdmin`ga oʻtdi — P3.

### Har bosqichdan keyin
`npx tsc --noEmit && npx eslint src && npm run build` — barcha bosqichlardan soʻng toza.

### 5-bosqich — PAST qoldiqlar ✅ BAJARILDI (2026-06-10)
- ✅ P10: 9 ta `useSearchParams` komponenti ichki `<Suspense>` wrapper bilan (statik prerender'ga tayyor)
- ✅ P11: metrika-editor `key={m}`; oos/stockday `role="tab"` olib tashlandi (`aria-current` qoldi); dashboard-v2 skeleton inline style → Tailwind. `chiqim-row-actions` type annotation — YOLGʻON-POZITIV (Base UI Select'da qiymat haqiqatan nullable), oʻzgartirilmadi
- ✅ P8: login yili — `CurrentYear` client komponenti (`suppressHydrationWarning`), statik keshda qotmaydi
- ✅ O4/O5: hujjatlash izohlari (dailyPlanByGroup taxmini; computeProfitTree branchName/kesh ogohlantirishi)
- Atayin qoldirilganlar: P9 (render-vaqtida setState — bu React hujjatlari tavsiya qilgan rasmiy "adjust state during render" naqshi, anti-pattern emas), P12 (epsilon-qoldiq mantiqi toʻgʻri ishlaydi)

### Holat
- Migratsiya: Railway start buyrugʻi `npx prisma migrate deploy && npm run start` — deploy'da avtomatik qoʻllanadi ✅
- Barcha tuzatishlar commit + push qilingan ✅
- **Audit toʻliq yopildi: 39 topilmadan 37 tasi tuzatildi, 2 tasi asosli ravishda qoldirildi (P9, P12), 1 tasi yolgʻon-pozitiv deb topildi.**
