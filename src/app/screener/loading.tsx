export default function ScreenerLoading() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-9 w-64 bg-zinc-800/60 rounded-lg" />
        <div className="flex gap-2">
          <div className="h-8 w-16 bg-zinc-800/50 rounded-lg" />
          <div className="h-8 w-8  bg-zinc-800/50 rounded-lg" />
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 bg-zinc-800/30 border border-white/5 rounded-xl p-1">
          {[80, 96, 80].map((w, i) => (
            <div key={i} className="h-8 bg-zinc-800/50 rounded-lg" style={{ width: w }} />
          ))}
        </div>
        <div className="flex gap-4">
          <div className="h-9 w-36 bg-zinc-800/30 border border-white/5 rounded-lg" />
          <div className="h-9 w-48 bg-zinc-800/30 border border-white/5 rounded-lg hidden md:block" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-800/60 overflow-hidden" style={{ height: 'calc(100vh - 250px)', minHeight: 400 }}>
        {/* Header row */}
        <div className="flex items-center gap-4 px-5 py-4 border-b border-zinc-800/60 bg-zinc-950">
          {[28, 140, 80, 160, 56, 90, 90, 48].map((w, i) => (
            <div key={i} className="h-3 bg-zinc-800/60 rounded" style={{ width: w }} />
          ))}
        </div>
        {/* Data rows */}
        {[...Array(14)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-zinc-800/20">
            {/* Rank */}
            <div className="h-7 w-7 bg-zinc-800/50 rounded" />
            {/* Stock */}
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="h-4 w-24 bg-zinc-800/50 rounded" />
              <div className="h-3 w-40 bg-zinc-800/30 rounded" />
            </div>
            {/* Marketcap */}
            <div className="h-3.5 w-14 bg-zinc-800/40 rounded" />
            {/* Trend */}
            <div className="h-9 w-40 bg-zinc-800/30 rounded" />
            {/* Score */}
            <div className="h-3.5 w-10 bg-zinc-800/40 rounded" />
            {/* DMA */}
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, j) => <div key={j} className="w-3.5 h-3.5 bg-zinc-800/40 rounded-sm" />)}
            </div>
            {/* ATH */}
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, j) => <div key={j} className="w-3.5 h-3.5 bg-zinc-800/40 rounded-sm" />)}
            </div>
            {/* DD */}
            <div className="h-3.5 w-12 bg-zinc-800/40 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
