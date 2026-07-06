import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('No DATABASE_URL found in env!');
  process.exit(1);
}

let safeDbUrl = dbUrl;
try {
  const urlObj = new URL(dbUrl);
  urlObj.searchParams.delete('channel_binding');
  urlObj.searchParams.set('sslmode', 'verify-full');
  safeDbUrl = urlObj.toString();
} catch (e) {}

class CustomWebSocket extends ws {
  constructor(address: any, protocols: any, options: any) {
    super(address, protocols, { ...options, rejectUnauthorized: false });
  }
}
neonConfig.webSocketConstructor = CustomWebSocket;

const adapter = new PrismaNeon({
  connectionString: safeDbUrl,
});
const prisma = new PrismaClient({ adapter });

async function check() {
  try {
    for (const period of ['2026_H1', '2025_H2']) {
      console.log(`\nCategory breakdown for ${period}:`);
      const breakdown = await prisma.aMFIClassification.groupBy({
        by: ['category'],
        where: { period },
        _count: { symbol: true }
      });
      for (const b of breakdown) {
        console.log(`  ${b.category}: ${b._count.symbol} stocks`);
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

check();
