import { config } from 'dotenv';
import { join } from 'path';
import { createClient } from '@libsql/client';

config({ path: join(process.cwd(), '.env.local') });

async function main() {
  const client = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
  try {
    await client.execute('ALTER TABLE "Dividend" ADD COLUMN "transferredBack" INTEGER NOT NULL DEFAULT 0');
    console.log('✅ Column transferredBack added successfully.');
  } catch (err: any) {
    console.log('Result:', err.message);
  }
  // Verify
  const r = await client.execute("PRAGMA table_info('Dividend')");
  console.log('\nColumns:');
  console.log(r.rows.map((row: any) => `  ${row.name} ${row.type} default=${row.dflt_value}`).join('\n'));
  client.close();
}

main().catch(console.error);
