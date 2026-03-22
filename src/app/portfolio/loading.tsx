export default function PortfolioLoading() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-10 w-64 bg-slate-800/50 rounded-xl mb-4"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-800/50 rounded-2xl border border-white/5"></div>
        ))}
      </div>
      <div className="h-[500px] bg-slate-800/50 rounded-2xl border border-white/5 mt-4"></div>
    </div>
  );
}
