/**
 * restore-db.mjs
 * Restores a backup created by backup-db.mjs.
 *
 * Usage:
 *   node scripts/restore-db.mjs backups/backup_YYYY-MM-DDTHH-MM-SS.sql
 *
 * Options:
 *   --clean    Truncate all tables before restoring (full clean restore)
 *              Without this flag, uses ON CONFLICT DO NOTHING (safe merge)
 */
import { Client } from 'pg';
import { readFileSync, existsSync } from 'fs';

const DB_URL = process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_uZyPmK4UQkg8@ep-mute-violet-an67crcx-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const args = process.argv.slice(2);
const backupFile = args.find(a => !a.startsWith('--'));
const cleanRestore = args.includes('--clean');

if (!backupFile) {
  console.error('Usage: node scripts/restore-db.mjs <backup-file.sql> [--clean]');
  process.exit(1);
}

if (!existsSync(backupFile)) {
  console.error(`❌ Backup file not found: ${backupFile}`);
  process.exit(1);
}

const TABLES_IN_DEPENDENCY_ORDER = [
  'UpstoxToken', 'AppConfig', 'ImportBatch', 'Transaction', 'SymbolMapping',
  'SectorMapping', 'StockHistory', 'IndexHistory', 'StockATH', 'StockMarketCap',
  'AMFIClassification', 'AMFIImportHistory', 'DailyPortfolioSnapshot',
  'WeeklyPortfolioSnapshot', 'MonthlyPortfolioSnapshot', 'MomentumScore',
  'RankingHistory', 'ScreenerPrice', 'IntradayPnL', 'Job',
];

async function main() {
  console.log(`📂 Restore file : ${backupFile}`);
  console.log(`🔧 Mode         : ${cleanRestore ? 'CLEAN (truncate first)' : 'MERGE (ON CONFLICT DO NOTHING)'}`);

  if (cleanRestore) {
    console.log('\n⚠️  CLEAN mode will DELETE all existing data before restoring.');
    console.log('   Sleeping 5 seconds — Ctrl+C to abort...');
    await new Promise(r => setTimeout(r, 5000));
  }

  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('\n✅ Connected to Neon DB');

  const sql = readFileSync(backupFile, 'utf8');

  if (cleanRestore) {
    console.log('\n🗑  Truncating tables...');
    await client.query('BEGIN');
    for (const table of [...TABLES_IN_DEPENDENCY_ORDER].reverse()) {
      try {
        await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
        process.stdout.write(`   Truncated "${table}"\n`);
      } catch (e) {
        process.stdout.write(`   SKIP "${table}" (${e.message})\n`);
      }
    }
    await client.query('COMMIT');
    console.log('✅ Truncation complete\n');
  }

  console.log('📥 Replaying INSERT statements...');
  await client.query(sql);
  console.log('✅ Restore complete!');

  await client.end();
}

main().catch(e => { console.error('❌ Restore failed:', e.message); process.exit(1); });
