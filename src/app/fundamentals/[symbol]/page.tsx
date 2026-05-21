import { getInstrumentData } from '@/lib/upstox';
import { getCompanyFundamentals } from '@/lib/upstox/fundamentals';
import FundamentalsClient from '@/components/fundamentals/FundamentalsClient';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = Promise<{ symbol: string }> | { symbol: string };

interface PageProps {
  params: Params;
}

// Fallback mapping for primary mock companies in case instrument master is loading / empty
const SYMBOL_TO_ISIN: Record<string, string> = {
  RELIANCE: 'INE002A01018',
  TCS: 'INE467B01029',
  INFY: 'INE009A01021',
  HDFCBANK: 'INE040A01034',
};

export async function generateMetadata({ params }: PageProps) {
  const resolvedParams = await params;
  const symbol = resolvedParams.symbol.toUpperCase();
  return {
    title: `${symbol} Fundamentals | Alpha`,
    description: `Detailed fundamentals dashboard for ${symbol}. Review financial statements (balance sheet, income statement, cash flow), shareholding patterns, key ratios, corporate actions, and competitors.`,
  };
}

export default async function FundamentalsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const rawSymbol = resolvedParams.symbol;
  
  if (!rawSymbol) {
    notFound();
  }

  const symbol = rawSymbol.toUpperCase();
  
  // 1. Resolve Instrument to get ISIN
  let isin = SYMBOL_TO_ISIN[symbol];
  let companyName = symbol;
  
  try {
    const instrument = await getInstrumentData(symbol);
    if (instrument) {
      if (instrument.isin) {
        isin = instrument.isin;
      }
      companyName = instrument.name || symbol;
    }
  } catch (error) {
    console.error(`[Fundamentals Page] Error resolving instrument for ${symbol}:`, error);
  }

  // If we can't find an ISIN, use a dynamic mock-compatible format
  if (!isin) {
    isin = `MOCK_${symbol}`;
  }

  // 2. Fetch Fundamentals
  try {
    const data = await getCompanyFundamentals(isin, symbol);
    
    return (
      <div className="min-h-screen text-zinc-100 py-6 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <FundamentalsClient 
            symbol={symbol} 
            resolvedName={companyName}
            resolvedIsin={isin}
            initialData={data} 
          />
        </div>
      </div>
    );
  } catch (error) {
    console.error(`[Fundamentals Page] Failed to fetch fundamentals for ${symbol}:`, error);
    
    // Direct server-side recovery fallback to generic mock data rather than crashing
    return (
      <div className="min-h-screen text-zinc-100 py-6 px-4 md:px-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-zinc-900/50 border border-zinc-800 backdrop-blur-md rounded-xl p-6 text-center shadow-xl">
          <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Data</h2>
          <p className="text-sm text-zinc-400 mb-6">
            Unable to load fundamentals for {symbol}. The Upstox API returned an error and mock data failed.
          </p>
          <a
            href="/screener"
            className="inline-flex items-center justify-center px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-semibold transition-all border border-white/5"
          >
            Return to Screener
          </a>
        </div>
      </div>
    );
  }
}
