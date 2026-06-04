/**
 * backup-db.mjs
 * Backs up every table in the Neon PostgreSQL database to a single SQL file.
 * The output file is a self-contained INSERT-based dump that can be restored
 * by running it directly against the database.
 *
 * Usage:
 *   node scripts/backup-db.mjs
 *
 * Output:
 *   backups/backup_YYYY-MM-DDTHH-MM-SS.sql
 */
import { Client } from 'pg';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DB_URL = process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_uZyPmK4UQkg8@ep-mute-violet-an67crcx-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// Tables to back up (in dependency order so restore doesn't hit FK violations)
const TABLES = [
  'UpstoxToken',
  'AppConfig',
  'ImportBatch',
  'Transaction',
  'SymbolMapping',
  'SectorMapping',
  'StockHistory',
  'IndexHistory',
  'StockATH',
  'StockMarketCap',
  'AMFIClassification',
  'AMFIImportHistory',
  'DailyPortfolioSnapshot',
  'WeeklyPortfolioSnapshot',
  'MonthlyPortfolioSnapshot',
  'MomentumScore',
  'RankingHistory',
  'ScreenerPrice',
  'IntradayPnL',
  'Job',
];

function sqlLiteral(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (val instanceof Date) return `'${val.toISOString()}'`;
  // Escape single quotes and backslashes
  const escaped = String(val).replace(/\\/g, '\\\\').replace(/'/g, "''");
  return `'${escaped}'`;
}

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('✅ Connected to Neon DB');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = join(ROOT, 'backups');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `backup_${timestamp}.sql`);

  const lines = [];

  lines.push(`-- Alpha Portfolio DB Backup`);
  lines.push(`-- Created: ${new Date().toISOString()}`);
  lines.push(`-- Source: Neon PostgreSQL`);
  lines.push(`-- Restore: Run this file against the same database`);
  lines.push(`--`);
  lines.push(`-- WARNING: This file uses INSERT ... ON CONFLICT DO NOTHING`);
  lines.push(`-- so it is safe to run against a database that already has some data.`);
  lines.push(`-- To do a clean restore, TRUNCATE the tables first (see bottom of file).`);
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');

  let totalRows = 0;
  const tableCounts = {};

  for (const table of TABLES) {
    process.stdout.write(`  Backing up "${table}"... `);

    // Get column names
    const colRes = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [table]);

    if (colRes.rows.length === 0) {
      console.log(`SKIP (table not found)`);
      continue;
    }

    const columns = colRes.rows.map(r => r.column_name);

    // Fetch all rows
    const dataRes = await client.query(`SELECT * FROM "${table}" ORDER BY 1`);
    const rows = dataRes.rows;

    lines.push(`-- ── ${table} (${rows.length} rows) ──────────────────────`);

    if (rows.length === 0) {
      lines.push(`-- (empty)`);
      lines.push('');
      console.log(`0 rows`);
      tableCounts[table] = 0;
      continue;
    }

    const colList = columns.map(c => `"${c}"`).join(', ');

    // Write in batches of 500 for readability
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const values = batch.map(row =>
        `(${columns.map(c => sqlLiteral(row[c])).join(', ')})`
      ).join(',\n  ');

      lines.push(`INSERT INTO "${table}" (${colList})`);
      lines.push(`VALUES`);
      lines.push(`  ${values}`);
      lines.push(`ON CONFLICT DO NOTHING;`);
      lines.push('');
    }

    console.log(`${rows.length} rows`);
    tableCounts[table] = rows.length;
    totalRows += rows.length;
  }

  lines.push('COMMIT;');
  lines.push('');
  lines.push('-- ── RESTORE HELPER ───────────────────────────────────────');
  lines.push('-- To do a clean restore (drops existing data), run these TRUNCATE');
  lines.push('-- statements first, then replay this file:');
  lines.push('--');
  lines.push('-- BEGIN;');
  [...TABLES].reverse().forEach(t => {
    lines.push(`-- TRUNCATE TABLE "${t}" CASCADE;`);
  });
  lines.push('-- COMMIT;');

  writeFileSync(outFile, lines.join('\n'), 'utf8');

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log(`✅ Backup complete!`);
  console.log(`   File : ${outFile}`);
  const sizeKB = Math.round(lines.join('\n').length / 1024);
  console.log(`   Size : ~${sizeKB} KB`);
  console.log(`   Rows : ${totalRows} total`);
  console.log('');
  console.log('   Table row counts:');
  Object.entries(tableCounts).filter(([,v]) => v > 0).forEach(([t, n]) => {
    console.log(`     ${t.padEnd(28)} ${String(n).padStart(6)} rows`);
  });
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('To restore, run:');
  console.log(`  node scripts/restore-db.mjs backups/backup_${timestamp}.sql`);

  await client.end();
}

main().catch(e => { console.error('❌ Backup failed:', e.message); process.exit(1); });
