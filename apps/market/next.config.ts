import type { NextConfig } from "next";
import path from "node:path";

const API_URL = process.env.API_BASE_URL ?? process.env.API_URL ?? "http://localhost:3333";
const MEDIA_HOSTNAME = process.env.R2_PUBLIC_URL
  ? new URL(process.env.R2_PUBLIC_URL).hostname
  : "media.piklo.com.au";

const nextConfig: NextConfig = {
  // Sprint 0.5c (FM-R2-1 + GPT-Council R1): enable Next.js 16 Cache Components.
  // Without this flag the 'use cache' directive and cacheLife() are no-ops and
  // the app falls back to the previous caching model. Renamed from
  // experimental.dynamicIO in the Next 15 → 16 upgrade; the top-level form is
  // canonical per the Next 16 upgrade guide.
  cacheComponents: true,
  cacheLife: {
    // Named profiles per FM-R2-1 §0.5c-1. Profile names must match across
    // both the `'use cache'` read sites (apps/market/src/lib/data/*.ts) and the
    // `revalidateTag(tag, 'profile')` invalidation sites (Sprint 1a+ Server
    // Actions). See `scripts/cache-audit.sh` for drift detection.
    browse: { stale: 60, revalidate: 3600 },
    "listing-detail": { stale: 300, revalidate: 3600 },
    search: { stale: 0, revalidate: 60 },
  },
  // Emit a self-contained server bundle for the Docker runner stage
  // (apps/market/Dockerfile copies .next/standalone). Entry: apps/market/server.js.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@bushpop/config", "@bushpop/types", "@bushpop/ui", "@bushpop/api-client"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: MEDIA_HOSTNAME,
      },
    ],
  },
  async rewrites() {
    return [
      {
        // Same-origin /api proxy — session cookies stay first-party (LB-2)
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
