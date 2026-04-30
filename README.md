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
- **2 rolli foydalanuvchi**: Admin (yuklash, sozlash) va Ko'ruvchi (faqat ko'rish)
- **Dublikat oldini olish**: SHA-256 hash + (filial+sana+tip)
- **Dark mode** + **mobil moslashuv**

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

# 5. Boshlang'ich ma'lumotlar (4 filial, 18 kategoriya, admin user)
npx tsx prisma/seed.ts

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
│   │   ├── dashboard/          # Asosiy dashboard
│   │   ├── branches/           # Filiallar va batafsil sahifa
│   │   ├── categories/         # Kategoriyalar ro'yxati
│   │   └── admin/              # Faqat admin uchun
│   │       ├── upload/         # Excel yuklash (3 ta forma)
│   │       ├── files/          # Yuklangan fayllar audit
│   │       ├── plans/          # Normal reja kiritish
│   │       └── users/          # Foydalanuvchilar boshqaruvi
│   ├── api/
│   │   ├── auth/[...nextauth]/ # Auth.js
│   │   └── export/             # Excel eksport
│   └── login/                  # Login sahifasi
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

- **User** — id, email, passwordHash, name, role (ADMIN/VIEWER)
- **Branch** + **BranchAlias** — filial va Excel ichidagi turli nomlari xaritasi
- **Category** — 18 ta bo'lim
- **CategorySales** — period × filial × kategoriya → summa
- **DailyMetrics** — kunlik chek soni, summa, o'rtacha va h.k. (sr.xlsx dan)
- **DailyVisits** — kunlik tashriflar (filial×sana)
- **MonthlyPlan** — Normal Reja (filial × yil × oy × kategoriya × summa)
- **UploadedFile** — audit + dublikat oldini olish (sha256)

## Deploy (production)

VPS uchun tayyorlanish:

```bash
# 1. Build
npm run build

# 2. AUTH_SECRET ni almashtiring
openssl rand -base64 32

# 3. DATABASE_URL ni production DB ga yo'naltiring
# 4. Migrations
npx prisma migrate deploy

# 5. Birinchi admin yaratish (alohida script bilan yoki seed orqali)
# 6. Process manager: pm2/systemd + reverse proxy: nginx/caddy
npm start
```

## Litsenziya

Privat loyiha.
