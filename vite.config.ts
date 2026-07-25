import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    metaImagesPlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      "@arcana/aa-sync-sdk": path.resolve(import.meta.dirname, "packages/aa-sync-sdk/index.ts"),
      "@arcana/library-dialogs/theme.css": path.resolve(import.meta.dirname, "packages/library-dialogs/src/theme.css"),
      "@arcana/library-dialogs": path.resolve(import.meta.dirname, "packages/library-dialogs/src/index.ts"),
      "@cr": path.resolve(import.meta.dirname, "client", "src", "canvasrealms"),
      "@workspace/api-zod": path.resolve(import.meta.dirname, "client", "src", "canvasrealms", "_pkg", "api-zod", "src", "index.ts"),
      "@workspace/api-client-react": path.resolve(import.meta.dirname, "client", "src", "canvasrealms", "_pkg", "api-client-react", "src", "index.ts"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
