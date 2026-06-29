import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit AFM/data fayllarini webpack bundlega olmaslik (runtime require)
  serverExternalPackages: ["pdfkit"],
  experimental: {
    // Client router keshi: dinamik sahifa 30s ichida qayta ochilsa serverga bormaydi
    // (orqaga/oldinga va sidebar navigatsiyasi bir zumda). Ma'lumot baribir faqat
    // fayl yuklanganda o'zgaradi — 30s eskirish xavfsiz.
    staleTimes: { dynamic: 30 },
    // Server Action'lar CSRF himoyasi Origin'ni host bilan solishtiradi — sozlanmasa
    // faqat same-origin. Public anketa boshqa domendan (supplier.oilagroup.uz, proxy/
    // rewrite) yuboriladi, shu sababli "Yuborish" bloklanardi. O'sha originlarni ruxsat beramiz.
    serverActions: {
      allowedOrigins: ["supplier.oilagroup.uz", "*.oilagroup.uz"],
      // Server Action body default 1MB — sotuv/tashrif Excel fayllari (25k+ SKU)
      // shundan katta bo'lib "Body exceeded 1 MB limit" xatosi berardi. 25MB gacha ruxsat.
      bodySizeLimit: "25mb",
    },
  },
  async redirects() {
    return [
      { source: "/categories", destination: "/iyerarxiya", permanent: true },
      // Miniapp Vite SPA public/miniapp/index.html da — /miniapp ham ochsin.
      { source: "/miniapp", destination: "/miniapp/index.html", permanent: false },
    ];
  },
  // HSTS — brauzer har doim https ishlatadi ("Not secure" http holatini yo'qotadi)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
