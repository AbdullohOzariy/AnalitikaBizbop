# bot/ — faqat miniapp manbasi

Eski mustaqil **BotBizBopSPS** (Express + Telegraf + panel) loyihasi Analitika Next
ilovasiga **birlashtirildi** — bot endi `src/lib/spisaniya/` va `src/app/api/` ichida
(webhook rejimida) ishlaydi. Eski Express/panel kodi olib tashlandi.

Bu papkada faqat **`miniapp/`** (Telegram WebApp, Vite + React) **manbasi** qoldi.

## Miniapp'ni o'zgartirish

1. `bot/miniapp/src/` ichida tahrirlang.
2. Build qiling va Next `public/`ga ko'chiring:
   ```bash
   cd bot/miniapp && npm run build
   cd ../.. && rm -rf public/miniapp && cp -r bot/miniapp/dist public/miniapp
   ```
3. Commit qiling (`public/miniapp/` ham). Deploy'da Next uni `/miniapp` da beradi.

> Miniapp `/api/*` (yozuv, vozvrat, filialar, rasm-yukla, ruxsat) endpointlari Next
> ilovasida (`src/app/api/`). Telegram WebApp `initData` HMAC bilan tekshiriladi.
