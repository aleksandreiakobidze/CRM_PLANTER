import type { NextConfig } from "next";

const hostinger =
  process.env.PLANTER_HOSTINGER === "1" || process.env.npm_lifecycle_event === "build:hostinger";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: hostinger ? "standalone" : undefined,
  typescript: {
    ignoreBuildErrors: hostinger,
  },
  serverExternalPackages: [
    "@node-rs/argon2",
    "@prisma/adapter-mariadb",
    "@prisma/adapter-pg",
    "@prisma/client",
    "mariadb",
    "pg",
    "exceljs",
    "playwright",
    "qrcode",
  ],
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    optimizePackageImports: ["lucide-react"],
    ...(hostinger
      ? {
          cpus: 1,
          staticGenerationMaxConcurrency: 1,
          staticGenerationMinPagesPerWorker: 200,
        }
      : {}),
  },
};

export default nextConfig;
