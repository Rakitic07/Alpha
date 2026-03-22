import { fetchMarketOverview, fetchAllIndexSummaries } from '@/app/actions/market-overview';
import MarketOverviewClient from './MarketOverviewClient';

// No SSR caching — always fetch fresh data on page load
export const dynamic = 'force-dynamic';

export default async function MarketOverviewPage() {
  // Pre-fetch initial data on the server in parallel!
  // NIFTY Total Market is the default selected index for the page.
  const [summariesRes, indexRes] = await Promise.all([
    fetchAllIndexSummaries(),
    fetchMarketOverview('NIFTY Total Market')
  ]);

  const tokenStatus = indexRes?.tokenStatus || summariesRes?.tokenStatus || null;

  return (
    <MarketOverviewClient
      initialSummaries={summariesRes?.summaries || []}
      initialData={indexRes}
      initialTokenStatus={tokenStatus}
    />
  );
}
