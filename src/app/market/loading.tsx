export default function MarketLoading() {
  return (
    <div className="flex flex-col gap-4 md:gap-6 pb-24 md:pb-8 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 bg-slate-800/50 rounded-xl"></div>
        <div className="h-8 w-20 bg-slate-800/50 rounded-lg"></div>
      </div>

      {/* Sidebar + Content */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-5">
        {/* Index Sidebar skeleton */}
        <div className="md:w-[240px] lg:w-[260px] flex-shrink-0">
          <div className="bg-slate-900/50 rounded-2xl border border-white/5 p-3 flex flex-col gap-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800/30">
                <div className="h-3.5 w-20 bg-slate-800/50 rounded"></div>
                <div className="h-4 w-14 bg-slate-800/40 rounded"></div>
              </div>
            ))}
          </div>
        </div>

        {/* Main content skeleton */}
        <div className="flex-1 flex flex-col gap-4 md:gap-5 min-w-0">
          {/* Heatmap card */}
          <div className="bg-slate-900/50 rounded-2xl border border-white/5 p-1">
            <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="h-3 w-28 bg-slate-800/50 rounded"></div>
                <div className="flex items-baseline gap-2">
                  <div className="h-6 w-20 bg-slate-800/60 rounded"></div>
                  <div className="h-4 w-14 bg-slate-800/40 rounded"></div>
                </div>
              </div>
              <div className="flex-1 max-w-[340px] flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <div className="h-4 w-8 bg-slate-800/50 rounded"></div>
                  <div className="h-4 w-8 bg-slate-800/40 rounded"></div>
                </div>
                <div className="h-2.5 w-full bg-slate-800/50 rounded-full"></div>
              </div>
            </div>
            <div className="h-[400px] md:h-[500px] mx-4 mb-4 bg-slate-800/30 rounded-xl"></div>
          </div>

          {/* Top Movers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[0, 1].map(i => (
              <div key={i} className="bg-slate-900/50 rounded-2xl border border-white/5 p-5">
                <div className="h-4 w-24 bg-slate-800/50 rounded mb-4"></div>
                <div className="flex flex-col gap-3">
                  {[...Array(5)].map((_, j) => (
                    <div key={j} className="flex justify-between items-center">
                      <div className="h-3.5 w-20 bg-slate-800/40 rounded"></div>
                      <div className="h-5 w-14 bg-slate-800/40 rounded-md"></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sectoral Heatmap */}
      <div className="bg-slate-900/50 rounded-2xl border border-white/5 p-1">
        <div className="px-5 pt-5 pb-2">
          <div className="h-3 w-36 bg-slate-800/50 rounded"></div>
        </div>
        <div className="h-[350px] md:h-[400px] mx-4 mb-4 bg-slate-800/30 rounded-xl"></div>
      </div>
    </div>
  );
}
