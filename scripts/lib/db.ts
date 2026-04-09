/**
 * Standalone Prisma client for scripts.
 * Loads .env.local for DATABASE_URL (Neon Postgres).
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('Missing DATABASE_URL env var');

// Strip channel_binding=require and normalise sslmode to verify-full
// (suppresses pg deprecation warning ahead of pg v9 semantics change)
const urlObj = new URL(dbUrl);
urlObj.searchParams.delete('channel_binding');
urlObj.searchParams.set('sslmode', 'verify-full');
const safeDbUrl = urlObj.toString();

const pool = new Pool({
  connectionString: safeDbUrl,
  ssl: { rejectUnauthorized: false }, // Safe for scripts running behind TLS inspection proxies
});
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export function chunkArray<T>(array: T[], chunkSize: number = 500): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}
