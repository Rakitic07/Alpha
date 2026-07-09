import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    throw new Error('DATABASE_URL is missing in environment variables');
}

// Strip channel_binding and normalize sslmode
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
neonConfig.webSocketConstructor = CustomWebSocket as any;

const adapter = new PrismaNeon({
    connectionString: safeDbUrl,
});
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Starting benchmark...');
    const startOverall = Date.now();

    // 1. Benchmark basic fetches
    console.time('Basic fetches');
    const [latestPrice, latestFilteredRank, latestAllRank, filteredCount, allCount, cronConfig] = await Promise.all([
        prisma.screenerPrice.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
        prisma.rankingHistory.findFirst({ where: { rankType: 'filtered' }, orderBy: { date: 'desc' }, select: { date: true } }),
        prisma.rankingHistory.findFirst({ where: { rankType: 'all' }, orderBy: { date: 'desc' }, select: { date: true } }),
        prisma.momentumScore.count({ where: { isActive: true, rankType: 'filtered' } }),
        prisma.momentumScore.count({ where: { isActive: true, rankType: 'all' } }),
        prisma.appConfig.findUnique({ where: { key: 'cron.screener.lastRun' } }),
    ]);
    console.timeEnd('Basic fetches');
    console.log({ latestPrice, latestFilteredRank, latestAllRank, filteredCount, allCount });

    // 2. Benchmark distinct findMany for ScreenerPrice
    console.time('findMany distinct ScreenerPrice');
    const priceDates = await prisma.screenerPrice.findMany({ select: { date: true }, distinct: ['date'] });
    console.timeEnd('findMany distinct ScreenerPrice');
    console.log(`findMany distinct ScreenerPrice: found ${priceDates.length} dates`);

    // 3. Benchmark distinct findMany for RankingHistory
    console.time('findMany distinct RankingHistory');
    const rankDates = await prisma.rankingHistory.findMany({ select: { date: true }, distinct: ['date'] });
    console.timeEnd('findMany distinct RankingHistory');
    console.log(`findMany distinct RankingHistory: found ${rankDates.length} dates`);

    // 4. Benchmark raw SQL COUNT(DISTINCT date) for ScreenerPrice
    console.time('raw SQL count distinct ScreenerPrice');
    const priceDatesRawResult = await prisma.$queryRaw<{ count: number }[]>`SELECT COUNT(DISTINCT date)::int as count FROM "ScreenerPrice"`;
    console.timeEnd('raw SQL count distinct ScreenerPrice');
    console.log(`raw SQL count distinct ScreenerPrice: ${priceDatesRawResult[0]?.count}`);

    // 5. Benchmark raw SQL COUNT(DISTINCT date) for RankingHistory
    console.time('raw SQL count distinct RankingHistory');
    const rankDatesRawResult = await prisma.$queryRaw<{ count: number }[]>`SELECT COUNT(DISTINCT date)::int as count FROM "RankingHistory"`;
    console.timeEnd('raw SQL count distinct RankingHistory');
    console.log(`raw SQL count distinct RankingHistory: ${rankDatesRawResult[0]?.count}`);

    // 6. Check total rows in ScreenerPrice and RankingHistory
    console.time('counts');
    const [priceRows, rankRows] = await Promise.all([
        prisma.screenerPrice.count(),
        prisma.rankingHistory.count(),
    ]);
    console.timeEnd('counts');
    console.log(`Total rows - ScreenerPrice: ${priceRows}, RankingHistory: ${rankRows}`);

    console.log(`Total benchmark time: ${Date.now() - startOverall}ms`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
