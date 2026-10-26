import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "node:path";

// The Cloudflare plugin wires the Worker (worker/index.ts, from wrangler.jsonc "main")
// together with the Vite-built React SPA. `vite build` outputs the client bundle to
// dist/client (served as static assets) and the Worker to dist.
export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  build: {
    outDir: "dist/client",
    sourcemap: true,
  },
});
