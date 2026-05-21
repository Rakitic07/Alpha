'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { searchStocks, StockSearchResult } from '@/app/actions/stocks';
import { motion, AnimatePresence } from 'framer-motion';

interface StockSearchProps {
  size?: 'sm' | 'lg';
  placeholder?: string;
  className?: string;
}

export default function StockSearch({
  size = 'lg',
  placeholder = 'Search stock symbol... (e.g., RELIANCE, TCS, INFY)',
  className = '',
}: StockSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search logic
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        const searchRes = await searchStocks(trimmed);
        setResults(searchRes);
      } catch (err) {
        console.error('Error searching stocks:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  // Reset selected suggestion index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  const handleSelect = (symbol: string) => {
    setIsOpen(false);
    setQuery('');
    router.push(`/fundamentals/${symbol.toUpperCase()}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        handleSelect(results[selectedIndex].symbol);
      } else if (query.trim().length > 0) {
        handleSelect(query.trim());
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const isLarge = size === 'lg';

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Search Input Container */}
      <div
        className={`flex items-center w-full bg-zinc-950/60 border rounded-2xl transition-all duration-300 shadow-lg backdrop-blur-md relative overflow-hidden ${
          isOpen ? 'border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : 'border-white/10 hover:border-white/20'
        }`}
      >
        {/* Search Icon */}
        <div className={`flex items-center justify-center text-zinc-400 ${isLarge ? 'pl-5 pr-3' : 'pl-3.5 pr-2'}`}>
          <svg
            className={`${isLarge ? 'w-5 h-5' : 'w-4 h-4'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Input Text Box */}
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full bg-transparent border-0 outline-none text-white placeholder-zinc-500 font-medium tracking-wide ${
            isLarge ? 'py-4 text-base rounded-2xl' : 'py-2.5 text-sm rounded-xl'
          }`}
        />

        {/* Right Side Icons (Loading Spinner / Clear Button) */}
        <div className={`flex items-center gap-2 pr-3.5`}>
          {loading && (
            <svg
              className="animate-spin h-4 w-4 text-blue-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          )}

          {!loading && query && (
            <button
              onClick={() => {
                setQuery('');
                setResults([]);
                setIsOpen(false);
              }}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Auto-suggestions Dropdown */}
      <AnimatePresence>
        {isOpen && (results.length > 0 || (query.trim().length >= 2 && !loading)) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 4 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-xl bg-zinc-950/90 border border-white/10 backdrop-blur-lg shadow-2xl divide-y divide-white/5 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
          >
            {results.length > 0 ? (
              results.map((item, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={item.symbol}
                    onClick={() => handleSelect(item.symbol)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex items-center justify-between w-full text-left px-4 py-3 transition-all ${
                      isSelected
                        ? 'bg-blue-600/10 text-white pl-5 border-l-2 border-blue-500'
                        : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <div>
                      <div className="font-bold font-mono text-sm tracking-wide flex items-center gap-2">
                        <span>{item.symbol}</span>
                        {item.exchange && (
                          <span className="text-[9px] font-sans font-bold tracking-wider px-1 py-0.5 rounded bg-white/5 text-zinc-500 border border-white/5 uppercase">
                            {item.exchange}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-medium mt-0.5 truncate max-w-xs sm:max-w-md">
                        {item.sector || 'Unknown Sector'}
                      </div>
                    </div>
                    <svg
                      className={`w-4 h-4 text-zinc-600 transition-transform ${
                        isSelected ? 'text-blue-500 translate-x-1' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-4 text-center text-sm text-zinc-500 font-medium">
                No stocks match &ldquo;<span className="text-zinc-300">{query}</span>&rdquo;
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
