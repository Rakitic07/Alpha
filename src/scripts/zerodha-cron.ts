/**
 * Zerodha Kite Orders Sync - Cron Script
 * 
 * This script syncs orders from Zerodha Kite to the database.
 * It can be scheduled to run daily via cron or called manually.
 * 
 * Usage:
 *   npx tsx src/scripts/zerodha-cron.ts
 * 
 * Cron Example (3:40 PM IST daily on weekdays):
 *   40 15 * * 1-5 cd /path/to/Alpha && npx tsx src/scripts/zerodha-cron.ts
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Module._load = function(request: string, parent: any, isMain: boolean) {
    if (request === 'next/cache') {
        return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

        // Wake the Neon serverless compute via the neon() HTTP endpoint before
        // the pg TCP pool dials it. This runs right before the first Prisma
        // query so the compute is still hot by the time queries land — firing
        // it earlier races against Neon's scale-to-zero during Kite login.
        async function warmupDb(maxAttempts = 4, delayMs = 5000): Promise<void> {
            const { neon } = await import('@neondatabase/serverless');
            const dbUrl = process.env.DATABASE_URL!;
            const sql = neon(dbUrl);
            for (let i = 0; i < maxAttempts; i++) {
                try {
                    await sql`SELECT 1`;
                    console.log(`[DB] HTTP warmup succeeded (attempt ${i + 1}).`);
                    return;
                } catch (err: unknown) {
                    if (i === maxAttempts - 1) throw err;
                    const errMsg = err instanceof Error ? err.message : String(err);
                    console.warn(`[DB] Warmup attempt ${i + 1} failed: ${errMsg}. Retrying in ${delayMs / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }

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

        // 5. Ingest with Deduplication (warm Neon immediately before first query)
        await warmupDb();
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

        // 6. Trigger Vercel cache revalidation (best-effort)
        if (result.synced > 0) {
            await triggerRevalidation();
        } else {
            console.log('No new orders synced, skipping revalidation.');
        }

        console.log('--- Zerodha Orders Sync Completed Successfully ---');
        process.exit(0);

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
}

main();
