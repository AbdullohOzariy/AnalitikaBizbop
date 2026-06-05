import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // bot/ — alohida loyiha (BotBizBopSPS), web lint/build'iga kirmaydi
    "bot/**",
    // miniapp Vite build artefaktlari (minified) — lint shovqinini bermasin
    "public/miniapp/assets/**",
    // bir martalik tahlil/test skriptlari (CommonJS)
    "scripts/**",
  ]),
  {
    rules: {
      // O'zbekcha UI matnida apostrof (') normal — &apos; ga aylantirish shovqin.
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;
