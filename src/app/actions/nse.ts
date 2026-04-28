'use server';

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { unstable_cache } from 'next/cache';
import { getIndexQuotes, hasValidToken } from '@/lib/upstox-client';
import { logger } from '@/lib/logger';
import { istTimeParts } from '@/lib/tz';

const nseLogger = logger.scope('NSE');

// Re-define MarketIndex interface here to avoid Turbopack type export issues
export interface MarketIndex {
    name: string;
    symbol: string;
    percentChange: number;
    currentPrice: number;
}

const CACHE_FILE = path.join(os.tmpdir(), 'index_cache.json');

/**
 * Internal function to fetch market indices
 */
async function fetchNseIndicesInternal(): Promise<MarketIndex[]> {
    try {
        // Time Check: 9 AM to 4 PM IST
        const { hour } = istTimeParts();
        const isMarketHours = hour >= 9 && hour < 16;
        
        // Check if we should use cache (outside market hours)
        if (!isMarketHours) {
            nseLogger.info("Outside market hours. Checking cache...");
            try {
                const cacheData = await fs.readFile(CACHE_FILE, 'utf-8');
                const cachedIndices = JSON.parse(cacheData) as MarketIndex[];
                if (cachedIndices && cachedIndices.length > 0) {
                    nseLogger.info(`Serving ${cachedIndices.length} indices from cache.`);
                    return cachedIndices;
                }
            } catch {
                nseLogger.warn("Cache miss or error, will try live fetch.");
            }
        }

        // Check if we have a valid token
        const hasToken = await hasValidToken();
        
        if (!hasToken) {
            nseLogger.warn("No valid Upstox token. Trying cache...");
            try {
                const cacheData = await fs.readFile(CACHE_FILE, 'utf-8');
                const cachedIndices = JSON.parse(cacheData) as MarketIndex[];
                if (cachedIndices && cachedIndices.length > 0) {
                    nseLogger.info(`Serving ${cachedIndices.length} indices from cache (no token).`);
                    return cachedIndices;
                }
            } catch {
                nseLogger.warn("No cache available.");
            }
            return [];
        }

        nseLogger.info("Fetching live index data from Upstox...");
        
        const indices = await getIndexQuotes();
        
        if (indices.length > 0) {
            nseLogger.info(`Success! Fetched ${indices.length} indices. Updating cache.`);
            try {
                await fs.writeFile(CACHE_FILE, JSON.stringify(indices, null, 2));
            } catch (err) {
                nseLogger.error("Failed to write cache:", err);
            }
        }
        
        return indices;

    } catch (error) {
        nseLogger.error("Indices fetch error:", error);
        
        // Try to return cached data on error
        try {
            const cacheData = await fs.readFile(CACHE_FILE, 'utf-8');
            const cachedIndices = JSON.parse(cacheData) as MarketIndex[];
            if (cachedIndices && cachedIndices.length > 0) {
                nseLogger.info(`Error fallback: serving ${cachedIndices.length} indices from cache.`);
                return cachedIndices;
            }
        } catch {
            // No cache available
        }
        
        return [];
    }
}

/**
 * Fetch market indices using Upstox API
 * Uses Next.js cache with 30-second revalidation during market hours
 * Falls back to cached data outside market hours or if token is unavailable
 */
export const fetchNseIndices = unstable_cache(
    fetchNseIndicesInternal,
    ['nse-indices'],
    { 
        revalidate: 30, // Revalidate every 30 seconds during market hours
        tags: ['market-data'] 
    }
);
