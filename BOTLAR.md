# Telegram botlar — yagona ma'lumotnoma

> Bu faylda **token qiymatlari YO'Q** va bo'lmasligi ham kerak — faqat env nomlari.
> Qiymatlar Railway panelida (production) va lokal `.env` da yashaydi.

Kod `process.env.*BOT_TOKEN` ni **9 xil nom** bilan o'qiydi, lekin bu 9 ta bot degani emas.
Ikki sinfga bo'linadi:

| Sinf | Nima | Nechta |
|---|---|---|
| **A. Shaxsiyatli bot** (identity) | Telegram tarafda alohida bot: o'z nomi, @username'i, menyusi bor | **3** |
| **B. Yuboruvchi token sloti** | Faqat `sendMessage`/`sendDocument` qiladi; qaysi bot ekani sozlamaga bog'liq | 6 |

**B sinfidagi 6 ta slot bir xil botga ham, alohida botlarga ham ko'rsatishi mumkin** — buni
kod bilmaydi, faqat Railway env / `/admin/sozlamalar` dagi qiymat hal qiladi. Shuning uchun
"bizda nechta bot bor?" degan savolga javob: **kodda 3 ta shaxsiyatli bot**, ustiga
hisobotlar uchun qancha token kiritilgan bo'lsa — shuncha.

---

## A. Shaxsiyatli botlar (3 ta)

| # | Bot | Token env | Webhook | Update qabul qiladimi |
|---|---|---|---|---|
| 1 | Spisaniya ("BizBop") — asosiy | `BOT_TOKEN` | `/api/tg` | ✅ ha |
| 2 | Mijozlar guruhi (Community) | `GROUP_BOT_TOKEN` | `/api/tg-group` | ✅ ha (faqat tinglaydi) |
| 3 | BizbopSotuv | `SOTUV_BOT_TOKEN` | ❌ yo'q | ❌ yo'q |

### 1. Spisaniya boti — `BOT_TOKEN`

Yagona to'liq interaktiv bot. Telegraf singleton (`globalThis.__spisaniyaBot`).

- **Kod:** [src/lib/spisaniya/bot.ts](src/lib/spisaniya/bot.ts) · webhook [src/app/api/tg/route.ts](src/app/api/tg/route.ts)
- **Buyruqlar:** `/start` — rolni tekshirib (`ruxsatBormi` / `sverkaRuxsatBormi` / `driverRuxsatBormi`)
  bitta "🚀 Boshlash" WebApp tugmasini beradi (`${WEBHOOK_URL}/miniapp/kirish`);
  `/panel` — faqat `ADMIN_IDS` uchun.
- **Bu bot ostidagi mini app'lar:** spisaniya (chiqim), sverka, logistika, kirish marshrutlovchisi.
  **Ular ALOHIDA BOT EMAS** — bitta bot ichidagi turli WebApp sahifalari.
- **Chiqish:** spisaniya/vozvrat xabarlari, rasm yuklash (`sendPhoto`), zakaz/logistika
  xabarlari, cron xato alertlari.
- **Yana shu token bilan:** barcha miniapp `initData` HMAC tekshiruvi (standart kalit),
  `telegramFileUrl()`, logistika `notify.ts` dagi raw `fetch`.

### 2. Mijozlar guruhi boti — `GROUP_BOT_TOKEN`

Marketing → Community bo'limi uchun. Alohida Telegraf instansiyasi (`globalThis.__tgGroupBot`).

- **Kod:** [src/lib/tg-group/bot.ts](src/lib/tg-group/bot.ts) · webhook [src/app/api/tg-group/route.ts](src/app/api/tg-group/route.ts)
- **Handlerlar:** `message`, `edited_message`, `my_chat_member`. Guruhga **hech narsa yozmaydi**.
- **NEGA ALOHIDA BOT:** guruhdagi oddiy xabarlarni ko'rish uchun BotFather'da
  **Privacy mode → Disable** kerak, u esa **botga global sozlama**. Spisaniya botida
  o'chirilsa, u ham barcha guruhlarda hamma xabarni ola boshlardi.
- **Xabarlar:** `TgGroupMessage` jadvaliga (`source='LIVE'`). O'tmish — Telegram Desktop
  JSON eksportidan (`source='EXPORT'`), [scripts/tg-group-import.ts](scripts/tg-group-import.ts), idempotent.

### 3. BizbopSotuv boti — `SOTUV_BOT_TOKEN`

Eng chalkash bot: **kod uni faqat imzo tekshirish uchun ishlatadi**. Telegraf instansiyasi
qurilmaydi, webhook yo'q, hech narsa yubormaydi. Mini app menyu tugmasi **BotFather tomonida**
sozlangan — repoda uning izi yo'q.

- **Kod:** [src/app/api/miniapp-sotuv/auth.ts](src/app/api/miniapp-sotuv/auth.ts) · UI `/miniapp/sotuv`
- Butun repoda `verifyInitData` ga 3-argument (boshqa token) **faqat shu yerda** uzatiladi.

---

## B. Yuboruvchi token slotlari (6 ta)

Hammasi bir xil naqsh: `new Telegram(cfg.token)` (telegraf'ning `Telegram` klassi — update
qabul qilmaydi), token/chat/topic manbasi **`process.env.X` → `AppSetting['X']` → null**,
5 daqiqalik modul-ichi kesh, sozlash UI'si `/admin/sozlamalar` da.

| Modul | Token env | Vaqt | Avto-yoqish kaliti (faqat DB) |
|---|---|---|---|
| Inventarizatsiya | `INVENTORY_BOT_TOKEN` | 14:00 | ⚠️ **yo'q — shartsiz ishlaydi** |
| Narx farqi (PDF) | `NARX_REPORT_BOT_TOKEN` | 11:00 | ⚠️ `NARX_REPORT_AUTO` (`_ENABLED`siz!) |
| Marja minus | `MARGIN_BOT_TOKEN` | 15:00 | `MARGIN_AUTO_ENABLED` |
| Yetkazish kechikishi | `DELIVERY_BOT_TOKEN` | 10:00 | `DELIVERY_AUTO_ENABLED` |
| Spisaniya kunlik | `SPDAILY_BOT_TOKEN` | 09:30 | `SPDAILY_AUTO_ENABLED` |
| Zakaz PDF | `ZAKAZ_BOT_TOKEN` | cron emas — zakaz `ACCEPTED` bo'lganda | `ZAKAZ_AUTO_ENABLED` |

Har birida `<PREFIX>_GROUP_CHAT_ID` va `<PREFIX>_TOPIC_ID` juftligi ham bor.
Avto-yoqish bayroqlari **env'dan o'qilmaydi**, faqat `AppSetting` dan va qiymati aynan `"1"`.

---

## Env o'zgaruvchilari

**Umumiy:**

| Env | Ma'nosi |
|---|---|
| `BOT_TOKEN` | Asosiy bot + initData standart kaliti + webhook secret manbasi |
| `GROUP_BOT_TOKEN` | Community boti (Privacy mode o'chiq bo'lsin) |
| `SOTUV_BOT_TOKEN` | BizbopSotuv — berilmasa `BOT_TOKEN` ga fallback |
| `WEBHOOK_URL` | Tashqi bazaviy URL — ikkala webhook manzili va WebApp tugmalari shundan quriladi |
| `ADMIN_IDS` | Vergul bilan; `/panel` — hammaga, cron alerti — **faqat birinchisiga** |
| `BOT_DATABASE_URL` | Meros **bizbop** bazasi (`yozuvlar`, `vozvratlar`, `filialar.topic_id`, `sozlamalar`) — Prisma boshqarmaydi |

**Guruh/topic:** `GROUP_CHAT_ID` (spisaniya), `SVERKA_GROUP_CHAT_ID`,
`LOGISTIKA_GROUP_CHAT_ID` + `LOGISTIKA_TOPIC_ID`, va 6 ta hisobot juftligi.

---

## ⚠️ Tuzoqlar — adashish shu yerlarda bo'ladi

**1. Yangi `/api/tg-*` route PUBLIC ro'yxatga QO'LDA qo'shilishi kerak.**
[src/auth.config.ts](src/auth.config.ts) dagi `PUBLIC_PREFIXES` moslik **aniq segment**
bo'yicha: `pathname === p || pathname.startsWith(p + "/")`. Ya'ni `"/api/tg"` yozuvi
`/api/tg-group` ni **QAMRAMAYDI** — u alohida yozilgan. Unutilsa: Telegram webhook'i
login'ga yo'naltiriladi va bot **jimgina** ishlamaydi (Telegram 200 dan boshqa javobni
qayta urinib ko'radi, loglarda esa hech qanday xato ko'rinmaydi).

**2. Webhook `secret_token` = `sha256(token)`, tokenning o'zi emas.**
Har update'da `x-telegram-bot-api-secret-token` header `timingSafeEqual` bilan solishtiriladi;
mos kelmasa **404** (503 emas — endpoint borligi oshkor bo'lmasin).
**Oqibat: bot tokenini almashtirsangiz secret ham o'zgaradi** — server qayta ishga tushib
`setWebhook` qilmaguncha barcha update'lar 404 bo'ladi.

**3. Env HAR DOIM `AppSetting` dan ustun.**
Admin `/admin/sozlamalar` da tokenni/chat ID'ni o'zgartiradi, lekin Railway'da o'sha nomli
env tursa — **UI'dagi qiymat hech qachon ishlamaydi va interfeys buni aytmaydi**.
Ustiga 5 daqiqalik kesh bor.

**4. `SOTUV_BOT_TOKEN` fallback jimgina noto'g'ri botga bog'laydi.**
`process.env.SOTUV_BOT_TOKEN || process.env.BOT_TOKEN` — qo'yilmasa sotuv miniapp'i asosiy
bot bilan ochilib **ishlayveradi**; keyin qo'yilsa, asosiy botdan ochilgan eski havolalar
401 bera boshlaydi.

**5. Token log'ga sizadi — `redact` majburiy.**
Telegram xatosi matnida token URL ichida keladi
(`https://api.telegram.org/bot<TOKEN>/setWebhook failed…`). Shuning uchun `catch` bloklarida
xato obyekti **to'g'ridan-to'g'ri log qilinmaydi**: [src/lib/tg-redact.ts](src/lib/tg-redact.ts) —
`redactForLog` (log uchun), `redactError` (foydalanuvchi/Telegram uchun).
Shu sababdan `/api/rasm-preview/[fileId]` faylni **redirect qilmay, server tomonda proxy**
qiladi — aks holda token brauzer Network panelida ko'rinardi.

**6. Chat/topic ID lar 4 xil joydan keladi.**
(1) env; (2) asosiy Postgres `AppSetting`; (3) **bizbop meros bazasi** (`sozlamalar.GROUP_CHAT_ID`,
`filialar.topic_id`); (4) Prisma `Branch.sverkaTopicId`. "Topic ID qayerda?" savoliga yagona
javob yo'q — qaysi modul ekaniga qarab.

**7. "Sverka bot", "Logistika bot" — bot emas.**
`AccessSurface` enumida `BOT_SPISANIYA`/`BOT_SVERKA`/`BOT_LOGISTIKA`/`BOT_KIRISH` bor va
`/admin/kirishlar` da alohida ko'rsatiladi — bular **mantiqiy yorliqlar**, hammasi bitta
`BOT_TOKEN` boti. Faqat `BOT_SOTUV` alohida token.

**8. Guruh boti tarixni o'qiy olmaydi.**
Bot API'da guruh tarixiga kirish metodi **yo'q** — "shu sanadan boshla" ham mumkin emas.
Bot faqat qo'shilgandan keyingi update'larni oladi. O'tmish faqat Telegram Desktop
JSON eksporti orqali.

**9. `bot/miniapp/` — bu MANBA, jonli fayl `public/miniapp/` da.**
`npm run build:miniapp` build qilib `public/miniapp` ga ko'chiradi va u **repoga commit
qilinadi**. Manbani tahrirlab build qilmasangiz jonli miniapp o'zgarmaydi.

---

## Arxitektura eslatmalari

- **Polling YO'Q.** Butun repoda `bot.launch()`/`getUpdates` yo'q; atigi ikkita `setWebhook`
  bor — ikkalasi ham [src/instrumentation.ts](src/instrumentation.ts) da, server start'da.
- **Botlar alohida servis emas** — Next jarayoni ichida ko'tariladi (Railway doimiy server).
  Repoda `railway.json`/`Procfile`/`Dockerfile` yo'q; Railway start command'i:
  `npx prisma migrate deploy && npm run start` — ya'ni **migratsiyalar deployda avtomatik**.
- **`register()` tartibi:** guruh boti webhook'i AVVAL o'rnatiladi, `BOT_TOKEN` tekshiruvi
  keyin — ya'ni bittasi yo'q bo'lsa ikkinchisi baribir ishlaydi.
- **Cron:** 7 ta ish, `Asia/Tashkent`, `runCron` bilan (kunni `CronRun` orqali egallaydi →
  dublikat bo'lmaydi; xatoda 60s dan keyin 1 marta retry; yakunda `ADMIN_IDS[0]` ga alert).
- **`MONOREPO_PLAN.md` dagi `apps/bot` + Dockerfile — amalga oshirilmagan reja**, joriy
  holat emas.
