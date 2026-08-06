/**
 * 1C → Analitika: HTTP ko'prigi (Cloudflare Worker).
 *
 * MUAMMO. 1C eski Windows'da ishlaydi va HTTPS'ga ulana olmaydi. Railway esa
 * 80-portga kelgan har qanday so'rovni 301 bilan https'ga buradi va buni
 * o'chirib bo'lmaydi.
 *
 * NEGA CLOUDFLARE O'ZI YETMAYDI. `Full` rejimi «har doim HTTPS» degani emas.
 * Rasmiy hujjat: "makes connections to the origin using the scheme requested by
 * the visitor. If your visitor uses http, then Cloudflare connects to the origin
 * using plaintext HTTP." Ya'ni HTTP so'rov origin'ga ham HTTP bo'lib boradi va
 * Railway uni 301 qiladi. `Flexible` esa cheksiz aylanma beradi.
 *
 * YECHIM. Worker HTTP so'rovni qabul qiladi va AYNAN SHU hostname'ga, lekin
 * `https://` bilan qayta so'rov yuboradi. Cloudflare bu safar origin'ga TLS
 * bilan boradi — Railway 301 qilmaydi.
 *
 * ⚠️ TASDIQLANMAGAN FARAZ. «Worker https subso'rov qilsa, tashrifchi HTTP
 * kelgan bo'lsa ham Cloudflare origin'ga TLS bilan boradi» — bu Cloudflare
 * hujjatida YOZILMAGAN. Shuning uchun quyida `x-1c-bridge` belgisi bor:
 * u testni aniq qiladi (pastdagi izohga qarang). Faraz noto'g'ri chiqsa
 * hech narsa buzilmaydi — yana o'sha 301 qaytadi.
 *
 * NEGA HOSTNAME O'ZGARMAYDI. Railway custom domenni Host header bo'yicha
 * topadi. `3xi8jpkm.up.railway.app` — faqat CNAME nishoni, ilovani bermaydi
 * (tekshirilgan: /login → 404, 101 bayt). Worker'da Host'ni qo'lda qo'yib
 * bo'lmaydi — u har doim URL'dan olinadi.
 *
 * NEGA AYLANMA BO'LMAYDI. Worker o'z zonasidagi manzilga fetch qilsa, so'rov
 * to'g'ridan-to'g'ri origin'ga ketadi va Worker'lar chetlab o'tiladi:
 * "Routes cannot be the target of a same-zone fetch() call."
 *
 * ROUTE (faqat shu — qamrov iloji boricha tor):
 *   http://analitika.oilagroup.uz/api/1c/*
 * Sxema ataylab yozilgan: HTTPS trafik Worker'ga umuman kirmaydi.
 */

/** Faqat shu yo'l uzatiladi. */
const YOL = "/api/1c/";

/** QATTIQ yozilgan: workers.dev orqali chaqirilsa ham o'zini chaqirmasin. */
const HOST = "analitika.oilagroup.uz";

/** ingest route'idagi MAX_BODY_BYTES bilan bir xil. */
const MAX_BODY = 8 * 1024 * 1024;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Boshqa yo'llar bu ko'prikdan o'tmasin.
    if (!url.pathname.startsWith(YOL)) {
      return new Response("Not found", { status: 404 });
    }

    // HTTPS allaqachon ishlaydi — tegmaymiz. (Route sxemani cheklaydi, lekin
    // route qo'lda o'zgartirilsa shu qator himoya bo'lib qoladi.)
    if (url.protocol === "https:") return fetch(request);

    url.protocol = "https:";
    url.hostname = HOST;
    url.port = "";

    const headers = new Headers(request.headers);

    // Haqiqiy mijoz IP'si. Subso'rovda `cf-connecting-ip` o'zgarib qolishi
    // mumkin, shuning uchun zaxira sifatida `x-real-ip` ga ham yozamiz —
    // ip-cheklov.ts uni oxirgi variant sifatida o'qiydi.
    const mijozIp = request.headers.get("cf-connecting-ip");
    if (mijozIp) headers.set("x-real-ip", mijozIp);

    // Tana XOM BAYT bo'lib o'tadi: cp1251 baytlari matnga aylantirilmaydi,
    // ya'ni kirill matn (kassir ismi, tovar nomi) buzilmaydi.
    let body = null;
    if (request.method !== "GET" && request.method !== "HEAD") {
      body = await request.arrayBuffer();
      if (body.byteLength > MAX_BODY) {
        return new Response("Payload too large", { status: 413 });
      }
    }
    // Yangi tana uzunligini fetch o'zi qo'yadi — eskisi qolib ketmasin.
    headers.delete("content-length");

    // Origin 301 qaytarsa MIJOZGA qaytaramiz, ergashmaymiz: aks holda
    // nosozlik jimgina aylanmaga aylanib, sababi ko'rinmay qolardi.
    const res = await fetch(url.toString(), {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });

    const out = new Response(res.body, res);

    // DIAGNOSTIKA BELGISI — testni aniq qiladi:
    //   200 + x-1c-bridge  → tayyor
    //   301 + x-1c-bridge  → Worker ishladi, lekin https-hiyla ishlamadi
    //   301, belgi yo'q    → route mos kelmagan (pattern yoki proxy holati)
    out.headers.set("x-1c-bridge", "1");

    return out;
  },
};
