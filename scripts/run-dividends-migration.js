#!/usr/bin/env node
/**
 * Runs the add_dividends migration against Neon via HTTP (serverless-compatible).
 * Uses the same @neondatabase/serverless client the app uses.
 */

const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not found in .env.local');
  process.exit(1);
}

async function run() {
  const sql = neon(DATABASE_URL);

  console.log('Checking if Dividend table already exists...');
  const existing = await sql`
    SELECT to_regclass('public."Dividend"') AS exists
  `;
  
  if (existing[0].exists) {
    console.log('✅ Dividend table already exists — migration already applied.');
    return;
  }

  console.log('Running migration: add_dividends...');

  await sql`
    CREATE TABLE "Dividend" (
      "id"          SERIAL       NOT NULL,
      "isin"        TEXT         NOT NULL,
      "symbol"      TEXT,
      "exDate"      TIMESTAMP(3) NOT NULL,
      "payDate"     TIMESTAMP(3),
      "amount"      DOUBLE PRECISION NOT NULL,
      "dps"         DOUBLE PRECISION,
      "quantity"    DOUBLE PRECISION,
      "fiscalYear"  TEXT         NOT NULL,
      "quarter"     TEXT,
      "source"      TEXT         NOT NULL DEFAULT 'zerodha_taxpnl',
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Dividend_pkey" PRIMARY KEY ("id")
    )
  `;
  console.log('  ✔ Created table Dividend');

  await sql`CREATE UNIQUE INDEX "Dividend_isin_exDate_key" ON "Dividend"("isin", "exDate")`;
  console.log('  ✔ Created unique index on (isin, exDate)');

  await sql`CREATE INDEX "Dividend_isin_idx" ON "Dividend"("isin")`;
  await sql`CREATE INDEX "Dividend_symbol_idx" ON "Dividend"("symbol")`;
  await sql`CREATE INDEX "Dividend_fiscalYear_idx" ON "Dividend"("fiscalYear")`;
  await sql`CREATE INDEX "Dividend_exDate_idx" ON "Dividend"("exDate")`;
  console.log('  ✔ Created supporting indexes');

  // Record migration in Prisma's _prisma_migrations table so it's tracked
  await sql`
    INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    VALUES (
      gen_random_uuid()::text,
      'add_dividends_manual',
      NOW(),
      '20260708120000_add_dividends',
      NULL,
      NULL,
      NOW(),
      1
    )
    ON CONFLICT (migration_name) DO NOTHING
  `;
  console.log('  ✔ Recorded in _prisma_migrations');

  console.log('\n🎉 Migration add_dividends applied successfully!');
}

run().catch(err => {
  console.error('Migration failed:', err.message || err);
  process.exit(1);
});
