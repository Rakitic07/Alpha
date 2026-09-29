import { config } from 'dotenv';
import { join } from 'path';
import { createClient } from '@libsql/client';

config({ path: join(process.cwd(), '.env.local') });

async function main() {
  const client = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
  try {
    await client.execute(
      `CREATE TABLE IF NOT EXISTS "ScreenerQuery" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL,
        "baseTab" TEXT NOT NULL DEFAULT 'prefiltered',
        "filters" TEXT NOT NULL DEFAULT '{}',
        "sortField" TEXT,
        "sortDir" TEXT,
        "isDefault" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS "ScreenerQuery_name_key" ON "ScreenerQuery"("name")');
    await client.execute('CREATE INDEX IF NOT EXISTS "ScreenerQuery_createdAt_idx" ON "ScreenerQuery"("createdAt")');
    console.log('✅ ScreenerQuery table + indexes ready.');
  } catch (err: any) {
    console.log('Result:', err.message);
  }
  const r = await client.execute("PRAGMA table_info('ScreenerQuery')");
  console.log('\nColumns:');
  console.log(r.rows.map((row: any) => `  ${row.name} ${row.type} default=${row.dflt_value}`).join('\n'));
  client.close();
}

main().catch(console.error);
