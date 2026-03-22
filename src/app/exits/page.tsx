'use client';

import React from 'react';
import { usePortfolioExits } from '@/hooks/useQueries';
import ExitsTable from '@/components/exits/ExitsTable';

export default function ExitsPage() {
  const { data: exits, isLoading, isFetching } = usePortfolioExits();

  if (isLoading && !exits) {
    return null; // Next.js loading.tsx handles the skeleton
  }

  if (!exits) {
    return <div className="text-center py-8 text-gray-400">Failed to load exits data</div>;
  }

  return (
    <main className="container mx-auto px-2 md:px-4 animate-fade-in max-w-7xl">
      {/* Background refresh indicator */}
      {isFetching && !isLoading && (
        <div className="fixed top-4 right-4 z-50 bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-xs flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
          Refreshing...
        </div>
      )}
      <ExitsTable exits={exits} />
    </main>
  );
}
