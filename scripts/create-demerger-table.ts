/**
 * Create ScreenerDemerger table via raw SQL.
 * Not needed if prisma db push works — this is a fallback.
 */
import { prisma } from './lib/db';

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ScreenerDemerger" (
      "id" SERIAL PRIMARY KEY,
      "symbol" TEXT NOT NULL,
      "exDate" TEXT NOT NULL,
      "ratio" DOUBLE PRECISION NOT NULL,
      "appliedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
