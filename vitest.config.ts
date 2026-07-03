import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit testlar — sof funksiyalar (DB/Next'siz). `@/` aliasi src/ ga ishora qiladi.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
