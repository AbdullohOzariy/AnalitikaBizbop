# BotBizBopSPS → AnalitikaBizBop integratsiya rejasi

> ⚠️ **ESKIRGAN (2026-07):** bu rejadagi "read-only ko'prik / bot alohida Railway
> servisda qoladi" yondashuvi QO'LLANMAGAN. Amalda bot to'liq shu Next ilova ichiga
> ko'chirilgan (`src/lib/spisaniya/`, `src/app/api/tg` webhook; `instrumentation.ts`
> webhook o'rnatadi). Hozirgi arxitektura uchun **`bot/README.md`** ga qarang.
> Quyidagi matn tarixiy hujjat sifatida saqlanmoqda.

> Maqsad: prod'da faol ishlayotgan **BotBizBopSPS** (spisaniya-bot) ma'lumotlarini
> **AnalitikaBizBop** platformasiga **ehtiyotkorlik bilan**, prod xizmatga uzilishsiz qo'shish.
>
> Asosiy tamoyil: **botga va uning `bizbop` bazasiga YOZISH tarafidan tegmaslik.**
> Bot Railway'da, o'z Telegraf process'ida, o'z bazasida ishlashda davom etadi.
> Analitika unga faqat **read-only** ulanib ma'lumotni ko'rsatadi.

Holat: **REJA** (kod o'zgartirilmagan). Kengash: Architect + PM, 2026-06-01.

---

## 1. Hozirgi holat (faktlar)

| Jihat | AnalitikaBizBop | BotBizBopSPS |
|---|---|---|
| Stek | Next.js 16, React 19, Prisma 7, NextAuth v5, Tailwind/shadcn | Express 4 + Telegraf 4 + Vite/React miniapp + vanilla JS panel |
| DB qatlami | Prisma ORM + migratsiyalar | Raw SQL, `pg` Pool (ORM yo'q) |
| Deploy | Railway | Railway (Dockerfile, `node server/index.js`) |
| DB (lokal) | `localhost:5432/analitika` | `localhost:5432/bizbop` |
| Auth | NextAuth v5, `User.role` (ADMIN/VIEWER/CAT_MANAGER), bcrypt | express-session + ENV parol; bot uchun `ADMIN_IDS` |
| AI | DeepSeek (CategoryAlias matching) | Anthropic Claude Haiku (mahsulot kategoriyalash) |
| Domen | **Savdo** (kirim) analitikasi | **Chiqim** (spisaniya/vozvrat/kafe/ovqatlanish) |

**Muhim:** ikki **alohida** baza (`analitika` va `bizbop`). Prod'da ikkalasi ham Railway'da
→ private network orqali ulanish mumkin. Postgres'da to'g'ridan-to'g'ri cross-DB join yo'q,
shuning uchun Analitika serveridan **ikkinchi ulanish** (`pg.Pool`) orqali `bizbop` o'qiladi.

### Bot DB sxemasi (`bizbop`, o'qiladigan jadvallar)

```
yozuvlar(
  id, tur ∈ {spisaniya,vozvrat,kafe,ovqatlanish}, tovar, miqdor, birlik,
  summa DECIMAL(15,2), sabab, filial, firma, kafe_nomi,
  xodim_ism, xodim_username, xodim_id, rasm_file_id, guruh_message_id,
  kategoriya, vaqt TIMESTAMP, status
)
kategoriyalar(id, nomi UNIQUE, yaratilgan)
vozvrat_nazorat(id, yozuv_id → yozuvlar, status ∈ {kutilmoqda,jarayonda,bajarildi,rad_etildi}, firma_javob, muddat, ...)
filialar(id, nomi UNIQUE, aktiv, topic_id)   -- MegaCenter, SmartCity, Oila SM, GoldMart
sozlamalar(kalit, qiymat)
```

### Filial mosligi (deyarli 1:1)

| Bot `filialar.nomi` | Analitika `Branch.name` |
|---|---|
| MegaCenter | Mega Center |
| SmartCity | Smart City |
| Oila SM | Oila SM (aniq mos) |
| GoldMart | Gold Mart |

Nomlar bo'shliq/registr bilan farq qiladi → aniq mapping kerak (qo'lda yoki normalizatsiya bilan).

---

## 2. Biznes qiymati

Hozir savdo (Analitika) va chiqim (bot) **hech qachon bitta ekranda emas**. Birlashganda:

- **Real marja** = Savdo − (tannarx + spisaniya + vozvrat). Analitika'da allaqachon `marjaBreakdown`
  (tannarx) bor — ustiga spisaniya qo'shilsa haqiqiy foyda chiqadi.
- **Filial samaradorligi** — qaysi filial ko'p spisaniya qiladi.
- **Kategoriya zararlanishi** — qaysi kategoriyada chiqim yuqori, savdo past.
- **Vozvrat nazorati** — firmalar bilan hisob-kitob bitta joyda.

---

## 3. Tanlangan yondashuv

**Bosqichli "ma'lumot ko'prigi" (read-only bridge), keyin kerak bo'lsa kattalashtirish.**

Rad etilgan variantlar va sabab:
- **DB'larni birlashtirish** — qaytarib bo'lmaydigan, prod'ga yuqori risk. Keyinga (Faza 3 qarori).
- **Botni Next.js'ga ko'chirish** — Telegraf uzoq-yashovchi process, serverless'ga yaramaydi; eng katta risk, eng kam darhol foyda.
- **Panel/miniapp'ni ko'chirish** — UX optimizatsiyasi, integratsiya zarurati emas. Faza 2+.

---

## 4. Bosqichlar

### Faza 0 — Tayyorgarlik (botga 0 ta o'zgarish)

- [ ] `bizbop` bazasidan **backup / Railway snapshot**.
- [ ] Bot DB'da **read-only rol** yaratish (faqat Analitika uchun):
  ```sql
  CREATE ROLE analitika_reader WITH LOGIN PASSWORD '***';
  GRANT CONNECT ON DATABASE bizbop TO analitika_reader;
  GRANT USAGE ON SCHEMA public TO analitika_reader;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO analitika_reader;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT TO analitika_reader;
  ```
  > Bu rol faqat `SELECT` qila oladi — botga yozish/DDL imkonsiz.
- [ ] Railway private network orqali ulanishni tekshirish (bot PG host → Analitika service).

### Faza 1 — MVP: Chiqimlar Analitika dashboardida (read-only)

Maqsad: dashboard-v2'da davr (period) filtriga bo'ysunuvchi "Chiqimlar" bo'limi.

Yangi/tegiladigan fayllar (Analitika tomonida, **hammasi yangi yoki additive**):

| Fayl | Vazifa |
|---|---|
| `.env` / `.env.example` | `BOT_DATABASE_URL` qo'shish (read-only rol bilan) |
| `src/lib/bot-db.ts` *(yangi)* | Bot bazasiga alohida `pg.Pool` (Prisma EMAS); singleton, faqat o'qish |
| `src/lib/analytics-spisaniya.ts` *(yangi)* | `SELECT`-only agregatsiya funksiyalari (quyida) |
| `src/lib/branch-map.ts` *(yangi)* | Bot `filial` matni → Analitika `branchId` normalizatsiya/map |
| `src/app/(app)/dashboard-v2/widgets.tsx` | `SpisaniyaWidget` qo'shish (additive) |
| `src/app/(app)/dashboard-v2/page.tsx` | Widgetni Suspense bilan ulash (additive) |

`analytics-spisaniya.ts` funksiyalari (barchasi `WHERE vaqt BETWEEN $start AND $end`):
- `spisaniyaSummary(range)` → tur bo'yicha jami summa (spisaniya/vozvrat/kafe/ovqatlanish)
- `spisaniyaByBranch(range)` → filial × jami
- `spisaniyaByCategory(range)` → kategoriya × jami (top N)
- `vozvratStatusBreakdown(range)` → status bo'yicha son/summa

**Xavfsizlik qoidalari (Faza 1):**
- Faqat parametrlangan `SELECT`. Hech qanday `INSERT/UPDATE/DELETE/DDL`.
- Bot DB ulanmasa — `try/catch`, widget "ma'lumot yo'q" ko'rsatadi, sahifa **crash bo'lmaydi**.
- Feature-flag: `BOT_DATABASE_URL` bo'sh bo'lsa butun bo'lim o'chadi (graceful).
- Rol/ko'rinish: faqat ADMIN (yoki ADMIN+VIEWER) ko'radi — qarori Faza 1 boshида aniqlanadi.

**Muvaffaqiyat kriteriysi:**
- [ ] Dashboard-v2'da davr filtriga ko'ra spisaniya/vozvrat/kafe summalari ko'rinadi.
- [ ] Filial breakdown ishlaydi (mapping to'g'ri).
- [ ] Botda 0 ta uzilish; bot kodida 0 ta o'zgarish.

**Rollback:** `BOT_DATABASE_URL`ni bo'shatish yoki yangi fayllarni o'chirish. Botga ta'sir nol.

### Faza 2 — Branch mapping rasmiylashtirish + (ixtiyoriy) vozvrat boshqaruvi

- [ ] `AliasSource` enum'ga `SPISANIYA` qo'shish (Analitika schema, migratsiya). Bot 4 filiali
      `BranchAlias`'ga `SPISANIYA` source bilan kiritiladi — `branch-map.ts` o'rniga DB-driven mapping.
- [ ] *(ixtiyoriy)* Vozvrat statusini Analitika ADMIN panelidan yangilash. **Diqqat:** bu yozish amali —
      bot DB'ga to'g'ridan-to'g'ri yozilmaydi, balki **bot API'siga** `PATCH /api/vozvrat/:id`
      chaqiriladi (bot o'zi yozadi). Eski `/panel` URL parallel ochiq qoladi (kamida 4 hafta).
- Prod riski: 🟡 past.

### Faza 3 — To'liq marja dashboard + DB strategiyasi qarori

- [ ] "Savdo − Chiqim = real foyda" widget (kategoriya × filial × davr).
- [ ] Shu yerda hal qilinadi: read-only ko'prik yetarlimi yoki bitta DB / monorepo (Railway 2 service)
      kerakmi. Faqat Faza 1 dan real foyda ko'rilgach.

---

## 5. Ma'lumot modeli kelishuvi (qoidalar)

1. **Branch = yagona haqiqat manbai.** Bot filiali → `BranchAlias` (SPISANIYA) orqali bog'lanadi.
   Bot `filialar` jadvali o'zgarmaydi.
2. **Kategoriyalar majburan birlashtirilmaydi** — savdo kategoriyasi ≠ spisaniya kategoriyasi.
   Kerak bo'lsa keyin alias orqali.
3. **Hard FK yo'q** ikki domen orasида — bog'lanish faqat application-level mapping.
4. **Prisma `bizbop` jadvallariga tegmaydi** — agar kelajakda introspect kerak bo'lsa `prisma db pull`,
   hech qachon `migrate` emas (drift botni buzmasligi uchun).

---

## 6. Asosiy xatarlar va kamaytirish

| # | Xatar | Kamaytirish |
|---|---|---|
| 1 | Bot to'xtab qolishi | Faza 1 faqat read-only rol; botga DDL/yozish yo'q |
| 2 | Analitika bot DB'ni o'qiy olmasa | `try/catch` + feature-flag; sahifa crash bo'lmaydi |
| 3 | Bot sxemasi o'zgarsa (drift) | Integratsiya so'rovlari minimal ustunlarga tayanadi; sxema o'zgarishida checklist |
| 4 | Filial nomlari mos kelmasligi | Normalizatsiya + `SPISANIYA` alias (Faza 2) |
| 5 | Ikki auth modeli | Faza 1'da ADMIN-only ko'rsatish; RBAC kengaytmasi keyin |
| 6 | Xodimlar ish jarayoni uzilishi | Bot va `/panel` parallel ochiq qoladi; hech narsa olib tashlanmaydi |

---

## 7. Ochiq savollar (tasdiqlash kerak)

1. Faza 1'da chiqimlarni **kim ko'radi** — faqat ADMIN, yoki VIEWER ham?
2. Railway private network orqali Analitika service `bizbop` PG'ga ula oladimi (tarmoq/credential)?
3. Faza 2'da vozvrat boshqaruvi kerakmi, yoki faqat ko'rsatish yetarlimi?
4. AI provayderlar (DeepSeek vs Claude Haiku) — bittaga keltirilsinmi yoki ikkalasi qolsinmi (keyingi masala).

---

## 8. Birinchi amaliy qadam (tasdiqlangach)

1. `bizbop`'da `analitika_reader` read-only rol.
2. Analitika `.env`'ga `BOT_DATABASE_URL`.
3. `src/lib/bot-db.ts` — read-only `pg.Pool`.
4. dashboard-v2'ga "Chiqimlar" kartasi — `SELECT SUM(summa) ... GROUP BY tur/filial`.

> Bu qadam botga **0 ta** ta'sir qiladi. Yoqmasa — bir nechta fayl o'chiriladi.
