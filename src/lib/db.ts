import 'server-only';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
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

  dbLogger.info('Connected to Neon Postgres via WebSocket adapter');

  // Clean connection string (strip channel_binding and normalise sslmode to verify-full)
  let safeDbUrl = dbUrl;
  try {
    const urlObj = new URL(dbUrl);
    urlObj.searchParams.delete('channel_binding');
    urlObj.searchParams.set('sslmode', 'verify-full');
    safeDbUrl = urlObj.toString();
  } catch (e) {
    // Ignore URL parse error, fallback to raw url
  }

  // Setup WebSocket constructor for Neon serverless driver
  class CustomWebSocket extends ws {
    constructor(address: any, protocols: any, options: any) {
      super(address, protocols, { ...options, rejectUnauthorized: false });
    }
  }
  neonConfig.webSocketConstructor = CustomWebSocket;

  const adapter = new PrismaNeon({
    connectionString: safeDbUrl,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma_v2 || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma_v2 = prisma;
