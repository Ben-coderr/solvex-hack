import type { NextConfig } from "next";

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
