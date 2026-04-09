/**
 * Create ScreenerDemerger table via raw SQL (bypasses Prisma CLI ESM issues).
 */
import { prisma } from './lib/db';

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ScreenerDemerger" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
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
  console.log('✅ ScreenerDemerger table created');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
