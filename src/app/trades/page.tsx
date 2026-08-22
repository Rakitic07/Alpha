'use client';

import { useEffect, useState } from 'react';
import { useTransactions, useSymbolMappings } from '@/hooks/useQueries';
import ManageTradesClient from './ManageTradesClient';

export default function TradesPage() {
  // These queries fetch on the client, so the server render has no data yet.
  // Gate the first render on `mounted` so the server and the initial client
  // render always agree (a skeleton) — otherwise the data/error branches can
  // diverge and trigger a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: transactions, isLoading: transactionsLoading, isError } = useTransactions();
  const { data: mappings, isLoading: mappingsLoading, isFetching } = useSymbolMappings();

  const isLoading = transactionsLoading || mappingsLoading;

  if (!mounted || (isLoading && (!transactions || !mappings))) {
    return null; // Next.js loading.tsx handles the skeleton
  }

  // Only a genuine fetch error is a failure; missing-but-still-loading data
  // keeps showing the skeleton above.
  if (!transactions) {
    if (isError) {
      return <div className="text-center py-8 text-gray-400">Failed to load transactions</div>;
    }
    return null;
  }

  return (
    <main className="animate-fade-in flex flex-col h-[calc(100vh-8rem)]">
      {/* Background refresh indicator */}
      {isFetching && !isLoading && (
        <div className="fixed top-4 right-4 z-50 bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-xs flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
          Refreshing...
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ManageTradesClient
          initialTransactions={transactions}
          initialMappings={mappings || {}}
        />
      </div>
    </main>
  );
}
