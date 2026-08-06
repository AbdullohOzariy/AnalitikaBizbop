/**
 * 1C → Analitika: HTTP ko'prigi (Cloudflare Worker).
 *
 * MUAMMO. 1C eski Windows'da ishlaydi va HTTPS'ga ulana olmaydi, shuning uchun
 * HTTP kerak. Lekin Railway 80-portga kelgan har qanday so'rovni 301 bilan
 * https'ga buradi va buni o'chirib bo'lmaydi.
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
 * NEGA HOSTNAME O'ZGARMAYDI. Railway custom domenni **Host header** bo'yicha
 * topadi. `3xi8jpkm.up.railway.app` ga murojaat qilinsa 404 keladi (tekshirilgan:
 * /login → 404, 101 bayt). Worker'da esa Host'ni qo'lda qo'yib bo'lmaydi — u
 * har doim URL'dan olinadi. Shuning uchun host o'sha, faqat sxema o'zgaradi.
 *
 * NEGA AYLANMA BO'LMAYDI. Worker o'z zonasidagi manzilga fetch qilsa, so'rov
 * to'g'ridan-to'g'ri origin'ga ketadi va Worker'lar chetlab o'tiladi:
 * "Routes cannot be the target of a same-zone fetch() call."
 *
 * ROUTE (faqat shu — qamrov iloji boricha tor):
 *   http://analitika.oilagroup.uz/api/1c/*
 * Sxema ataylab yozilgan: shunda HTTPS trafik Worker'ga umuman kirmaydi va
 * to'g'ridan-to'g'ri, o'zgarishsiz ishlayveradi.
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // HTTPS allaqachon ishlaydi — tegmaymiz. (Route sxemani cheklasa ham,
    // route qo'lda o'zgartirilsa shu qator xavfsizlikni saqlaydi.)
    if (url.protocol === "https:") return fetch(request);

    url.protocol = "https:";

    // `new Request(url, request)` metod, header va TANANI o'zgarishsiz oladi.
    // Tana OQIM sifatida uzatiladi — cp1251 baytlari matnga aylantirilmaydi,
    // ya'ni kirill matn buzilmaydi.
    const ichki = new Request(url, request);

    // Origin 301 qaytarsa uni MIJOZGA qaytaramiz, ergashmaymiz: aks holda
    // nosozlik jimgina aylanmaga aylanib, sababi ko'rinmay qolardi.
    return fetch(ichki, { redirect: "manual" });
  },
};
