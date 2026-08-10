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
      "react-compiler/react-compiler": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "@typescript-eslint/no-explicit-any": "off",
    },
    settings: {
      react: {
        version: "19.2.8",
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
    "scratch/**",
    "eslint.config.mjs",
    "postcss.config.js",
    "next.config.ts",
    "capacitor.config.ts",
    "prisma.config.ts",
  ]),
]);

export default eslintConfig;
