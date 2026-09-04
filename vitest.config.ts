import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      // Mirrors vite.config.ts. Any alias the app uses has to be repeated here
      // or a test that transitively imports it fails to load - vitest does not
      // read vite.config or tsconfig paths.
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@arcana/aa-sync-sdk": path.resolve(import.meta.dirname, "packages/aa-sync-sdk/index.ts"),
      "@arcana/library-dialogs/theme.css": path.resolve(import.meta.dirname, "packages/library-dialogs/src/theme.css"),
      "@arcana/library-dialogs": path.resolve(import.meta.dirname, "packages/library-dialogs/src/index.ts"),
      "@cr": path.resolve(import.meta.dirname, "client", "src", "canvasrealms"),
      "@workspace/api-zod": path.resolve(import.meta.dirname, "client", "src", "canvasrealms", "_pkg", "api-zod", "src", "index.ts"),
      "@workspace/api-client-react": path.resolve(import.meta.dirname, "client", "src", "canvasrealms", "_pkg", "api-client-react", "src", "index.ts"),
      "@workspace/db": path.resolve(import.meta.dirname, "server", "canvasrealms", "db.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "shared/**/*.test.ts",
      "server/**/*.test.ts",
      "client/**/*.test.{ts,tsx}",
      "packages/**/*.test.ts",
    ],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
