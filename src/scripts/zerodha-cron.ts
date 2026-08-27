/**
 * Zerodha Kite Orders Sync - Cron Script
 * 
 * This script syncs orders from Zerodha Kite to the database.
 * It can be scheduled to run daily via cron or called manually.
 * 
 * Usage:
 *   npx tsx src/scripts/zerodha-cron.ts
 * 
 * Cron Example (3:45 PM IST daily on weekdays, after 3:40 PM closing auction):
 *   45 15 * * 1-5 cd /path/to/Alpha && npx tsx src/scripts/zerodha-cron.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from .env.local or .env
const envLocalPath = path.resolve(__dirname, '../../.env.local');
const envPath = path.resolve(__dirname, '../../.env');

if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
}
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}
// In CI/CD (GitHub Actions), env vars are injected directly into process.env, so dotenv is optional.

// --- MOCK Next.js Internals for Script Execution ---
// This allows us to reuse code from src/lib/finance.ts and src/app/actions.ts without refactoring
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;

 
Module._load = function(request: string, parent: any, isMain: boolean) {
    if (request === 'next/cache') {
        return {
             
            unstable_cache: (fn: any) => fn,
            revalidateTag: () => console.log('[Mock] revalidateTag'),
            revalidatePath: () => console.log('[Mock] revalidatePath'),
        };
    }
    if (request === 'next/server') {
        return {};
    }
    if (request === 'server-only') {
        return {};
    }
    return originalLoad(request, parent, isMain);
};
// --------------------------------------------------

import type { KiteOrder } from '../lib/import-service';

/**
 * Trigger a full portfolio recompute on the live Vercel deployment via SSE endpoint.
 * Consumes the SSE stream and logs progress until the server signals completion.
 * Best-effort: failure here won't crash the script.
 */
async function triggerRecompute(): Promise<void> {
    const appUrl = process.env.NEXT_APP_URL;
    const cronSecret = process.env.CRON_SECRET;

    if (!appUrl) {
        console.warn('[Recompute] NEXT_APP_URL not set, skipping recompute.');
        return;
    }

    // When CRON_SECRET is not set the server allows all requests (dev mode),
    // so we simply omit the Authorization header rather than skipping.
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cronSecret) {
        headers['Authorization'] = `Bearer ${cronSecret}`;
    }

    try {
        console.log(`[Recompute] Calling ${appUrl}/api/recompute ...`);
        const response = await fetch(`${appUrl}/api/recompute`, {
            method: 'POST',
            headers,
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`[Recompute] Failed (${response.status}):`, text);
            return;
        }

        // Consume the SSE stream until done
        const reader = response.body?.getReader();
        if (!reader) {
            console.error('[Recompute] No response body to read.');
            return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const payload = JSON.parse(line.slice(6));
                    if (payload.error) {
                        console.error(`[Recompute] Error: ${payload.error}`);
                    } else {
                        console.log(`[Recompute] [${payload.progress ?? '?'}%] ${payload.message ?? ''}`);
                    }
                    if (payload.done) {
                        console.log('[Recompute] Completed successfully.');
                        return;
                    }
                } catch {
                    // ignore malformed SSE lines
                }
            }
        }
        console.log('[Recompute] Stream ended.');
    } catch (error) {
        console.error('[Recompute] Error calling recompute endpoint:', error);
    }
}

/**
 * Trigger the momentum screener pipeline on the live Vercel deployment.
 * Called after recompute so today's trades are already reflected.
 * The Vercel cron (vercel.json) acts as a fallback if the GH Action never runs.
 * Best-effort: failure here won't crash the script.
 */
async function triggerScreener(): Promise<void> {
    const appUrl = process.env.NEXT_APP_URL;
    const cronSecret = process.env.CRON_SECRET;

    if (!appUrl) {
        console.warn('[Screener] NEXT_APP_URL not set, skipping screener.');
        return;
    }

    const headers: Record<string, string> = {};
    if (cronSecret) {
        headers['x-cron-secret'] = cronSecret;
    }

    try {
        console.log(`[Screener] Calling ${appUrl}/api/cron/momentum-screener ...`);
        const response = await fetch(`${appUrl}/api/cron/momentum-screener`, {
            method: 'GET',
            headers,
            // Screener pipeline can take several minutes
            signal: AbortSignal.timeout(10 * 60 * 1000),
        });

        if (response.ok) {
            const text = await response.text();
            console.log('[Screener] Completed successfully:', text.slice(0, 200));
        } else {
            const text = await response.text();
            console.error(`[Screener] Failed (${response.status}):`, text);
        }
    } catch (error) {
        console.error('[Screener] Error calling screener endpoint:', error);
    }
}

/**
 * Trigger cache revalidation on the live Vercel deployment.
 * This ensures all pages (Portfolio, Exits, Dashboard, etc.) reflect new data.
 * Best-effort: failure here won't crash the script.
 */
async function triggerRevalidation(): Promise<void> {
    const appUrl = process.env.NEXT_APP_URL;

    if (!appUrl) {
        console.warn('[Revalidate] NEXT_APP_URL not set, skipping revalidation.');
        return;
    }

    try {
        console.log(`[Revalidate] Calling ${appUrl}/api/revalidate ...`);
        const response = await fetch(`${appUrl}/api/revalidate`, {
            method: 'POST',
        });

        if (response.ok) {
            const data = await response.json();
            console.log('[Revalidate] Success:', data);
        } else {
            const text = await response.text();
            console.error(`[Revalidate] Failed (${response.status}):`, text);
        }
    } catch (error) {
        console.error('[Revalidate] Error calling revalidation endpoint:', error);
    }
}

async function main() {
    try {
        console.log('--- Zerodha Orders Sync Started ---');
        console.log(`Time: ${new Date().toISOString()}`);

        const { getAuthenticatedKiteClient, fetchExecutedOrders, validateKiteConfig } = await import('../lib/kite-client');
        const { ingestOrdersWithDeduplication } = await import('../lib/import-service');


        // 1. Validate Configuration
        const configCheck = validateKiteConfig();
        if (!configCheck.valid) {
            console.error('Missing required Zerodha credentials:', configCheck.missing.join(', '));
            process.exit(1);
        }

        // 2. Get Authenticated Kite Client
        const kc = await getAuthenticatedKiteClient();

        // 3. Fetch Executed Orders
        const executedOrders = await fetchExecutedOrders(kc);
        
        if (executedOrders.length === 0) {
            console.log('No executed orders found for today.');
            process.exit(0);
        }

        console.log(`Fetched ${executedOrders.length} executed orders.`);

        // 4. Convert to KiteOrder format
        const orders: KiteOrder[] = executedOrders.map(o => ({
            orderId: o.orderId,
            symbol: o.symbol,
            transactionType: o.transactionType,
            quantity: o.quantity,
            averagePrice: o.averagePrice,
            orderTimestamp: o.orderTimestamp
        }));

        // 5. Ingest with Deduplication
        console.log('Processing import...');
        const result = await ingestOrdersWithDeduplication(
            orders,
            'auto-cron-orders',
            (msg, progress) => {
                console.log(`[${progress}%] ${msg}`);
            }
        );
        
        console.log('Import Result:', result);
        console.log(`Synced: ${result.synced}, Skipped: ${result.skipped}`);

        // 6. Recompute portfolio history + revalidate cache (best-effort)
        if (result.synced > 0) {
            // Chain: recompute (recalculates history + revalidates) → screener
            await triggerRecompute();
            await triggerScreener();
        } else {
            console.log('No new orders synced, skipping recompute and screener.');
        }

        console.log('--- Zerodha Orders Sync Completed Successfully ---');
        process.exit(0);

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
}

main();
