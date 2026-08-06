# 1C → Analitika: ulanish qo'llanmasi

Bu hujjat 1C dasturchilari uchun. Ma'lumot qayerga, qanday va qanday himoya bilan
yuborilishi yozilgan.

---

## 1. Manzil va token

```
POST  https://analitika.oilagroup.uz/api/1c/ingest
GET   https://analitika.oilagroup.uz/api/1c/ingest      ← ulanishni tekshirish
```

Har bir so'rovda token bo'lishi shart:

```
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

Token alohida beriladi (bu hujjatda yozilmaydi).

**Tekshirish** — brauzer emas, `curl` bilan:

```bash
curl -H "Authorization: Bearer <TOKEN>" \
     https://analitika.oilagroup.uz/api/1c/ingest
```

Javobda `"ok": true` chiqsa — ulanish bor. `404` chiqsa — token noto'g'ri.

Javobdagi foydali maydonlar:

| Maydon | Ma'nosi |
|---|---|
| `yourIp` | Bizga sizning qaysi IP'ingiz ko'rinyapti |
| `ipAllowed` | Shu IP ruxsat ro'yxatidami |
| `serverTime` | Bizning server soati (unix soniya) — o'zingiznikini solishtiring |

---

## 2. HTTPS muammosi — avval shuni tekshiring

Agar 1C dan yuborganda **sertifikat xatosi** chiqayotgan bo'lsa, HTTP ga o'tishning
hojati yo'q. Bu 1C tomonda bir qator kod bilan hal bo'ladi.

### Yechim: sertifikat tekshiruvini o'chirish

```bsl
// Sertifikatlarni tekshirmasdan ulanish.
// Trafik BARIBIR shifrlangan qoladi — faqat sertifikat tekshirilmaydi.
Ulanish = Новый HTTPСоединение(
    "analitika.oilagroup.uz",
    443,
    ,               // foydalanuvchi
    ,               // parol
    ,               // proksi
    60,             // taymaut, sek
    Новый ЗащищенноеСоединениеOpenSSL(, )   // ← ikkala parametr bo'sh
);
```

`ЗащищенноеСоединениеOpenSSL(, )` — ikkala parametr bo'sh bo'lsa, sertifikat
tekshirilmaydi va xato yo'qoladi.

### Agar bu yordam bermasa

Xatoni **aynan qanday yozilganini** bizga yuboring. Chunki ikki xil sabab bor va
yechim ham har xil:

| Xato matnida | Sabab | Yechim |
|---|---|---|
| `сертификат`, `certificate`, `CA`, `доверия` | Sertifikatga ishonch yo'q | Yuqoridagi kod |
| `SSL`, `TLS`, `handshake`, `протокол` | Windows eski, TLS 1.2 ni bilmaydi | Windows yangilash yoki HTTP |

**TLS 1.2 ni tekshirish** (1C turgan serverda PowerShell'da):

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest https://analitika.oilagroup.uz/api/1c/ingest -UseBasicParsing
```

Bu ham xato bersa — Windows eski. Unda bizga ayting, biz **HTTP manzil
tayyorlaymiz** va shu yo'l bilan ketamiz.

---


## 3. Kodlash (кодировка) haqi

Kirill matn (kassir ismi, tovar nomi, to'lov turi) buzilmasligi uchun:

- **UTF-8** da yuborsangiz — `Content-Type: application/json; charset=utf-8`
- **windows-1251** da yuborsangiz — `Content-Type: application/json; charset=windows-1251`

`charset` ni yozmasangiz ham biz o'zimiz aniqlaymiz, lekin **yozganingiz aniqroq**.

⚠️ Bir marta shunday bo'lgan: fayl cp1251 da edi, lekin UTF-8 deb o'qildi va
kirill harflar `�` ga aylanib **butunlay yo'qoldi**. Shuning uchun `charset` ni
yozib qo'ying.

---

## 4. Javoblar

| Kod | Ma'nosi | Nima qilish |
|---|---|---|
| `200` | Qabul qilindi va **bazaga yozildi** | "yuborildi" deb belgilang |
| `400` | JSON o'qilmadi | Formatni tekshiring |
| `401` | Imzo bilan bog'liq (hozir ishlatilmaydi) | Javobdagi matnni o'qing |
| `403` | Bu IP dan qabul qilinmaydi | Bizga ayting |
| `404` | Token noto'g'ri | Tokenni tekshiring |
| `413` | So'rov juda katta | Partiyani kichraytiring (max 1000 hodisa, 8 MB) |
| `500` | Bizda xato | **Qayta yuboring** |

**`200` = yozildi.** Bu kafolat: javob kelgan bo'lsa ma'lumot yo'qolmaydi.

**Qayta yuborish xavfsiz.** Har bir hodisa mazmuni bo'yicha tekshiriladi —
ikki marta yuborilsa ikkinchisi jimgina tashlanadi, dubl paydo bo'lmaydi.
Shuning uchun shubha bo'lsa — qayta yuboring.

---

## 5. IP cheklovi

Sizning IP'ingizni oldindan so'ramaymiz. **Birinchi muvaffaqiyatli so'rov**
kelgan IP avtomatik ro'yxatga olinadi, keyin faqat o'sha IP qabul qilinadi.

Agar 1C server ko'chsa yoki IP o'zgarsa — `403` keladi. Bizga ayting, bir
bosishda yangilaymiz.

Agar sizda **bir nechta server** bo'lsa, oldindan aytib qo'ying.

---

## 6. Nima yuboriladi

Uch shaklning istalgani bo'ladi:

```json
{ "kind": "ЧекККМ", "id": "...", "number": "121", "date": "...", "data": { } }
```
```json
[ { }, { } ]
```
```json
{ "events": [ { }, { } ] }
```

Chek uchun tuzilma allaqachon kelishilgan (namuna fayl bo'yicha).

**Hujjatlar** (приход / расход / перемещение) uchun bitta shart bor:
har bir hujjatda **`kind`** maydoni bo'lsin — hujjat turi matn bilan
(masalan `"ПоступлениеТоваровУслуг"`). Usiz biz prixodni chekdan ajrata olmaymiz.

---

## Ilova — Imzo (HMAC). HOZIRCHA KERAK EMAS

> ⚠️ **Buni bajarmang.** Server tomonda imzo qo'llab-quvvatlanadi, lekin
> **majburiy emas** — imzosiz so'rovlar oddiy qabul qilinadi. Bu ilova
> kelajakda kerak bo'lib qolsa deb saqlanyapti. Sizdan so'ralmaguncha
> e'tibor bermang.

**Nega kerak bo'lishi mumkin.** HTTP shifrlanmagan. Ya'ni `Authorization: Bearer <TOKEN>` header
ochiq ketadi va yo'lda uni o'qib olish mumkin. Tokenni bilgan odam esa bizga
soxta chek yubora oladi.

Imzo bunday emas: **maxfiy kalit hech qachon tarmoqqa chiqmaydi**. Faqat undan
hisoblangan kod ketadi, u esa aynan shu tanaga va shu vaqtga bog'langan —
boshqa so'rovda ishlatib bo'lmaydi.

### Qanday hisoblanadi

Ikkita header qo'shiladi:

```
X-Ingest-Timestamp: 1785990177
X-Ingest-Signature: 9f3a1c...   (64 belgili hex)
```

Imzo:

```
HMAC-SHA256( KALIT,  "<timestamp>" + "." + <so'rov tanasi> )  →  hex, kichik harf
```

Muhim uch nuqta:

1. **Tana xuddi yuborilgan holicha** olinadi — baytma-bayt. Agar cp1251 da
   yuborayotgan bo'lsangiz, cp1251 baytlari imzolanadi.
2. `timestamp` — unix soniya (yoki millisekund, yoki ISO — uchalasi ham bo'ladi).
   Header'dagi qiymat bilan imzodagi qiymat **bir xil** bo'lishi shart.
3. Server soati bilan farq **5 daqiqadan** oshmasin. Oshsa — rad etiladi.
   Serveringizdagi soatni tekshiring (`serverTime` bilan solishtiring).

`KALIT` — token EMAS, alohida maxfiy satr. U ham alohida beriladi.

### Tekshirish (bash)

```bash
TS=$(date +%s)
BODY='{"kind":"Test","id":"1"}'
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "<KALIT>" -hex | sed 's/.*= //')

curl -X POST https://analitika.oilagroup.uz/api/1c/ingest \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Timestamp: $TS" \
  -H "X-Ingest-Signature: $SIG" \
  -d "$BODY"
```

### 1C kodi (namuna)

Platformangiz versiyasiga qarab nomlar biroz farq qilishi mumkin — moslashtiring.

```bsl
// HMAC-SHA256. Qaytadi: 64 belgili hex satr (kichik harf).
Функция HMACSHA256Hex(КлючСтрока, ДанныеБуфер) Экспорт

    БлокРазмер = 64;

    Ключ = ПолучитьБуферДвоичныхДанныхИзСтроки(КлючСтрока, "UTF-8", Ложь);
    Если Ключ.Размер > БлокРазмер Тогда
        Х = Новый ХешированиеДанных(ХешФункция.SHA256);
        Х.Добавить(Ключ);
        Ключ = Х.ХешСумма;
    КонецЕсли;

    Ipad = Новый БуферДвоичныхДанных(БлокРазмер);
    Opad = Новый БуферДвоичныхДанных(БлокРазмер);
    Для i = 0 По БлокРазмер - 1 Цикл
        Б = ?(i < Ключ.Размер, Ключ.Получить(i), 0);
        Ipad.Установить(i, ПобитовоеИсключительноеИли(Б, 54));   // 0x36
        Opad.Установить(i, ПобитовоеИсключительноеИли(Б, 92));   // 0x5C
    КонецЦикла;

    // Ichki hash: SHA256(ipad + data)
    Х1 = Новый ХешированиеДанных(ХешФункция.SHA256);
    Х1.Добавить(Ipad);
    Х1.Добавить(ДанныеБуфер);
    Ichki = Х1.ХешСумма;

    // Tashqi hash: SHA256(opad + ichki)
    Х2 = Новый ХешированиеДанных(ХешФункция.SHA256);
    Х2.Добавить(Opad);
    Х2.Добавить(Ichki);

    Возврат НРег(ПолучитьHexСтрокуИзБуфераДвоичныхДанных(Х2.ХешСумма));

КонецФункции


// Yuborish
Процедура Юбориш(JSONСтрока) Экспорт

    Тана = ПолучитьБуферДвоичныхДанныхИзСтроки(JSONСтрока, "UTF-8", Ложь);

    Метка = Формат(ТекущаяУниверсальнаяДата() - Дата(1970,1,1), "ЧГ=0");

    // Imzolanadigan qiymat: "<metka>." + tana baytlari
    Префикс = ПолучитьБуферДвоичныхДанныхИзСтроки(Метка + ".", "UTF-8", Ложь);
    Массив = Новый Массив;
    Массив.Добавить(Префикс);
    Массив.Добавить(Тана);
    ДляПодписи = СоединитьБуферыДвоичныхДанных(Массив);

    Подпись = HMACSHA256Hex("<KALIT>", ДляПодписи);

    Запрос = Новый HTTPЗапрос("/api/1c/ingest");
    Запрос.Заголовки.Вставить("Authorization",      "Bearer <TOKEN>");
    Запрос.Заголовки.Вставить("Content-Type",       "application/json; charset=utf-8");
    Запрос.Заголовки.Вставить("X-Ingest-Timestamp", Метка);
    Запрос.Заголовки.Вставить("X-Ingest-Signature", Подпись);
    Запрос.УстановитьТелоИзДвоичныхДанных(ПолучитьДвоичныеДанныеИзБуфераДвоичныхДанных(Тана));

    Ulanish = Новый HTTPСоединение("analitika.oilagroup.uz", 443, , , , 60,
                                   Новый ЗащищенноеСоединениеOpenSSL(, ));
    Ответ = Ulanish.ОтправитьДляОбработки(Запрос);

    Если Ответ.КодСостояния <> 200 Тогда
        // Qayta yuborish XAVFSIZ — takror yozuv yaratilmaydi.
        ВызватьИсключение Ответ.ПолучитьТелоКакСтрока();
    КонецЕсли;

КонецПроцедуры
```

---
