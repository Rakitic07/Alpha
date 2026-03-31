import { NextResponse } from 'next/server';
import { getIndexQuotes, getLiveQuoteV3, INDEX_KEYS } from '@/lib/upstox-client';
import { apiLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const indexKeys = Object.values(INDEX_KEYS).slice(0, 5);
        
        apiLogger.info('Requesting keys:', indexKeys);
        
        // Test raw LTP V3 response
        const rawQuotes = await getLiveQuoteV3(indexKeys);
        apiLogger.info('Raw LTP V3 response keys:', Array.from(rawQuotes.keys()));
        
        // Test the getIndexQuotes function
        const indices = await getIndexQuotes();
        apiLogger.info('getIndexQuotes returned:', indices.length, 'indices');
        
        return NextResponse.json({
            requested: indexKeys,
            rawQuotesCount: rawQuotes.size,
            rawQuoteKeys: Array.from(rawQuotes.keys()),
            rawQuotes: Object.fromEntries(rawQuotes),
            indices,
        });
    } catch (error) {
        apiLogger.error('Error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
