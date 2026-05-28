import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/categories", destination: "/iyerarxiya", permanent: true },
    ];
  },
};

export default nextConfig;
