import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests only. These test pure logic (timezone math, overlap detection,
// validation) and do not start the Worker, a dev server, or touch D1.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "dist", ".wrangler"],
  },
});
