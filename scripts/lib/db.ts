/**
 * Standalone Prisma client for scripts (bypasses server-only restriction).
 * Loads .env.local for DATABASE_URL.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

function createClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('Missing DATABASE_URL in .env.local');

  const parsedUrl = new URL(dbUrl);
  const authToken = parsedUrl.searchParams.get('authToken') ?? undefined;
  parsedUrl.searchParams.delete('authToken');
  parsedUrl.searchParams.delete('sslmode');

  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const adapter = new PrismaLibSql({ url: parsedUrl.toString(), authToken });
  return new PrismaClient({ adapter });
}

export const prisma = createClient();

export const SQLITE_IN_CLAUSE_LIMIT = 50;

export function chunkArray<T>(array: T[], chunkSize: number = SQLITE_IN_CLAUSE_LIMIT): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}
