import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["desktop/forge.config.cjs", "desktop/electron-builder.config.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vinext/**",
    "out/**",
    "build/**",
    "dist/**",
    "outputs/**",
    "work/**",
    ".wrangler/**",
    "desktop/.vite/**",
    "desktop/out/**",
    "desktop/release/**",
    "desktop/release-lab/**",
    "desktop/node_modules/**",
    "desktop/src/renderer/.vite/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
