import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactCompiler from "eslint-plugin-react-compiler";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "react-compiler": reactCompiler,
    },
    rules: {
      "react-compiler/react-compiler": "error",
    },
    settings: {
      react: {
        version: "19.2.7",
      },
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "android/**",
    "backtest/**",
    "backups/**",
    "scripts/**",
    "eslint.config.mjs",
    "postcss.config.js",
    "next.config.ts",
    "capacitor.config.ts",
    "prisma.config.ts",
  ]),
]);

export default eslintConfig;
