import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/categories", destination: "/iyerarxiya", permanent: true },
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
