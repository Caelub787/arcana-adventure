import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "client", "src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "shared/**/*.test.ts",
      "server/**/*.test.ts",
      "client/**/*.test.ts",
    ],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
