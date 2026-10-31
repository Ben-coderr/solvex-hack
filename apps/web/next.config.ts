import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// One .env.local at the repo root serves the web app and the scripts. forceReload: Next has already loaded
// (and cached) apps/web/.env*, so a plain second call would be a silent no-op.
loadEnvConfig(path.resolve(process.cwd(), "../.."), process.env.NODE_ENV !== "production", { info: () => {}, error: console.error }, true);

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR=.next-e2e: build + start a second copy (e2e, rehearsal) without touching the running server's .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The floating dev badge overlaps content in QA/pitch screenshots.
  devIndicators: false,
  // @sellekni/shared ships TypeScript source (main: src/index.ts); Next compiles it like app code.
  transpilePackages: ["@sellekni/shared", "@sellekni/tokens"],
  // P7 security review. SAMEORIGIN, not DENY: /phones frames /w and /crew. The capability pages carry their token
  // in the URL: no-referrer, so an old browser (full-URL Referer) cannot hand it to another site.
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
    ];
    return [
      { source: "/:path*", headers: [...common, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }] },
      { source: "/w/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/crew/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
