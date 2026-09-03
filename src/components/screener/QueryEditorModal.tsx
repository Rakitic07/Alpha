'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type ScreenerQueryFilters,
  type PortfolioMode,
  countActiveFilters,
} from '@/lib/screener/filter-query';
import {
  saveScreenerQuery,
  deleteScreenerQuery,
  type SavedQuery,
  type ScreenerBaseTab,
} from '@/app/actions/screener-queries';

const MCAP_CATS = ['Large', 'Mid', 'Small', 'Micro'] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  baseTab: ScreenerBaseTab;
  filters: ScreenerQueryFilters;
  activeQuery: SavedQuery | null;
  onApply: (filters: ScreenerQueryFilters) => void;
  onSaved: (q: SavedQuery) => void;
  onDeleted: (id: number) => void;
}

// ── Small controls ────────────────────────────────────────────────────────────

function NumField({
  label, value, onChange, placeholder, step, suffix,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          step={step ?? 'any'}
          value={value ?? ''}
          placeholder={placeholder ?? '—'}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? null : Number(raw));
          }}
          className="w-full bg-zinc-900/70 border border-zinc-700/60 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 tabular-nums outline-none focus:border-blue-500/50"
        />
        {suffix && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
        checked
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
          : 'bg-zinc-900/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
      }`}
    >
      <span className={`w-3.5 h-3.5 rounded border grid place-items-center ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600'}`}>
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{title}</h4>
      {children}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function QueryEditorModal({
  open, onClose, baseTab, filters, activeQuery, onApply, onSaved, onDeleted,
}: Props) {
  const [draft, setDraft] = useState<ScreenerQueryFilters>(filters);
  const [tab, setTab] = useState<ScreenerBaseTab>(baseTab);
  const [name, setName] = useState(activeQuery?.name ?? '');
  const [makeDefault, setMakeDefault] = useState(activeQuery?.isDefault ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Re-sync local state whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setDraft(filters);
      setTab(baseTab);
      setName(activeQuery?.name ?? '');
      setMakeDefault(activeQuery?.isDefault ?? false);
      setError(null);
    }
  }, [open, filters, baseTab, activeQuery]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const activeCount = useMemo(() => countActiveFilters(draft), [draft]);
  const set = (patch: Partial<ScreenerQueryFilters>) => setDraft((d) => ({ ...d, ...patch }));

  const toggleCat = (cat: string) => {
    const cur = draft.mcapCategories ?? [];
    const next = cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat];
    set({ mcapCategories: next.length ? next : undefined });
  };

  const handleApply = () => { onApply(draft); onClose(); };

  const handleReset = () => setDraft({});

  // Persist the draft. `asNew` = create a brand-new entry (Add query);
  // otherwise update the active query in place (Save/Update query).
  const persist = async (asNew: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await saveScreenerQuery({
        id: asNew ? null : (activeQuery?.id ?? null),
        name,
        baseTab: tab,
        filters: draft,
        sortField: activeQuery?.sortField ?? null,
        sortDir: activeQuery?.sortDir ?? null,
        isDefault: makeDefault,
        createNew: asNew,
      });
      if (!res.success || !res.query) {
        setError(res.error ?? 'Failed to save.');
        return;
      }
      onApply(draft);
      onSaved(res.query);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => persist(false);
  const handleAddNew = () => persist(true);

  const handleDelete = async () => {
    if (!activeQuery) return;
    setBusy(true);
    try {
      const res = await deleteScreenerQuery(activeQuery.id);
      if (res.success) { onDeleted(activeQuery.id); onClose(); }
      else setError(res.error ?? 'Failed to delete.');
    } finally {
      setBusy(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-zinc-700/60 bg-zinc-950 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">
              {activeQuery ? `Edit query · ${activeQuery.name}` : 'Filter builder'}
            </h3>
            {activeCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold">
                {activeCount} active
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {/* Base list */}
          <Section title="Run against">
            <div className="flex gap-1.5">
              {(['prefiltered', 'all', 'portfolio'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                    tab === t ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'bg-zinc-900/60 text-zinc-400 border border-zinc-700/60 hover:text-zinc-200'
                  }`}
                >
                  {t === 'prefiltered' ? 'Pre-filtered' : t === 'all' ? 'All stocks' : 'Portfolio'}
                </button>
              ))}
            </div>
          </Section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Section title="Momentum score">
              <div className="grid grid-cols-2 gap-2">
                <NumField label="Min score" value={draft.minScore} onChange={(v) => set({ minScore: v })} />
                <NumField label="Max score" value={draft.maxScore} onChange={(v) => set({ maxScore: v })} />
              </div>
            </Section>
            <Section title="Rank (pre-filtered / all)">
              <div className="grid grid-cols-2 gap-2">
                <NumField label="Best rank" value={draft.minRank} onChange={(v) => set({ minRank: v })} placeholder="1" />
                <NumField label="Worst rank" value={draft.maxRank} onChange={(v) => set({ maxRank: v })} placeholder="50" />
              </div>
            </Section>
          </div>

          <Section title="Trend">
            <div className="flex flex-wrap gap-2">
              <Toggle label="Above 200 DMA" checked={!!draft.require200Dma} onChange={(v) => set({ require200Dma: v || undefined })} />
              <Toggle label="Above 50 DMA" checked={!!draft.require50Dma} onChange={(v) => set({ require50Dma: v || undefined })} />
              <Toggle label="Above all DMAs" checked={!!draft.requireAllDma} onChange={(v) => set({ requireAllDma: v || undefined })} />
            </div>
          </Section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Section title="Distance from ATH">
              <NumField label="Within % of ATH" value={draft.athWithinPct} onChange={(v) => set({ athWithinPct: v })} placeholder="30" suffix="%" />
            </Section>
            <Section title="Liquidity">
              <NumField label="Min median turnover" value={draft.minTurnoverCr} onChange={(v) => set({ minTurnoverCr: v })} placeholder="1" suffix="Cr" />
            </Section>
          </div>

          <Section title="Market cap">
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Min mcap" value={draft.minMcapCr} onChange={(v) => set({ minMcapCr: v })} placeholder="1000" suffix="Cr" />
              <NumField label="Max mcap" value={draft.maxMcapCr} onChange={(v) => set({ maxMcapCr: v })} suffix="Cr" />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {MCAP_CATS.map((c) => {
                const on = (draft.mcapCategories ?? []).includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleCat(c)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      on ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' : 'bg-zinc-900/60 text-zinc-400 border-zinc-700/60 hover:text-zinc-200'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </Section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Section title="Price (CMP)">
              <div className="grid grid-cols-2 gap-2">
                <NumField label="Min ₹" value={draft.minPrice} onChange={(v) => set({ minPrice: v })} />
                <NumField label="Max ₹" value={draft.maxPrice} onChange={(v) => set({ maxPrice: v })} />
              </div>
            </Section>
            <Section title="Day change %">
              <div className="grid grid-cols-2 gap-2">
                <NumField label="Min %" value={draft.minDayChange} onChange={(v) => set({ minDayChange: v })} suffix="%" />
                <NumField label="Max %" value={draft.maxDayChange} onChange={(v) => set({ maxDayChange: v })} suffix="%" />
              </div>
            </Section>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Section title="Max drawdown">
              <NumField
                label="Keep DD better than"
                value={draft.minDrawdownPct}
                onChange={(v) => set({ minDrawdownPct: v })}
                placeholder="-20"
                suffix="%"
              />
            </Section>
            <Section title="Portfolio">
              <div className="flex gap-1.5">
                {(['any', 'only', 'exclude'] as PortfolioMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => set({ portfolio: m === 'any' ? undefined : m })}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                      (draft.portfolio ?? 'any') === m
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'bg-zinc-900/60 text-zinc-400 border border-zinc-700/60 hover:text-zinc-200'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Section>
          </div>

          {/* Save block */}
          <div className="border-t border-zinc-800/80 pt-4 flex flex-col gap-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Save this query</h4>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Query name (e.g. Top 30 near ATH)"
                maxLength={60}
                className="flex-1 bg-zinc-900/70 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500/50"
              />
              <label className="flex items-center gap-2 text-xs text-zinc-400 select-none cursor-pointer">
                <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="accent-blue-500" />
                Default view
              </label>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-zinc-800/80 bg-zinc-950">
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Reset filters
            </button>
            {activeQuery && (
              <button
                onClick={handleDelete}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleApply}
              className="px-4 py-1.5 text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Apply
            </button>
            {/* Add as a brand-new saved query (never overrides). */}
            <button
              onClick={handleAddNew}
              disabled={busy || !name.trim()}
              className="px-4 py-1.5 text-xs font-semibold text-emerald-200 bg-emerald-600/25 border border-emerald-500/40 hover:bg-emerald-600/35 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Save these filters as a new query"
            >
              {busy ? 'Saving…' : '+ Add query'}
            </button>
            {/* Override the currently-open query in place. */}
            {activeQuery && (
              <button
                onClick={handleSave}
                disabled={busy || !name.trim()}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={`Override "${activeQuery.name}"`}
              >
                {busy ? 'Saving…' : 'Save query'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
