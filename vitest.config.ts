import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const packagePath = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "packages/**/*.test.ts", "apps/web/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**"],
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@nexus/schemas": packagePath("schemas"),
      "@nexus/security": packagePath("security"),
      "@nexus/shared": packagePath("shared"),
      "@nexus/integrations": packagePath("integrations"),
      "@nexus/mcp": packagePath("mcp"),
      "@nexus/workflows": packagePath("workflows"),
      "@nexus/cloud-brain": packagePath("cloud-brain"),
      "@nexus/ui": packagePath("ui"),
    },
  },
});
