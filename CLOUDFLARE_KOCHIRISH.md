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
| **SSL/TLS → Overview** | **Full** | `Flexible` bo'lsa Cloudflare Railway'ga HTTP bilan boradi, Railway 301 qaytaradi → **cheksiz aylanma**. `Full` = CF→Railway HTTPS bilan. |
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

Shuning uchun **HTTP yoqilishi bilan imzo majburiy qilinishi kerak**:
Sozlamalar → «1C qabul: imzo» → *Imzoni majburiy qilish*. Tugma faqat barcha
so'rovlar imzolangani ko'ringandan keyin yoqiladi.

---

## 7. Tartib (buzilmasin)

1. `ONEC_INGEST_SECRET` Railway'da — ✅ **qo'yilgan** (2026-08-06)
2. Kod deploy qilinadi (HMAC + HSTS o'zgarishi)
3. 1C jamoasiga kalit beriladi, ular imzolashni qo'shadi
4. Sozlamalarda «necha so'rov imzolangan» tekshiriladi
5. Cloudflare ko'chiriladi, HTTP ochiladi
6. **Imzo majburiy qilinadi**

⚠️ 3-qadam 1-qadamdan oldin bo'lsa, imzoli so'rovlar `401` oladi
(«Server tomonda imzo kaliti sozlanmagan»). Tartib shuning uchun muhim.
