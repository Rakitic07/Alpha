// Script to test Neon Serverless Pool connection.
// Usage: npx tsx scripts/test-neon-pool.ts

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envLocalPath = path.resolve(__dirname, '../.env.local');
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
else if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Module = require('module');
const _orig = Module._load;
Module._load = function(req: string, parent: any, isMain: boolean) {
  if (req === 'server-only') return {};
  if (req === 'next/cache') return { unstable_cache: (fn: any) => fn, revalidateTag: () => {}, revalidatePath: () => {} };
  if (req === 'next/server') return {};
  return _orig(req, parent, isMain);
};

async function main() {
  const dbUrl = process.env.DATABASE_URL!;
  console.log('Raw URL:', dbUrl.replace(/:[^:@/]+@/, ':****@'));

  const { Pool } = await import('@neondatabase/serverless');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { PrismaClient } = await import('@prisma/client');

  const pool = new Pool({ connectionString: dbUrl });
  const adapter = new PrismaPg(pool as any);
  const prisma = new PrismaClient({ adapter });

  console.log('Running prisma query with Neon serverless Pool...');
  const count = await prisma.transaction.count();
  console.log('Success! Count:', count);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
