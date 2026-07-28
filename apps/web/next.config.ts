import type { NextConfig } from "next";

/**
 * The workspace packages ship TypeScript source rather than compiled output, so
 * Next has to transpile them itself. Listing them here is what makes
 * `import { resolvePage } from "@nexus/schemas"` work in both a server component
 * and a client component without a separate build step for the packages.
 */
const workspacePackages = [
  "@nexus/schemas",
  "@nexus/security",
  "@nexus/shared",
  "@nexus/ui",
  "@nexus/integrations",
  "@nexus/cloud-brain",
  "@nexus/database",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: workspacePackages,
  // The packages are authored as ESM and import siblings with an explicit `.js`
  // extension. Webpack needs to be told that those really are `.ts` files.
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Widget and shell chunks are large; keep the client bundle graph honest.
    optimizePackageImports: ["@nexus/schemas"],
  },
};

export default nextConfig;
