import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  // Next needs tsconfig "jsx": "preserve"; tests need JSX actually compiled.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});
