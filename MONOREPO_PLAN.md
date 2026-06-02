# Monorepo birlashtirish rejasi — AnalitikaBizBop + BotBizBopSPS

> Maqsad: ikki loyihani **bitta monorepo**ga birlashtirish. Bot (Telegram) **prod'da faol** —
> uzilishsiz ishlashi shart. **Hech qanday ma'lumot yo'qolmasligi kerak.**

## Tasdiqlangan qarorlar (2026-06-02)
1. **Bitta Railway project**, 2 service (web + bot).
2. **DB'lar ALOHIDA qoladi** — web→Neon `neondb` (Prisma), bot→`bizbop` (raw SQL). Birlashtirilmaydi. Cross-data dastur darajasida (read-only ko'prik).
3. **Eski bot token bor** — bot ko'chirishni staging'da xavfsiz test qilamiz.
4. Botning **admin panel logikasi** → Analitika **"Hisobdan chiqarish"** bo'limiga ko'chiriladi (alohida panel kerak emas). Bot+miniapp Telegram tomonda qoladi.

## Target struktura
```
AnalitikaBizBop/ (monorepo, mavjud git repo)
├── pnpm-workspace.yaml, turbo.json, package.json (workspaces)
├── apps/web/   ← hozirgi Analitika (Next.js)
├── apps/bot/   ← BotBizBopSPS butunligicha (server/bot/panel/db/miniapp/Dockerfile) — O'ZGARMAYDI
└── packages/db/ ← Prisma (ixtiyoriy ajratish)
```
- pnpm + turbo. Bot **CommonJS** qoladi, ESM'ga aylantirilmaydi, o'z Dockerfile'i bilan.
- Telegraf **webhook** rejimida, long-running — serverless'ga ko'chirilmaydi.

## DB (alohida)
- web→`neondb`, bot→`bizbop`. Prisma HECH QACHON `bizbop`'ni migrate qilmaydi.
- Web bot ma'lumotini `src/lib/bot-db.ts` (read-only `pg.Pool`, `BOT_DATABASE_URL`) orqali o'qiydi.
- Yozish (vozvrat status, yozuv tahrir) — bot HTTP API orqali (bot o'zi yozadi + Telegram xabar). Server-server auth uchun umumiy maxfiy token kerak bo'ladi.

## Deploy (Railway, 1 project)
- **web** service: Root `apps/web`, release `prisma migrate deploy` (faqat public schema), start `next start`, domen analitika.oilagroup.uz.
- **bot** service: Root `apps/bot`, mavjud **Dockerfile/railway.toml/WEBHOOK_URL/domen O'ZGARMAYDI**, start `node server/index.js`.
- Railway Watch Paths: har service faqat o'z papkasi o'zgarsa deploy bo'ladi.

## Bot panel → "Hisobdan chiqarish" (funksiyalar)
Bot panel API'lari (server/index.js) — web'da qayta yaratiladi:
- Ko'rish: `/api/yozuvlar`, `/api/statistika`, `/api/dashboard` → read-only `bot-db.ts`.
- Vozvrat nazorati: `PATCH /api/vozvrat/:id` (status) → bot API chaqiruvi.
- Yozuv tahrir/o'chirish: `PATCH/DELETE /api/yozuv/:id` → bot API.
- Sozlamalar: filial/kategoriya/guruh CRUD, parol → bot API.
- Rasm ko'rish: `/api/rasm-preview/:fileId`. Eksport: `/api/eksport`.

## Bosqichlar (har biri rollback bilan, prod bot tirik)
0. **Backup** (MAJBURIY): `bizbop` snapshot + `pg_dump`, Neon branch, ikkala repo `git bundle`.
1. Monorepo skeleti + web→`apps/web` (`git mv`). Web build test. Railway web Root→`apps/web`. **Bot tegilmaydi.**
2. Bot→`apps/bot` (`git subtree`, tarix saqlab). Dockerfile/start bayt-bayt bir xil. **Staging bot token'da test**, keyin prod bot Root→`apps/bot`. Eski deploy 1 hafta passiv.
3. Barqarorlikni kuzatish (1 hafta).
4. (ixtiyoriy) `packages/db` ajratish.
5. "Hisobdan chiqarish" — ko'rish (read-only bridge, allaqachon Faza 1 bor) kengaytirish: statistika/dashboard.
6. Vozvrat boshqaruvi + sozlamalar → bot API orqali (server-server token).
7. Eski 2 repo deploy'larini o'chirish (hammasi barqaror bo'lgach).

## Eng katta xatarlar
- Prod bot uzilishi → Dockerfile/WEBHOOK bir xil + staging test + passiv eski deploy (rollback).
- Telegram webhook → URL/domen o'zgarmaydi.
- Ma'lumot yo'qolishi → 0-backup majburiy; `bizbop`'ga yozish yo'q (read-only); DB birlashtirilmaydi.
- Prisma drift → `bizbop`'ga migrate yo'q.
- Nojo'ya deploy → Railway Watch Paths.

## Holat
- Faza 1 (read-only ko'prik + /chiqim) — DONE (push a11e270).
- Keyingi: Qadam 0 backup → Qadam 1 monorepo skeleti.
