import { prisma } from './lib/db';

async function main() {
  const date = process.argv[2];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('Usage: npx tsx scripts/delete-date.ts 2026-04-04');
    process.exit(1);
  }

  const scores = await prisma.momentumScore.deleteMany({ where: { computedDate: date } });
  const history = await prisma.rankingHistory.deleteMany({ where: { date } });
  const prices = await prisma.screenerPrice.deleteMany({ where: { date } });
  console.log(`Deleted for ${date}:`, { scores: scores.count, history: history.count, prices: prices.count });

  for (const rankType of ['filtered', 'all']) {
    const latest = await prisma.momentumScore.findFirst({
      where: { rankType },
      orderBy: { computedDate: 'desc' },
      select: { computedDate: true },
    });
    if (latest) {
      const updated = await prisma.momentumScore.updateMany({
        where: { computedDate: latest.computedDate, rankType },
        data: { isActive: true },
      });
      console.log(`Re-activated ${rankType} for ${latest.computedDate}: ${updated.count} rows`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
