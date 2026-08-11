'use server';

import { prisma } from '@/lib/db';
import { DailyPortfolioSnapshot, WeeklyPortfolioSnapshot, MonthlyPortfolioSnapshot } from '@prisma/client';

export async function getDailySnapshots(): Promise<DailyPortfolioSnapshot[]> {
  try {
    const snapshots = await prisma.dailyPortfolioSnapshot.findMany({
      orderBy: {
        date: 'desc',
      },
    });
    return snapshots;
  } catch (error) {
    console.error('Failed to fetch daily snapshots:', error);
    return [];
  }
}

export async function getWeeklySnapshots(): Promise<WeeklyPortfolioSnapshot[]> {
  try {
    const snapshots = await prisma.weeklyPortfolioSnapshot.findMany({
      orderBy: {
        date: 'desc',
      },
    });
    return snapshots;
  } catch (error) {
    console.error('Failed to fetch weekly snapshots:', error);
    return [];
  }
}

export async function getMonthlySnapshots(): Promise<MonthlyPortfolioSnapshot[]> {
  try {
    const snapshots = await prisma.monthlyPortfolioSnapshot.findMany({
      orderBy: {
        date: 'desc',
      },
    });

    // Deduplicate by year-month (keeping the latest snapshot per calendar month)
    const map = new Map<string, MonthlyPortfolioSnapshot>();
    for (const snapshot of snapshots) {
      const d = new Date(snapshot.date);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      if (!map.has(key)) {
        map.set(key, snapshot);
      }
    }
    return Array.from(map.values());
  } catch (error) {
    console.error('Failed to fetch monthly snapshots:', error);
    return [];
  }
}
