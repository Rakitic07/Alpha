/**
 * Seed a set of curated starter "views" (saved queries) for the screener.
 * Idempotent — re-running upserts by name. Users can edit/delete these freely.
 *
 * Usage: npx tsx scripts/seed-screener-queries.ts
 */
import { config } from 'dotenv';
import { join } from 'path';
import { createClient } from '@libsql/client';

config({ path: join(process.cwd(), '.env.local') });

interface Preset {
  name: string;
  baseTab: 'all' | 'prefiltered' | 'portfolio';
  filters: Record<string, unknown>;
  sortField: string | null;
  sortDir: 'asc' | 'desc' | null;
}

const PRESETS: Preset[] = [
  {
    name: 'Top 30 Momentum',
    baseTab: 'prefiltered',
    filters: { maxRank: 30 },
    sortField: 'rank', sortDir: 'asc',
  },
  {
    name: 'Near ATH (≤10%)',
    baseTab: 'prefiltered',
    filters: { athWithinPct: 10 },
    sortField: 'score', sortDir: 'desc',
  },
  {
    name: 'Strong Uptrend (all DMAs)',
    baseTab: 'prefiltered',
    filters: { requireAllDma: true },
    sortField: 'rank', sortDir: 'asc',
  },
  {
    name: 'Large-cap Leaders',
    baseTab: 'prefiltered',
    filters: { mcapCategories: ['Large'], maxRank: 50 },
    sortField: 'rank', sortDir: 'asc',
  },
  {
    name: 'Small & Mid Movers',
    baseTab: 'prefiltered',
    filters: { mcapCategories: ['Small', 'Mid'], maxRank: 50 },
    sortField: 'score', sortDir: 'desc',
  },
  {
    name: 'Large Cap',
    baseTab: 'all',
    filters: { mcapCategories: ['Large'] },
    sortField: 'rank', sortDir: 'asc',
  },
  {
    name: 'Mid Cap',
    baseTab: 'all',
    filters: { mcapCategories: ['Mid'] },
    sortField: 'rank', sortDir: 'asc',
  },
  {
    name: 'Big Movers Today (≥3%)',
    baseTab: 'all',
    filters: { minDayChange: 3, require200Dma: true },
    sortField: 'chg', sortDir: 'desc',
  },
  {
    name: 'Portfolio · Winners Today',
    baseTab: 'portfolio',
    filters: { minDayChange: 0 },
    sortField: 'chg', sortDir: 'desc',
  },
];

async function main() {
  const client = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
  let n = 0;
  for (const p of PRESETS) {
    await client.execute({
      sql: `INSERT INTO "ScreenerQuery" ("name","baseTab","filters","sortField","sortDir","isDefault","createdAt","updatedAt")
            VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT("name") DO UPDATE SET
              "baseTab"=excluded."baseTab",
              "filters"=excluded."filters",
              "sortField"=excluded."sortField",
              "sortDir"=excluded."sortDir",
              "updatedAt"=CURRENT_TIMESTAMP`,
      args: [p.name, p.baseTab, JSON.stringify(p.filters), p.sortField, p.sortDir],
    });
    n++;
  }
  console.log(`✅ Seeded ${n} screener views.`);
  const r = await client.execute('SELECT name, baseTab FROM "ScreenerQuery" ORDER BY name');
  console.log('\nCurrent saved views:');
  console.log(r.rows.map((row: any) => `  • ${row.name}  [${row.baseTab}]`).join('\n'));
  client.close();
}

main().catch(console.error);
