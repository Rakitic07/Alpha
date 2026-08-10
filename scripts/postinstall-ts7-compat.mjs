/**
 * postinstall-ts7-compat.mjs
 *
 * TypeScript 7.0 (Go-based compiler) removed internal APIs (e.g. ts.Extension,
 * ts.InternalSymbolName) that typescript-eslint v8.x depends on. Until typescript-eslint
 * ships TS7-compatible builds (expected in TS 7.1 timeframe), this script symlinks
 * the typescript6 compat package into every nested @typescript-eslint node_modules
 * directory so ESLint resolves TS6 for linting while the project builds with TS7.
 *
 * This script is automatically run by the "postinstall" npm script after every `npm install`.
 */

import { existsSync, mkdirSync, symlinkSync, realpathSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';

const root = resolve(import.meta.dirname, '..');
const ts6Dir = join(root, 'node_modules', 'typescript6');
const eslintNextBase = join(root, 'node_modules', 'eslint-config-next');
const tsApiUtils = join(root, 'node_modules', 'ts-api-utils');

// Verify typescript6 compat package is installed
if (!existsSync(ts6Dir)) {
  console.warn('[postinstall] typescript6 compat package not found — skipping TS7 symlinks.');
  console.warn('[postinstall] Run: npm install --save-dev typescript6@npm:@typescript/typescript6@^6.0.0');
  process.exit(0);
}

function linkTs6(targetDir) {
  const tsLink = join(targetDir, 'typescript');
  try {
    // Remove stale link or directory
    if (existsSync(tsLink)) {
      const real = realpathSync(tsLink);
      if (real === realpathSync(ts6Dir)) return; // Already correct
      unlinkSync(tsLink);
    }
    mkdirSync(targetDir, { recursive: true });
    symlinkSync(ts6Dir, tsLink, 'dir');
    console.log(`[postinstall] Linked ${tsLink}`);
  } catch (e) {
    // Non-fatal — symlink may already exist correctly
    if (e.code !== 'EEXIST') console.warn(`[postinstall] Warning: ${e.message}`);
  }
}

// 1. Link for all @typescript-eslint packages inside eslint-config-next subtree
try {
  const output = execSync(
    `find "${eslintNextBase}" -name "package.json" -path "*/node_modules/@typescript-eslint/*/package.json"`,
    { encoding: 'utf8' }
  ).trim();

  if (output) {
    for (const pkgJson of output.split('\n')) {
      const pkgDir = pkgJson.replace('/package.json', '');
      linkTs6(join(pkgDir, 'node_modules'));
    }
  }

  // Also the top-level typescript-eslint monorepo package inside eslint-config-next
  const tsEslintDir = join(eslintNextBase, 'node_modules', 'typescript-eslint');
  if (existsSync(tsEslintDir)) {
    linkTs6(join(tsEslintDir, 'node_modules'));
  }
} catch (e) {
  console.warn('[postinstall] Warning during eslint-config-next symlinking:', e.message);
}

// 2. Link for ts-api-utils (also uses TS internals removed in TS7)
if (existsSync(tsApiUtils)) {
  linkTs6(join(tsApiUtils, 'node_modules'));
}

console.log('[postinstall] TypeScript 7 / typescript-eslint compatibility symlinks applied.');
