'use server';

/**
 * Institutional Activity Server Action
 *
 * Fetches FII & DII cash market trading activity from Upstox.
 */

import {
  getInstitutionalCashActivity,
  type InstitutionalInterval,
  type InstitutionalActivityResponse,
} from '@/lib/upstox/institutional';

export async function fetchInstitutionalActivity(
  interval: InstitutionalInterval = 'Daily'
): Promise<InstitutionalActivityResponse> {
  try {
    return await getInstitutionalCashActivity(interval);
  } catch (error) {
    console.error(`[Institutional Action] Error fetching ${interval} activity:`, error);
    return {
      interval,
      points: [],
      summary: null,
      lastUpdated: '',
    };
  }
}
