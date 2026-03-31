import { NextResponse } from 'next/server';
import { refreshSectorMappings } from '@/app/actions/sectors';
import { verifyCronSecret } from '@/lib/cron-auth';
import { apiLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for scraping

/**
 * Cron endpoint to refresh sector mappings from Zerodha
 * Scheduled monthly via cron scheduler
 * 
 * GET /api/cron/sector-refresh
 */
export async function GET(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  apiLogger.info('Starting monthly sector refresh...');
  
  try {
    const result = await refreshSectorMappings();
    
    if (result.success) {
      apiLogger.info(`Success: ${result.count} stocks mapped`);
      return NextResponse.json({ 
        success: true, 
        count: result.count,
        message: `Refreshed ${result.count} sector mappings`
      });
    } else {
      apiLogger.error('Failed:', result.error);
      return NextResponse.json({ 
        success: false, 
        error: result.error 
      }, { status: 500 });
    }
  } catch (error) {
    apiLogger.error('Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
