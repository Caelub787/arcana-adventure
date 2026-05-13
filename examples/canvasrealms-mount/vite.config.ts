import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Resolve workspace packages directly from source so we don't need to
// re-install after every package edit.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@arcana/library-dialogs": resolve(__dirname, "../../packages/library-dialogs/src/index.ts"),
      "@arcana/library-dialogs/theme.css": resolve(__dirname, "../../packages/library-dialogs/src/theme.css"),
      "@arcana/aa-sync-sdk": resolve(__dirname, "../../packages/aa-sync-sdk/index.ts"),
    },
  },
  server: { port: 5173 },
});
