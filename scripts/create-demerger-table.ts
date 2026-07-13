/**
 * Create ScreenerDemerger table via raw SQL for SQLite/Turso.
 * Usage: npx tsx scripts/create-demerger-table.ts
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Module = require('module');
const _orig = Module._load;
Module._load = function (req: string, parent: any, isMain: boolean) {
  if (req === 'server-only') return {};
  if (req === 'next/cache') return { unstable_cache: (fn: any) => fn, revalidateTag: () => {}, revalidatePath: () => {} };
  if (req === 'next/server') return {};
  return _orig(req, parent, isMain);
};

import { config } from 'dotenv';
import { join } from 'path';
import * as fs from 'fs';

// Load env
const envLocalPath = join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  config({ path: envLocalPath });
}
config();

async function main() {
  console.log('Creating ScreenerDemerger table in SQLite/Turso...');
  const { prisma } = await import('../src/lib/db');
  
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ScreenerDemerger" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "symbol" TEXT NOT NULL,
      "exDate" TEXT NOT NULL,
      "ratio" REAL NOT NULL,
      "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ScreenerDemerger_symbol_exDate_key"
    ON "ScreenerDemerger" ("symbol", "exDate")
  `);
  console.log('✅ ScreenerDemerger table created successfully');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
