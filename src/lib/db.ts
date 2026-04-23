import 'server-only';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { dbLogger } from '@/lib/logger';

const globalForPrisma = global as unknown as { prisma_v2: PrismaClient };

/**
 * Splits an array into chunks for batched queries.
 * Postgres handles large IN clauses natively, but batching is still
 * useful for bulk inserts (createMany) and to keep individual queries
 * from becoming too large.
 */
export function chunkArray<T>(array: T[], chunkSize: number = 500): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Keep the old name exported as an alias for backward compat in imports
export const SQLITE_IN_CLAUSE_LIMIT = 500;

function createPrismaClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error(
      'Missing database credentials. Please set DATABASE_URL in your .env.local file.\n' +
      'Example: DATABASE_URL="postgresql://user:pass@host.neon.tech/dbname?sslmode=require"'
    );
  }

  dbLogger.info('Connected to Neon Postgres');

  const pool = new Pool({
    connectionString: dbUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    // Bound TCP dial time so a cold Neon compute fails fast instead of hanging
    // for ~2 minutes. The cron's neon() HTTP warmup wakes the compute first.
    connectionTimeoutMillis: 10_000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma_v2 || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma_v2 = prisma;
