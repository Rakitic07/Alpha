import { prisma } from '@/lib/db';
import { startOfDay, format, differenceInDays, subYears } from 'date-fns';
import { unstable_cache, revalidateTag } from 'next/cache';
import { financeLogger } from '@/lib/logger';
import { istDateParts, istDayOfWeek } from '@/lib/tz';
import { getPortfolioHoldings, calculatePortfolioXIRR, computeMarketCapSegmentation } from './holdings';

export async function getDashboardHistory(days?: number) {
    // Only apply date filter if days is provided
    let whereClause = {};

    if (days) {
        const today = new Date();
        const startDate = new Date();
        startDate.setDate(today.getDate() - days);
        whereClause = {
            date: {
                gte: startDate
            }
        };
    }

    const snapshots = await prisma.dailyPortfolioSnapshot.findMany({
        where: whereClause,
        orderBy: {
            date: 'asc'
        },
        select: {
            date: true,
            totalEquity: true,
            portfolioNAV: true,
            drawdown: true
        }
    });

    return snapshots.map(s => ({
        date: s.date.toISOString(), // formatting for Recharts
        totalEquity: s.totalEquity,
        portfolioNAV: s.portfolioNAV,
        drawdown: s.drawdown ?? 0
    }));
}

export async function captureWeeklySnapshot() {
    financeLogger.info("Capturing Weekly Snapshot...");
    const today = new Date();
    const todayStart = startOfDay(today);

    // 1. Get Current Holdings
    const holdings = await getPortfolioHoldings();

    // 2. Get latest Daily Snapshot for TotalEquity/NAV/Invested
    const latestDaily = await prisma.dailyPortfolioSnapshot.findFirst({
        orderBy: { date: 'desc' }
    });

    if (!latestDaily) {
        financeLogger.error("No daily snapshot found. Cannot capture weekly stats.");
        return;
    }

    const totalEquity = latestDaily.totalEquity;
    const nav = latestDaily.portfolioNAV;
    const investedCapital = latestDaily.investedCapital;

    // 3. Market Cap Segmentation (using AMFI classifications)
    const mcapResult = await computeMarketCapSegmentation(holdings);
    const { large, mid, small, micro } = mcapResult;

    const stockTotal = large + mid + small + micro;
    const largePct = stockTotal > 0 ? (large / stockTotal) * 100 : 0;
    const midPct = stockTotal > 0 ? (mid / stockTotal) * 100 : 0;
    const smallPct = stockTotal > 0 ? (small / stockTotal) * 100 : 0;
    const microPct = stockTotal > 0 ? (micro / stockTotal) * 100 : 0;

    // Note: portfolioMcap (weighted average market cap) is no longer calculated
    // as we use AMFI categories instead of raw market cap values
    const portfolioMcap = 0;

    // 4. Performance Stats (Win/Loss)
    const allTx = await prisma.transaction.findMany({
        orderBy: { date: 'asc' }
    });

    let wins = 0, losses = 0;
    let totalWinPct = 0, totalLossPct = 0;
    let totalHoldDays = 0, closedTradesCount = 0;

    const inventory = new Map<string, { qty: number, price: number, date: Date }[]>();

    for (const tx of allTx) {
        if (!inventory.has(tx.symbol)) inventory.set(tx.symbol, []);
        const queue = inventory.get(tx.symbol)!;

        if (tx.type === 'BUY') {
            queue.push({ qty: tx.quantity, price: tx.price, date: tx.date });
        } else {
            // SELL
            let qtySold = tx.quantity;
            let aquiredDateSum = 0;
            let currentTradeCost = 0;
            const batchSize = qtySold;

            while (qtySold > 0 && queue.length > 0) {
                 const batch = queue[0];
                 const take = Math.min(batch.qty, qtySold);

                 currentTradeCost += take * batch.price;
                 const days = (tx.date.getTime() - batch.date.getTime()) / (1000 * 3600 * 24);
                 aquiredDateSum += days * take;

                 batch.qty -= take;
                 if (batch.qty < 0.0001) queue.shift();
                 qtySold -= take;
            }

            const soldVal = batchSize * tx.price;
            const tradePnl = soldVal - currentTradeCost;
            const tradePct = currentTradeCost > 0 ? tradePnl / currentTradeCost : 0;

            if (tradePnl > 0) {
                wins++;
                totalWinPct += tradePct;
            } else {
                losses++;
                totalLossPct += tradePct;
            }

            const avgDuration = batchSize > 0 ? aquiredDateSum / batchSize : 0;
            totalHoldDays += avgDuration;
            closedTradesCount++;
        }
    }

    const winPercent = closedTradesCount > 0 ? (wins / closedTradesCount) * 100 : 0;
    const lossPercent = closedTradesCount > 0 ? (losses / closedTradesCount) * 100 : 0;
    const avgWinnerGain = wins > 0 ? (totalWinPct / wins) * 100 : 0;
    const avgLoserLoss = losses > 0 ? (totalLossPct / losses) * 100 : 0;
    const avgHoldingPeriod = closedTradesCount > 0 ? totalHoldDays / closedTradesCount : 0;

    // Stats
    const xirrVal = await calculatePortfolioXIRR(totalEquity);
    const pnl = totalEquity - investedCapital;

    // Calc Weekly Return
    let weeklyReturn = 0;
    const prevSnapshot = await prisma.weeklyPortfolioSnapshot.findFirst({
        where: { date: { lt: todayStart } },
        orderBy: { date: 'desc' }
    });
    if (prevSnapshot && prevSnapshot.nav > 0) {
        weeklyReturn = (nav / prevSnapshot.nav) - 1;
    }

    // Save
    await prisma.weeklyPortfolioSnapshot.upsert({
        where: { date: todayStart },
        update: {
             totalEquity,
             nav,
             weeklyReturn,
             largeCapPercent: largePct,
             midCapPercent: midPct,
             smallCapPercent: smallPct,
             microCapPercent: microPct,

             marketCap: portfolioMcap,
             xirr: xirrVal,
             pnl,
             winPercent,
             lossPercent,
             avgHoldingPeriod,
             avgWinnerGain,
             avgLoserLoss
        },
        create: {
             date: todayStart,
             totalEquity,
             nav,
             weeklyReturn,
             largeCapPercent: largePct,
             midCapPercent: midPct,
             smallCapPercent: smallPct,
             microCapPercent: microPct,

             marketCap: portfolioMcap,
             xirr: xirrVal,
             pnl,
             winPercent,
             lossPercent,
             avgHoldingPeriod,
             avgWinnerGain,
             avgLoserLoss
        }
    });

    financeLogger.info("Weekly Snapshot Captured.");
}

export async function captureMonthlySnapshot() {
    financeLogger.info("Capturing Monthly Snapshot...");
    const today = new Date();
    const todayStart = startOfDay(today);

    // Delete any existing monthly snapshot from the same month to prevent duplicates
    // (recalculation may have created one on a different date within this month)
    const monthStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
    const monthEnd = new Date(Date.UTC(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999));
    await prisma.monthlyPortfolioSnapshot.deleteMany({
        where: { date: { gte: monthStart, lte: monthEnd } }
    });

    // 1. Get Current Holdings
    const holdings = await getPortfolioHoldings();

    // 2. Get latest Daily Snapshot for TotalEquity/NAV
    const latestDaily = await prisma.dailyPortfolioSnapshot.findFirst({
        orderBy: { date: 'desc' }
    });

    if (!latestDaily) {
        financeLogger.error("No daily snapshot found. Cannot capture monthly stats.");
        return;
    }

    const totalEquity = latestDaily.totalEquity;
    const nav = latestDaily.portfolioNAV;

    // 3. Market Cap Segmentation (using AMFI classifications)
    const mcapResult = await computeMarketCapSegmentation(holdings);
    const { large, mid, small, micro } = mcapResult;

    const stockTotal = large + mid + small + micro;
    const largePct = stockTotal > 0 ? (large / stockTotal) * 100 : 0;
    const midPct = stockTotal > 0 ? (mid / stockTotal) * 100 : 0;
    const smallPct = stockTotal > 0 ? (small / stockTotal) * 100 : 0;
    const microPct = stockTotal > 0 ? (micro / stockTotal) * 100 : 0;
    // Note: portfolioMcap is no longer calculated as we use AMFI categories
    const portfolioMcap = 0;

    // 4. Performance Stats (Same as Weekly)
    const allTx = await prisma.transaction.findMany({ orderBy: { date: 'asc' } });
    let wins = 0, losses = 0;
    let totalWinPct = 0, totalLossPct = 0;
    let totalHoldDays = 0, closedTradesCount = 0;
    const inventory = new Map<string, { qty: number, price: number, date: Date }[]>();

    for (const tx of allTx) {
        if (!inventory.has(tx.symbol)) inventory.set(tx.symbol, []);
        const queue = inventory.get(tx.symbol)!;
        if (tx.type === 'BUY') {
            queue.push({ qty: tx.quantity, price: tx.price, date: tx.date });
        } else {
             // SELL
            let qtySold = tx.quantity;
            let aquiredDateSum = 0;
            let currentTradeCost = 0;
            const batchSize = qtySold;

            while (qtySold > 0 && queue.length > 0) {
                 const batch = queue[0];
                 const take = Math.min(batch.qty, qtySold);
                 currentTradeCost += take * batch.price;
                 const days = (tx.date.getTime() - batch.date.getTime()) / (1000 * 3600 * 24);
                 aquiredDateSum += days * take;
                 batch.qty -= take;
                 if (batch.qty < 0.0001) queue.shift();
                 qtySold -= take;
            }
            const soldVal = batchSize * tx.price;
            const tradePnl = soldVal - currentTradeCost;
            const tradePct = currentTradeCost > 0 ? tradePnl / currentTradeCost : 0;
            if (tradePnl > 0) { wins++; totalWinPct += tradePct; }
            else { losses++; totalLossPct += tradePct; }
            totalHoldDays += batchSize > 0 ? aquiredDateSum / batchSize : 0;
            closedTradesCount++;
        }
    }

    const winPercent = closedTradesCount > 0 ? (wins / closedTradesCount) * 100 : 0;
    const lossPercent = closedTradesCount > 0 ? (losses / closedTradesCount) * 100 : 0;
    const avgWinnerGain = wins > 0 ? (totalWinPct / wins) * 100 : 0;
    const avgLoserLoss = losses > 0 ? (totalLossPct / losses) * 100 : 0;
    const avgHoldingPeriod = closedTradesCount > 0 ? totalHoldDays / closedTradesCount : 0;

    const xirrVal = await calculatePortfolioXIRR(totalEquity);
    // PnL based on Invested Capital
    // Need invested capital from latest daily
    const investedCapital = latestDaily.investedCapital;
    const pnl = totalEquity - investedCapital;

    // Calc Monthly Return
    let monthlyReturn = 0;
    const prevSnapshot = await prisma.monthlyPortfolioSnapshot.findFirst({
        where: { date: { lt: todayStart } },
        orderBy: { date: 'desc' }
    });
    if (prevSnapshot && prevSnapshot.nav > 0) {
        monthlyReturn = (nav / prevSnapshot.nav) - 1;
    }

    await prisma.monthlyPortfolioSnapshot.upsert({
        where: { date: todayStart },
        update: {
             totalEquity,
             nav,
             monthlyReturn,
             largeCapPercent: largePct,
             midCapPercent: midPct,
             smallCapPercent: smallPct,
             microCapPercent: microPct,
             marketCap: portfolioMcap,
             xirr: xirrVal,
             pnl,
             winPercent,
             lossPercent,
             avgHoldingPeriod,
             avgWinnerGain,
             avgLoserLoss
        },
        create: {
             date: todayStart,
             totalEquity,
             nav,
             monthlyReturn,
             largeCapPercent: largePct,
             midCapPercent: midPct,
             smallCapPercent: smallPct,
             microCapPercent: microPct,
             marketCap: portfolioMcap,
             xirr: xirrVal,
             pnl,
             winPercent,
             lossPercent,
             avgHoldingPeriod,
             avgWinnerGain,
             avgLoserLoss
        }
    });
    financeLogger.info("Monthly Snapshot Captured.");
}

// Get latest portfolio stats for dashboard
async function getLatestPortfolioStatsInternal() {
    const snapshot = await prisma.weeklyPortfolioSnapshot.findFirst({
        orderBy: { date: 'desc' }
    });

    if (!snapshot) {
        return {
            largeCapPercent: 0,
            midCapPercent: 0,
            smallCapPercent: 0,
            microCapPercent: 0,
            winPercent: 0,
            lossPercent: 0,
            avgHoldingPeriod: 0,
            avgWinnerGain: 0,
            avgLoserLoss: 0
        };
    }

    return {
        largeCapPercent: snapshot.largeCapPercent || 0,
        midCapPercent: snapshot.midCapPercent || 0,
        smallCapPercent: snapshot.smallCapPercent || 0,
        microCapPercent: snapshot.microCapPercent || 0,
        winPercent: snapshot.winPercent || 0,
        lossPercent: 100 - (snapshot.winPercent || 0), // Losers = 100 - Winners
        avgHoldingPeriod: snapshot.avgHoldingPeriod || 0,
        avgWinnerGain: snapshot.avgWinnerGain || 0,
        avgLoserLoss: snapshot.avgLoserLoss || 0
    };
}

export const getLatestPortfolioStats = unstable_cache(
    getLatestPortfolioStatsInternal,
    ['portfolio-latest-stats'],
    { tags: ['portfolio-data'], revalidate: 300 }
);

// Get dashboard stats (NAV, DD, returns)
async function getDashboardStatsInternal() {
    // Get latest daily snapshot for NAV and DD
    const latestDaily = await prisma.dailyPortfolioSnapshot.findFirst({
        orderBy: { date: 'desc' }
    });

    // Get latest weekly snapshot for weekly return
    // If we're at the start of a new week (Monday-Thursday) and the latest weekly snapshot
    // is from this week with 0 return, show the previous week's data instead.
    // Anchor to the IST trading week so this branch fires on the right day even
    // when the server runs in UTC.
    const today = new Date();
    const dayOfWeek = istDayOfWeek(today); // 0 = Sunday, 1 = Monday, ..., 5 = Friday

    let weeklySnapshotToUse = await prisma.weeklyPortfolioSnapshot.findFirst({
        orderBy: { date: 'desc' }
    });

    // If it's Monday (1) through Thursday (4) and the latest snapshot is from this week with 0 return
    // Or if it's Friday but the snapshot is from today (just created)
    if (weeklySnapshotToUse && dayOfWeek >= 1 && dayOfWeek <= 4) {
        const snapshotDate = new Date(weeklySnapshotToUse.date);
        const daysSinceSnapshot = differenceInDays(today, snapshotDate);

        // If the snapshot is from this week (less than 7 days old) and return is 0,
        // fetch the previous week's snapshot
        if (daysSinceSnapshot < 7 && Math.abs(weeklySnapshotToUse.weeklyReturn ?? 0) < 0.0001) {
            const previousWeekSnapshot = await prisma.weeklyPortfolioSnapshot.findFirst({
                where: { date: { lt: snapshotDate } },
                orderBy: { date: 'desc' }
            });
            if (previousWeekSnapshot) {
                weeklySnapshotToUse = previousWeekSnapshot;
            }
        }
    }

    // Get latest monthly snapshot for monthly return
    const latestMonthly = await prisma.monthlyPortfolioSnapshot.findFirst({
        orderBy: { date: 'desc' }
    });

    // Calculate YTD return: from first daily snapshot of current year (IST).
    const currentYear = istDateParts().year;
    const startOfYear = new Date(Date.UTC(currentYear, 0, 1));

    const firstOfYear = await prisma.dailyPortfolioSnapshot.findFirst({
        where: { date: { gte: startOfYear } },
        orderBy: { date: 'asc' }
    });

    let yearReturn = 0;
    if (firstOfYear && latestDaily && firstOfYear.portfolioNAV > 0) {
        yearReturn = ((latestDaily.portfolioNAV / firstOfYear.portfolioNAV) - 1) * 100;
    }

    // Calculate 1Y return: from snapshot ~1 year ago
    const oneYearAgo = subYears(new Date(), 1);
    const oneYearSnapshot = await prisma.dailyPortfolioSnapshot.findFirst({
        where: { date: { gte: oneYearAgo } },
        orderBy: { date: 'asc' }
    });

    let oneYearReturn = 0;
    if (oneYearSnapshot && latestDaily && oneYearSnapshot.portfolioNAV > 0) {
        oneYearReturn = ((latestDaily.portfolioNAV / oneYearSnapshot.portfolioNAV) - 1) * 100;
    }

    return {
        currentNAV: latestDaily?.portfolioNAV || 0,
        currentDD: (latestDaily?.drawdown || 0) * 100,
        weekReturn: (weeklySnapshotToUse?.weeklyReturn || 0) * 100,
        monthReturn: (latestMonthly?.monthlyReturn || 0) * 100,
        yearReturn,
        oneYearReturn
    };
}

export const getDashboardStats = unstable_cache(
    getDashboardStatsInternal,
    ['dashboard-stats'],
    { tags: ['portfolio-data'], revalidate: 300 }
);

/**
 * Capture a holiday snapshot by cloning the previous day's data.
 * Used when the market is closed to avoid unnecessary recalculation.
 */
export async function captureHolidaySnapshot(date: Date = new Date()) {
    const today = startOfDay(date);

    // Check if snapshot already exists for today
    const existing = await prisma.dailyPortfolioSnapshot.findFirst({
        where: { date: today }
    });

    if (existing) {
        financeLogger.info(`[Snapshot] Snapshot for ${format(today, 'yyyy-MM-dd')} already exists. Skipping holiday clone.`);
        return;
    }

    // Get latest available snapshot
    const latest = await prisma.dailyPortfolioSnapshot.findFirst({
        orderBy: { date: 'desc' }
    });

    if (!latest) {
        financeLogger.warn('[Snapshot] No previous snapshot found to clone.');
        return;
    }

    financeLogger.info(`[Snapshot] Cloning snapshot from ${format(latest.date, 'yyyy-MM-dd')} for Holiday/Closed Market (${format(today, 'yyyy-MM-dd')})`);

    // Create new snapshot with same values but today's date
    await prisma.dailyPortfolioSnapshot.create({
        data: {
            date: today,
            totalEquity: latest.totalEquity,
            investedCapital: latest.investedCapital,
            portfolioNAV: latest.portfolioNAV,
            niftyNAV: latest.niftyNAV,
            units: latest.units,

            // Zero out daily changes
            cashflow: 0,
            dailyPnL: 0,
            dailyReturn: 0,

            // Carry over risk metrics
            drawdown: latest.drawdown,
            navMA200: latest.navMA200,

            // Carry over index benchmarks
            nifty500Momentum50NAV: latest.nifty500Momentum50NAV,
            niftyMicrocap250NAV: latest.niftyMicrocap250NAV,
            niftyMidcap100NAV: latest.niftyMidcap100NAV,
            niftySmallcap250NAV: latest.niftySmallcap250NAV
        }
    });

    // Also revalidate paths
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (revalidateTag as any)('portfolio-data', 'max');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (revalidateTag as any)('dashboard-stats', 'max');
}
