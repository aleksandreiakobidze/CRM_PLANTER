import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: [
    "@node-rs/argon2",
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "exceljs",
    "playwright",
    "qrcode",
  ],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
