'use server';

import { getTokenStatus } from '@/lib/upstox/auth';
import type { TokenStatus } from '@/lib/upstox/types';

/**
 * Get current Upstox token status
 */
export async function getUpstoxTokenStatus(): Promise<TokenStatus> {
  return getTokenStatus();
}
