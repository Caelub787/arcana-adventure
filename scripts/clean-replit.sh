#!/bin/bash
# Run this script after cloning from GitHub to remove Replit-specific dependencies
# Usage: bash scripts/clean-replit.sh

echo "Removing Replit Vite plugins from package.json..."
# Remove the three @replit devDependencies
node -e "
const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
delete pkg.devDependencies['@replit/vite-plugin-cartographer'];
delete pkg.devDependencies['@replit/vite-plugin-dev-banner'];
delete pkg.devDependencies['@replit/vite-plugin-runtime-error-modal'];
require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "Done."

echo "Cleaning vite.config.ts..."
cat > vite.config.ts << 'EOF'
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
EOF
echo "Done."

echo "Replit-specific dependencies removed. Run 'npm install' to update node_modules."
