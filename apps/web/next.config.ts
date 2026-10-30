import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// One .env.local at the repo root serves the web app and the scripts. forceReload: Next has already loaded
// (and cached) apps/web/.env*, so a plain second call would be a silent no-op.
loadEnvConfig(path.resolve(process.cwd(), "../.."), process.env.NODE_ENV !== "production", { info: () => {}, error: console.error }, true);

const nextConfig: NextConfig = {
  // @najda/shared ships TypeScript source (main: src/index.ts); Next compiles it like app code.
  transpilePackages: ["@najda/shared", "@najda/tokens"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
