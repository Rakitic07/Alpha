import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { prisma } from './lib/db';
import { Prisma } from '@prisma/client';

async function fixRankType(rankType: 'filtered' | 'all') {
  // Get second-to-last date
  const dates = await prisma.rankingHistory.findMany({
    where: { rankType },
    select: { date: true },
    distinct: ['date'],
    orderBy: { date: 'desc' },
    take: 2,
  });
  if (dates.length < 2) { console.log(rankType + ': not enough dates'); return 0; }
  const prevDate = dates[1].date;
  console.log(rankType + ' prevDate: ' + prevDate);

  const prevRanks = await prisma.rankingHistory.findMany({
    where: { rankType, date: prevDate },
    select: { symbol: true, rank: true },
  });
  console.log(rankType + ' symbols: ' + prevRanks.length);

  // Build CASE WHEN bulk update in chunks of 100
  const CHUNK = 100;
  let updated = 0;

  for (let i = 0; i < prevRanks.length; i += CHUNK) {
    const slice = prevRanks.slice(i, i + CHUNK);
    const symbols = slice.map(r => r.symbol);

    // Build CASE WHEN expression
    const caseExpr = slice.map(r => `WHEN symbol = '${r.symbol.replace(/'/g, "''")}' THEN ${r.rank}`).join(' ');
    const inList = symbols.map(s => `'${s.replace(/'/g, "''")}'`).join(',');

    const sql = `UPDATE "MomentumScore" SET "prevRank" = CASE ${caseExpr} END WHERE "isActive" = 1 AND "rankType" = '${rankType}' AND "symbol" IN (${inList})`;

    await prisma.$executeRawUnsafe(sql);
    updated += slice.length;
    console.log('  ' + rankType + ' ' + updated + '/' + prevRanks.length);
  }

  return updated;
}

async function main() {
  const fUpdated = await fixRankType('filtered');
  const aUpdated = await fixRankType('all');

  // Verify
  const sample = await prisma.momentumScore.findMany({
    where: { isActive: true, rankType: 'filtered' },
    select: { symbol: true, rank: true, prevRank: true },
    orderBy: { rank: 'asc' },
    take: 5,
  });
  console.log('\nSample (filtered):');
  for (const s of sample) {
    const ch = s.prevRank !== null ? s.prevRank - s.rank : null;
    console.log('  ' + s.symbol + ' rank=' + s.rank + ' prevRank=' + s.prevRank + ' change=' + ch);
  }
  console.log('\nDone. filtered=' + fUpdated + ' all=' + aUpdated);
}

main().catch(e => { console.error('ERR:', e); process.exit(1); }).finally(() => prisma.$disconnect());
