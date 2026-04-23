import 'server-only';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import { dbLogger } from '@/lib/logger';

const globalForPrisma = global as unknown as { prisma_v2: PrismaClient };

// Node.js < 22 has no global WebSocket; polyfill with the `ws` package.
if (typeof globalThis.WebSocket === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  neonConfig.webSocketConstructor = require('ws');
}

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

  // Use @neondatabase/serverless instead of pg.Pool.
  // The Neon WebSocket endpoint handles cold-start reconnections without
  // the ~2-minute proxy timeout that the TCP/pg driver hits.
  // PrismaNeon accepts a PoolConfig and creates the pool internally.
  const adapter = new PrismaNeon({ connectionString: dbUrl, max: 5, idleTimeoutMillis: 30000 });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma_v2 || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma_v2 = prisma;
