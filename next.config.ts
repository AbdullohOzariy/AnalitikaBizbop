import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
