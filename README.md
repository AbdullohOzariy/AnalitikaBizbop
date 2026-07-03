# Analitika BizBop

Supermarket savdo analitikasi platformasi. 1C dan eksport qilingan Excel fayllarni qabul qiladi, ma'lumotlarni saqlaydi va period bo'yicha dashboard ko'rsatadi.

## Imkoniyatlar

- **3 xil Excel fayl turi** (avtomatik aniqlash):
  - Kategoriyalar bo'yicha sotuv (1 kunlik / period, 1 yoki 4 filial)
  - Cheklar metrikasi (sr.xlsx — kunlik chek soni, summasi, o'rtacha chek va h.k.)
  - Tashriflar (4 filial × kunlar)
- **Dashboard**: 4 KPI karta, kunlik dinamika, filiallar ulushi, top kategoriyalar (Fakt vs Reja), filiallar faoliyati jadvali
- **Period filter**: bugun / 7 / 30 kun / joriy oy / o'tgan oy + maxsus oraliq
- **Filial batafsil sahifasi**: har filial uchun mini-dashboard
- **Normal Reja**: oylik filial × kategoriya rejasini admin kiritadi
- **Excel export**: tanlangan davr bo'yicha 4 varaqli xlsx
- **Ko'p rolli RBAC**: SYSTEM_ADMIN (to'liq), ADMIN (asosan ko'rish + ba'zi tasdiqlash), CAT_MANAGER / HEAD_CAT_MANAGER / CEO / SUPPLYCHAIN, izolatsiyalangan MERCHANDISER (promo) va OPERATOR (chiqim). Har foydalanuvchi: asosiy rol + qo'shimcha rollar (union)
- **Dublikat oldini olish**: SHA-256 hash + (filial+sana+tip)
- **Dark mode** + **mobil moslashuv**

> **Eslatma:** README asosiy MVP oqimini tavsiflaydi. Ilova o'sgan — qo'shimcha modullar:
> **chiqim** (hisobdan chiqarish), **logistika** (ombor / taqsimot / ko'chirish), **promo**
> (aksiyalar), **sotuv/zakaz** (xarid buyurtmalari), **sverka**, **iyerarxiya**, **abc-xyz**,
> **oos/stockday**, **AI prognoz**. Shuningdek **Telegram bot + Mini App** (`src/app/api/tg`
> webhook, `bot/miniapp`) va **kunlik cron hisobotlar** (`src/instrumentation.ts` — 09:00–15:00
> orasida 5 ta ish). Arxitektura tafsilotlari: `bot/README.md`, `AGENTS.md`.

## Texnologiyalar

| Qism | Tanlov |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 |
| Stillash | Tailwind CSS 4 + shadcn/ui |
| Grafiklar | Recharts |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| DB | PostgreSQL 14+ |
| Auth | NextAuth (Auth.js v5) — Credentials |
| Excel | SheetJS (xlsx) |
| Form/Validatsiya | react-hook-form + Zod |
| Til | TypeScript |

## Lokal o'rnatish

### 1. Talablar
- Node.js 20+
- PostgreSQL 14+ (lokalda)

### 2. Sozlash

```bash
# 1. Bog'liqliklarni o'rnatish
npm install

# 2. Atrof-muhit faylini yaratish
cp .env.example .env
# DATABASE_URL ni va AUTH_SECRET ni o'zingizniki bilan tahrirlang

# 3. Database yaratish
createdb analitika

# 4. Migrations
npx prisma migrate deploy
npx prisma generate

# 5a. Filiallar + admin user
npx tsx prisma/seed.ts

# 5b. Iyerarxiya + SKU (guruh/kategoriya/subkat + 25k+ SKU) — MAJBURIY.
#     Busiz baza / iyerarxiya / analitika / abc-xyz modullari BO'SH ochiladi.
ALLOW_DESTRUCTIVE_SEED=1 npx tsx prisma/seed-sku.ts

# 6. Ishga tushirish
npm run dev
```

Brauzerda http://localhost:3000 ga kiring.

**Default admin** (faqat dev uchun): `admin@analitika.local` / `admin123`

## Loyiha tuzilmasi

```
src/
├── app/
│   ├── (app)/                  # Autentifikatsiya talab qiluvchi sahifalar
│   │   ├── dashboard/, dashboard-v2/, sotuv-dashboard/  # Dashboardlar
│   │   ├── branches/           # Filiallar va batafsil sahifa
│   │   ├── iyerarxiya/         # Guruh → kategoriya → subkategoriya tahriri
│   │   ├── chiqim/, logistika/, promo/, sotuv/, sverka/ # Domen modullari
│   │   ├── abc-xyz/, oos/, stockday/, rejalar/, report/ # Analitika
│   │   └── admin/              # Faqat admin uchun
│   │       ├── upload/         # Excel yuklash (3 ta forma)
│   │       ├── files/          # Yuklangan fayllar audit
│   │       ├── sozlamalar/     # Tizim sozlamalari (hisobot cron'lari va h.k.)
│   │       └── users/          # Foydalanuvchilar boshqaruvi
│   ├── api/
│   │   ├── auth/[...nextauth]/ # Auth.js
│   │   ├── tg/                 # Telegram webhook (bot)
│   │   └── export/             # Excel eksport
│   ├── miniapp/                # Telegram Mini App sahifalari
│   └── login/                  # Login sahifasi
├── instrumentation.ts          # Server start: cron ishlar + Telegram webhook o'rnatish
├── components/
│   ├── ui/                     # shadcn/ui komponentlari
│   └── layout/                 # Sidebar, header, theme toggle
├── lib/
│   ├── parsers/                # 3 ta Excel parser
│   ├── analytics.ts            # Period aggregation, KPI hisoblash
│   ├── format.ts               # UZS, foiz, sana formatlash
│   └── prisma.ts               # Prisma singleton
└── auth.ts, auth.config.ts     # NextAuth (split: edge / node)
```

## DB Schema (asosiy)

- **User** — id, email, passwordHash, name, role + extraRoles[] (RBAC union; ~9 rol enum)
- **Branch** + **BranchAlias** — filial va Excel ichidagi turli nomlari xaritasi
- **CategoryGroup / Category** — guruh → kategoriya → subkategoriya iyerarxiyasi (sku.xlsx'dan)
- **CategorySales** — period × filial × kategoriya → summa
- **DailyMetrics** — kunlik chek soni, summa, o'rtacha va h.k. (sr.xlsx dan)
- **DailyVisits** — kunlik tashriflar (filial×sana)
- **MonthlyPlan** — Normal Reja (filial × yil × oy × kategoriya × summa)
- **UploadedFile** — audit + dublikat oldini olish (sha256)

## Deploy (production)

### Railway + Neon

Railway uchun `package.json` scriptlari tayyor:

- `npm run build` — Prisma client generatsiya qiladi va Next.js production build yaratadi
- `npm run migrate-deploy` — production migrations ishlatadi
- `npm run start` — `next start` bilan serverni ko'taradi
- `npm run db:seed` — 4 filial va birinchi admin userni yaratadi
- `npm run db:seed-sku` — iyerarxiya + SKU master (destruktiv: `ALLOW_DESTRUCTIVE_SEED=1` talab qiladi)

Railway env vars:

```bash
DATABASE_URL="postgresql://..."
AUTH_SECRET="openssl-rand-base64-32-output"
AUTH_TRUST_HOST="true"
NEXTAUTH_URL="https://your-production-url.up.railway.app"

SEED_ADMIN_EMAIL="admin@example.com"
SEED_ADMIN_PASSWORD="strong-password"
SEED_ADMIN_NAME="Admin"
```

> To'liq ro'yxat (Telegram bot, AI kalitlari, hisobot cron yo'nalishlari, retention) —
> **`.env.example`** ga qarang. Ayniqsa `ANTHROPIC_API_KEY` (AI prognoz/kategoriyalash) va
> hisobot-bot uchligi (`INVENTORY_/MARGIN_/DELIVERY_/SPDAILY_/ZAKAZ_*`) unutilmasin —
> aks holda AI va Telegram hisobotlar jimgina o'chadi.

Railway service sozlamalari:

- Build Command: `npm run build`
- Pre-deploy Command: `npm run migrate-deploy`
- Start Command: `npm run start`

Neon database ulanganidan keyin birinchi marta:

```bash
# 1. Production build
npm run build

# 2. Strong AUTH_SECRET
openssl rand -base64 32

# 3. Migrations
npm run migrate-deploy

# 4. Boshlang'ich ma'lumotlar (filiallar + admin, so'ng iyerarxiya + SKU master)
npm run db:seed
ALLOW_DESTRUCTIVE_SEED=1 npm run db:seed-sku

# 5. Production server
npm run start
```

Railway'da seedni doimiy Start Command ichiga qo'shmang. Seedni birinchi deploydan keyin bir marta `npm run db:seed` sifatida ishga tushiring.

## Litsenziya

Privat loyiha.
