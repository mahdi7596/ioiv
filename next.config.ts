import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/kalan-hesab" },
        { source: "/admin", destination: "/kalan-hesab/admin" },
        { source: "/admin/login", destination: "/kalan-hesab/admin/login" },
      ],
    };
  },
};

export default nextConfig;
