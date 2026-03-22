export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4 md:gap-8 pb-8 md:pb-0 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-48 bg-slate-800/50 rounded-xl"></div>
        <div className="w-8 h-8 rounded-full bg-slate-800/50"></div>
      </div>

      {/* Row 1: Big Cards */}
      <div className="h-[240px] grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
        <div className="bg-slate-800/50 rounded-2xl border border-white/5"></div>
        <div className="bg-slate-800/50 rounded-2xl border border-white/5"></div>
        <div className="bg-slate-800/50 rounded-2xl border border-white/5"></div>
      </div>

      {/* Row 2: Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-8 h-[180px]">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-slate-800/50 rounded-2xl border border-white/5"></div>
        ))}
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-1 md:grid-cols-8 gap-4 md:gap-8 h-[200px]">
        <div className="md:col-span-3 bg-slate-800/50 rounded-2xl border border-white/5"></div>
        <div className="md:col-span-3 bg-slate-800/50 rounded-2xl border border-white/5"></div>
        <div className="md:col-span-2 bg-slate-800/50 rounded-2xl border border-white/5"></div>
      </div>

      {/* Charts */}
      <div className="flex flex-col md:flex-row gap-6 md:gap-8 h-[500px]">
        <div className="w-full md:w-[40%] bg-slate-800/50 rounded-2xl border border-white/5"></div>
        <div className="w-full md:w-[60%] bg-slate-800/50 rounded-2xl border border-white/5"></div>
      </div>
    </div>
  );
}
