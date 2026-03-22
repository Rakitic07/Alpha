'use client';

import { useTransactions, useSymbolMappings } from '@/hooks/useQueries';
import ManageTradesClient from './ManageTradesClient';

export default function TradesPage() {
  const { data: transactions, isLoading: transactionsLoading } = useTransactions();
  const { data: mappings, isLoading: mappingsLoading, isFetching } = useSymbolMappings();

  const isLoading = transactionsLoading || mappingsLoading;

  if (isLoading && (!transactions || !mappings)) {
    return null; // Next.js loading.tsx handles the skeleton
  }

  if (!transactions) {
    return <div className="text-center py-8 text-gray-400">Failed to load transactions</div>;
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
