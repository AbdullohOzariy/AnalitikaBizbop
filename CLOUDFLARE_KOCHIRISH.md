# oilagroup.uz → Cloudflare ko'chirish (HTTP qabul uchun)

**Maqsad:** `http://analitika.oilagroup.uz/api/1c/ingest` ishlasin (1C shifrsiz
so'raydi). Railway `http` ni majburan `https` ga buradi va buni o'chirib
bo'lmaydi — shuning uchun oldiga Cloudflare qo'yiladi: u 80-portni qabul qiladi
va Railway'ga HTTPS bilan uzatadi.

**Xavf va uni boshqarish:** zona ko'chganda pochta (`MX`, `SPF`) ham ko'chadi.
Xato bo'lsa korxona elektron pochtasi to'xtaydi. Quyidagi ro'yxat aynan shuning
uchun to'liq sanab chiqilgan — Cloudflare avto-skani biror yozuvni topmasa,
shu jadvaldan qo'lda qo'shiladi.

---

## 1. Hozirgi zona — to'liq ro'yxat

2026-08-06 da `dig` bilan olingan. **10 ta yozuv.** DNSSEC yo'q, CAA yo'q
(ikkalasi ham ishni osonlashtiradi — oldindan o'chirish shart emas).

| # | Nom | Turi | Qiymat | Cloudflare proxy |
|---|---|---|---|---|
| 1 | `@` (oilagroup.uz) | A | `45.138.159.4` | 🔘 **DNS only** |
| 2 | `@` | MX | `10 mail.oilagroup.uz` | — |
| 3 | `@` | TXT | `v=spf1 +a +mx +ipv4:45.138.159.4 ~all` | — |
| 4 | `_dmarc` | TXT | `v=DMARC1; p=none;` | — |
| 5 | `www` | CNAME | `oilagroup.uz` | 🔘 **DNS only** |
| 6 | `mail` | A | `45.138.159.4` | 🔘 **DNS only** ⚠️ |
| 7 | `ftp` | A | `45.138.159.4` | 🔘 **DNS only** |
| 8 | `webmail` | A | `45.138.159.4` | 🔘 **DNS only** |
| 9 | `analitika` | CNAME | `3xi8jpkm.up.railway.app` | 🟠 **Proxied** ← shu bittasi |
| 10 | `*` | A | `185.183.243.161` | 🔘 **DNS only** |

> ⚠️ **`mail` ni HECH QACHON proxy qilmang.** Cloudflare faqat HTTP/HTTPS
> uzatadi — SMTP (25/465/587) va IMAP proxy orqali o'tmaydi va pochta o'ladi.
> `ftp`, `webmail`, `*` ham shunday: kulrang bulut.

**Faqat `analitika` to'q sariq (proxied) bo'ladi.** Qolgan hammasi bugungidek
qoladi — o'zgarish minimal.

`*` wildcard `panel2.eskiz.uz` ga qarab turibdi (eskiz parkovkasi). Uni ham
ko'chiring — bo'lmasa nomlanmagan subdomenlar o'zgacha ishlaydi.

---

## 2. Cloudflare sozlamalari — HTTP ishlashi uchun SHART

Ko'chirgandan keyin quyidagi uchtasi to'g'ri bo'lmasa HTTP baribir ishlamaydi:

| Sozlama | Qiymat | Nega |
|---|---|---|
| **SSL/TLS → Overview** | **Full** | `Flexible` bo'lsa Cloudflare Railway'ga HTTP bilan boradi, Railway 301 qaytaradi → **cheksiz aylanma**. ⚠️ Lekin `Full` ham HTTP so'rovni o'zi hal qilmaydi — 8-bo'limga qarang. |
| **SSL/TLS → Edge Certificates → Always Use HTTPS** | **OFF** | Yoqiq bo'lsa Cloudflare o'zi `http` ni `https` ga buradi va butun ish behuda ketadi. |
| **SSL/TLS → Edge Certificates → Automatic HTTPS Rewrites** | OFF | Xuddi shu sabab. |

Boshqa hech narsa o'zgartirilmaydi.

---

## 3. Ketma-ketlik

1. **Cloudflare'da domen qo'shish** (Free plan yetarli). Skan tugagach —
   chiqqan yozuvlarni **1-bo'lim jadvali bilan qatorma-qator solishtiring**.
   Topilmagani bo'lsa qo'lda qo'shing. Ayniqsa `MX`, `SPF` (TXT), `_dmarc`.
2. **Proxy holatini qo'ying:** faqat `analitika` — to'q sariq. Qolgani kulrang.
3. **2-bo'limdagi 3 ta sozlamani** qo'ying (Full · Always Use HTTPS OFF ·
   Automatic HTTPS Rewrites OFF).
4. **eskiz.uz da NS ni Cloudflare bergan ikkitasiga almashtiring.**
   Tarqalishi 30 daqiqa – 24 soat.
5. **Tekshirish** (quyida).

**Orqaga qaytarish:** NS ni `ns1.eskiz.uz` / `ns2.eskiz.uz` ga qaytarish kifoya.
Eskiz'dagi zona o'chmaydi, shuning uchun qaytish tez.

---

## 4. Ko'chgandan keyin tekshirish

Har birini ketma-ket bajaring. Ikkinchisi **eng muhimi — pochta**.

```bash
# 1. NS Cloudflare'ga o'tdimi
dig +short NS oilagroup.uz

# 2. POCHTA — bular ko'chishdan OLDINGIDEK bo'lishi SHART
dig +short MX oilagroup.uz          # → 10 mail.oilagroup.uz.
dig +short A  mail.oilagroup.uz     # → 45.138.159.4   (Cloudflare IP EMAS!)
dig +short TXT oilagroup.uz         # → v=spf1 +a +mx +ipv4:45.138.159.4 ~all
dig +short TXT _dmarc.oilagroup.uz  # → v=DMARC1; p=none;

# 3. Sayt
curl -sI http://oilagroup.uz | head -1

# 4. HTTP qabul — MAQSAD SHU: 301 EMAS, 404/200 bo'lsin
curl -sI http://analitika.oilagroup.uz/api/1c/ingest | head -1

# 5. HTTP orqali token bilan
curl -H "Authorization: Bearer <TOKEN>" \
     http://analitika.oilagroup.uz/api/1c/ingest
```

**4-qadam `301` qaytarsa** — «Always Use HTTPS» hali yoqiq.
**Aylanma xato (`too many redirects`)** — SSL rejimi `Flexible`, uni `Full` qiling.
**2-qadamda `mail` Cloudflare IP'sini qaytarsa** — proxy yoqilib qolgan,
darhol kulrang bulutga o'tkazing.

---

## 5. Railway custom domain haqida

Railway domenni CNAME orqali tekshiradi. Proxy yoqilganda `dig` Cloudflare
IP'sini qaytaradi va Railway panelida domen «unverified» ko'rinishi mumkin —
**trafik baribir ishlaydi**, chunki Cloudflare to'g'ri `Host` va SNI bilan
boradi.

Xavfsizroq yo'l: avval `analitika` ni **kulrang** (DNS only) qoldiring, hammasi
ishlayotganiga ishonch hosil qiling, keyin to'q sariqqa o'tkazing. HTTP faqat
to'q sariqda ishlaydi.

---

## 6. Bizning tomonda nima tayyor

HTTP kelganda ishlashi uchun kod allaqachon moslangan:

- **HSTS ingest yo'lidan olib tashlandi** (`next.config.ts`). Aks holda HSTS ni
  hurmat qiladigan mijoz so'rovni o'zi HTTPS'ga ko'tarardi va yana o'sha
  sertifikat xatosiga tushardi. Qolgan barcha sahifalarda HSTS joyida.
- **Haqiqiy IP** `cf-connecting-ip` dan olinadi (`ip-cheklov.ts`). Cloudflare uni
  o'zi qo'yadi va mijoz yuborganini o'chirib tashlaydi — soxtalashtirib bo'lmaydi.
- **HMAC imzo** tayyor (`imzo.ts`). HTTP'da token ochiq ketgani uchun **yagona
  haqiqiy himoya shu**.

### HTTP'da nima himoyalanadi, nima yo'q — ochiq gap

| | HTTPS + token | HTTP + token | HTTP + token + HMAC |
|---|---|---|---|
| Mazmunni o'qib bo'lmasligi | ✅ | ❌ | ❌ |
| Yuboruvchi haqiqiyligi | ✅ | ❌ | ✅ |
| Tana o'zgartirilmaganligi | ✅ | ❌ | ✅ |
| Eski so'rovni qayta yuborish | — | ❌ | ✅ ±5 daq. |

**Maxfiylik tiklanmaydi:** HTTP'da chek summalari va tovar nomlari yo'lda
o'qilishi mumkin. Bu HTTP tanlashning narxi — HMAC uni qoplamaydi.

### Imzo bo'yicha qaror (2026-08-06)

Loyiha egasi **imzo ishlatmaslikka** qaror qildi: summalar qo'lda ham
tekshirilar ekan, imzo integratsiyani kechiktirishga arzimaydi.

Kod o'z joyida qoladi va uxlab turadi (`onec_hmac_required = 0`). Keyinchalik
kerak bo'lsa: Sozlamalar → «1C qabul: imzo» → bitta tugma. `ONEC_INGEST_SECRET`
Railway'da allaqachon sozlangan.

Himoya hozir: **token + IP cheklovi**. Bu uzoqdagi begonani to'xtatadi, lekin
trafik yo'lidagi odamni emas.

---

## 7. Tartib

1. `ONEC_INGEST_SECRET` Railway'da — ✅ qo'yilgan (2026-08-06)
2. Kod deploy — ✅ `cbf0baa`, `2f0a296`
3. Cloudflare ko'chirildi — ✅
4. **HTTP ochish** — Worker kerak, 8-bo'limga qarang
5. 1C birinchi POST'ni yuboradi → IP avtomatik ro'yxatga olinadi

⚠️ IP ro'yxati **bo'sh** bo'lishi kerak va birinchi POST'ni **1C** qilishi shart —
kim birinchi yuborsa, IP o'shanda qulflanadi.

---

## 8. Ko'chirishdan keyin: HTTP hali 301 — sabab va yechim

**Sana:** 2026-08-06, ko'chirish tugagandan keyin aniqlangan.

### 8.1 Nima bo'ldi

Cloudflare o'tdi, pochta buzilmadi, sozlamalar to'g'ri qo'yildi
(`Full` · «Always Use HTTPS» OFF · «Automatic HTTPS Rewrites» OFF).
Lekin `http://analitika.oilagroup.uz` baribir **301** qaytardi.

Diagnoz:

| So'rov | Natija | Kim javob berdi |
|---|---|---|
| HTTPS → Cloudflare → Railway | `404` ✅ | ilova (`x-railway-request-id`, `x-railway-edge`) |
| HTTP → Cloudflare → Railway | `301` ❌ | Railway **edge**'i (`x-railway-67`) |

Railway'ga HTTPS ustidan `X-Forwarded-Proto: http`, `CF-Visitor {"scheme":"http"}`,
`X-Forwarded-Ssl: off`, `Front-End-Https: off` yuborilganda **hech qaysi**
301 keltirmadi. Ya'ni Railway header'ga emas, **ulanishning o'ziga** qaraydi.

### 8.2 Ildiz sabab (Cloudflare hujjati)

> *Full: "...makes connections to the origin **using the scheme requested by the
> visitor**. If your visitor uses `http`, then Cloudflare connects to the origin
> **using plaintext HTTP** and vice versa."*
> — developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full/

**`Full` ≠ «har doim HTTPS».** U faqat *visitor HTTPS bo'lganda* origin bilan TLS
quradi. HTTP so'rov origin'ga ham HTTP bo'lib boradi → Railway 301 qiladi.

### 8.3 Nima ISHLAMAYDI (tekshirilgan, vaqt sarflamang)

| Variant | Nega yo'q |
|---|---|
| Origin Rules → Destination port 443 | Free planda faqat **port** o'zgaradi, sxema emas. Host header/SNI override — Enterprise-only |
| SSL rejimini `Flexible` qilish | CF plain HTTP → Railway 301 → https → CF... **cheksiz aylanma** |
| Railway'da redirectni o'chirish | Bunday sozlama yo'q |
| Worker'dan `3xi8jpkm.up.railway.app` ga fetch | Railway **Host bo'yicha** marshrutlaydi. Tekshirildi: `/login` → `404`, 101 bayt. Worker'da Host'ni o'zgartirib bo'lmaydi (`resolveOverride` — Enterprise) |

### 8.4 Yechim — Cloudflare Worker

Kod: `cloudflare-worker/1c-http-korpik.js`. Worker HTTP so'rovni **o'sha
hostname**'ga, lekin `https://` bilan qayta yuboradi → Cloudflare origin'ga TLS
bilan boradi → 301 yo'q. Host o'zgarmagani uchun Railway ilovani topadi.

Aylanma yo'q: *"Routes cannot be the target of a same-zone `fetch()` call"* —
Worker'ning o'z zonasiga fetch'i origin'ga to'g'ri ketadi.

**Qadamlar (Cloudflare panelida):**

1. **Workers & Pages → Create → Start with Hello World → Deploy**
   (nom: `1c-http-korpik`)
2. **Edit code** → butun kodni `cloudflare-worker/1c-http-korpik.js` bilan
   almashtiring → **Deploy**
3. **Settings → Domains & Routes → Add → Route**
   - Zone: `oilagroup.uz`
   - Route: `http://analitika.oilagroup.uz/api/1c/*`
   - **Sxema (`http://`) ataylab yoziladi** — shunda HTTPS trafik Worker'ga
     umuman kirmaydi va o'zgarishsiz ishlayveradi. Qamrov faqat 1C yo'li.

**Limit:** Free plan — 100 000 so'rov/kun. 1C hajmi bunga yaqin ham kelmaydi.

**Xavf:** Route faqat `http://` + `/api/1c/*` bo'lgani uchun sayt, pochta va
HTTPS trafik butunlay tegilmaydi. Worker o'chirilsa — holat bugungiday bo'ladi
(301), boshqa hech narsa buzilmaydi.

### 8.5 Zaxira yechim

Worker ishlamasa: kichik VPS + nginx, `1c.oilagroup.uz` (Cloudflare'da **DNS
only** A yozuv). nginx 80-portni tinglaydi va `https://analitika.oilagroup.uz`
ga uzatadi, `Host` header'ini saqlagan holda. ~$4/oy, 100% ishlaydi.
