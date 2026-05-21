import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { apiLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes timeout for Vercel

/**
 * GET /api/cron/sync-orders
 * 
 * Vercel Cron endpoint to trigger the Zerodha sync GitHub Action.
 * Since Puppeteer-based Kite authentication cannot run on Vercel Serverless,
 * this endpoint dispatches the GitHub Action workflow immediately.
 */
export async function GET(req: NextRequest) {
    const authError = verifyCronSecret(req);
    if (authError) return authError;

    const GITHUB_PAT = process.env.GITHUB_PAT;
    const REPO_OWNER = process.env.VERCEL_GIT_REPO_OWNER || process.env.GITHUB_REPO_OWNER;
    const REPO_NAME = process.env.VERCEL_GIT_REPO_SLUG || process.env.GITHUB_REPO_NAME;
    const REF = process.env.VERCEL_GIT_COMMIT_REF || 'main';

    if (!GITHUB_PAT) {
        apiLogger.error('[Sync Cron] GITHUB_PAT env variable is not set');
        return NextResponse.json(
            { error: 'GITHUB_PAT is required to trigger the sync' },
            { status: 500 }
        );
    }

    if (!REPO_OWNER || !REPO_NAME) {
        apiLogger.error('[Sync Cron] Repo owner or name could not be determined. Set VERCEL_GIT_REPO_OWNER/VERCEL_GIT_REPO_SLUG or GITHUB_REPO_OWNER/GITHUB_REPO_NAME');
        return NextResponse.json(
            { error: 'Repository owner or slug could not be determined.' },
            { status: 500 }
        );
    }

    try {
        apiLogger.info(`[Sync Cron] Triggering workflow on ${REPO_OWNER}/${REPO_NAME} (ref: ${REF})...`);
        
        const response = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/sync-orders.yml/dispatches`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${GITHUB_PAT}`,
                    'X-GitHub-Api-Version': '2022-11-28',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ref: REF
                })
            }
        );

        if (response.ok) {
            apiLogger.info('[Sync Cron] GitHub workflow dispatch triggered successfully.');
            return NextResponse.json({
                success: true,
                message: 'GitHub Actions workflow dispatch triggered successfully.'
            });
        } else {
            const errorText = await response.text();
            apiLogger.error(`[Sync Cron] Failed to trigger GitHub Action: ${response.status} ${response.statusText} - ${errorText}`);
            return NextResponse.json(
                { 
                    error: `GitHub API returned ${response.status}: ${response.statusText}`,
                    details: errorText
                },
                { status: 502 }
            );
        }
    } catch (error) {
        apiLogger.error('[Sync Cron] Unhandled error during workflow dispatch:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
