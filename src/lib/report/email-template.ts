import type { ReportData, SectorPerf, TopMover, ExitCandidate, EntryCandidate } from './types';

// ── Formatters ──────────────────────────────────────────────────────────────

function pct(val: number, decimals = 2): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(decimals)}%`;
}

function rs(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function color(val: number): string {
  return val >= 0 ? '#4ade80' : '#f87171';
}

// ── Shared styles ────────────────────────────────────────────────────────────

const BASE = `font-family:Arial,Helvetica,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:0;`;
const CARD = `background:#1e293b;border-radius:8px;padding:20px;margin-bottom:16px;`;
const HEADING = `font-size:12px;font-weight:700;letter-spacing:1.5px;color:#64748b;text-transform:uppercase;margin:0 0 12px 0;`;
const TD = `padding:6px 8px;font-size:13px;border-bottom:1px solid #334155;`;
const TH = `padding:6px 8px;font-size:11px;font-weight:700;color:#94a3b8;text-align:left;border-bottom:1px solid #475569;`;
const BADGE_NEW = `background:#7c3aed;color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:4px;`;

// ── Section renderers ────────────────────────────────────────────────────────

function renderAISummary(summary: string | null): string {
  if (!summary) return '';
  return `
  <div style="${CARD}">
    <p style="${HEADING}">Market Commentary</p>
    <p style="font-size:14px;line-height:1.7;color:#cbd5e1;margin:0;">${summary.replace(/\n/g, '<br>')}</p>
  </div>`;
}

function renderPortfolio(p: ReportData['portfolio']): string {
  if (!p) {
    return `<div style="${CARD}"><p style="${HEADING}">Portfolio</p><p style="color:#64748b;font-size:13px;">Data unavailable</p></div>`;
  }

  const dayColor = color(p.dayGainPercent);
  const totalColor = color(p.totalPnlPercent);

  const benchmarkRows = [
    ['Nifty 50', p.benchmarks.nifty50ChangePercent],
    ['Nifty 500 Momentum 50', p.benchmarks.momentum50ChangePercent],
  ]
    .filter(([, v]) => v != null)
    .map(
      ([name, val]) =>
        `<tr>
          <td style="${TD}color:#94a3b8;">${name}</td>
          <td style="${TD}font-weight:700;color:${color(val as number)};">${pct(val as number)}</td>
        </tr>`
    )
    .join('');

  return `
  <div style="${CARD}">
    <p style="${HEADING}">Portfolio — ${p.holdingsCount} holdings</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:0 0 16px 0;">
          <span style="font-size:28px;font-weight:700;color:${dayColor};">${pct(p.dayGainPercent)}</span>
          <span style="font-size:14px;color:#64748b;margin-left:8px;">${rs(p.dayGainRs)} today</span>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="${TD}color:#94a3b8;">Total P&amp;L</td>
        <td style="${TD}font-weight:700;color:${totalColor};">${pct(p.totalPnlPercent)} &nbsp;<span style="color:#64748b;font-weight:400;">${rs(p.totalPnlRs)}</span></td>
      </tr>
      ${p.topGainer ? `<tr>
        <td style="${TD}color:#94a3b8;">Top Gainer</td>
        <td style="${TD}font-weight:700;color:#4ade80;">${p.topGainer.symbol} &nbsp;${pct(p.topGainer.changePercent)}</td>
      </tr>` : ''}
      ${p.topLoser ? `<tr>
        <td style="${TD}color:#94a3b8;">Top Loser</td>
        <td style="${TD}font-weight:700;color:#f87171;">${p.topLoser.symbol} &nbsp;${pct(p.topLoser.changePercent)}</td>
      </tr>` : ''}
    </table>
    ${benchmarkRows ? `
    <p style="font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;text-transform:uppercase;margin:14px 0 8px 0;">Benchmarks</p>
    <table width="100%" cellpadding="0" cellspacing="0">${benchmarkRows}</table>` : ''}
  </div>`;
}

function renderSectorRow(s: SectorPerf): string {
  return `<tr>
    <td style="${TD}">${s.shortName}</td>
    <td style="${TD}font-weight:700;color:${color(s.changePercent)};">${pct(s.changePercent)}</td>
  </tr>`;
}

function renderMoverRow(m: TopMover): string {
  return `<tr>
    <td style="${TD}">${m.symbol}</td>
    <td style="${TD}color:#94a3b8;">₹${m.lastPrice.toFixed(2)}</td>
    <td style="${TD}font-weight:700;color:${color(m.changePercent)};">${pct(m.changePercent)}</td>
  </tr>`;
}

function renderMarket(m: ReportData['market']): string {
  if (!m) {
    return `<div style="${CARD}"><p style="${HEADING}">Market</p><p style="color:#64748b;font-size:13px;">Data unavailable</p></div>`;
  }

  const adTotalMarket = m.totalMarket
    ? `Total Market: ${m.totalMarket.advancing}↑ ${m.totalMarket.declining}↓ ${m.totalMarket.unchanged}→`
    : '';
  const adNifty50 = m.nifty50
    ? `Nifty 50: ${m.nifty50.advancing}↑ ${m.nifty50.declining}↓ ${m.nifty50.unchanged}→`
    : '';

  return `
  <div style="${CARD}">
    <p style="${HEADING}">Market Overview</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <th style="${TH}">Sector</th>
        <th style="${TH}">Change</th>
      </tr>
      ${m.topSectors.map(renderSectorRow).join('')}
      <tr><td colspan="2" style="padding:4px 8px;font-size:11px;color:#475569;">···</td></tr>
      ${m.bottomSectors.map(renderSectorRow).join('')}
    </table>

    <p style="font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;text-transform:uppercase;margin:0 0 8px 0;">Top Movers — Nifty Total Market</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <th style="${TH}">Symbol</th>
        <th style="${TH}">Price</th>
        <th style="${TH}">Change</th>
      </tr>
      ${m.topGainers.map(renderMoverRow).join('')}
      <tr><td colspan="3" style="padding:4px 8px;font-size:11px;color:#475569;">···</td></tr>
      ${m.topLosers.map(renderMoverRow).join('')}
    </table>

    ${adTotalMarket || adNifty50 ? `
    <p style="font-size:12px;color:#64748b;margin:0;">
      ${adTotalMarket}${adTotalMarket && adNifty50 ? ' &nbsp;|&nbsp; ' : ''}${adNifty50}
    </p>` : ''}
  </div>`;
}

function renderExits(exits: ExitCandidate[]): string {
  const inner = exits.length === 0
    ? `<p style="color:#4ade80;font-size:13px;margin:0;">No exit signals today</p>`
    : `<table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <th style="${TH}">Symbol</th>
          <th style="${TH}">Rank</th>
          <th style="${TH}">Reason</th>
          <th style="${TH}">Status</th>
        </tr>
        ${exits.map((e) => {
          const reason = e.isUnranked
            ? 'Unranked'
            : e.byRank
            ? `Rank ${e.rank} &gt; 50`
            : 'Below 200 DMA + ATH';
          const status = e.protected
            ? `<span style="color:#fbbf24;font-size:11px;">Protected (&lt;14d)</span>`
            : `<span style="color:#f87171;font-size:11px;">Exit candidate</span>`;
          return `<tr>
            <td style="${TD}font-weight:700;">${e.symbol}</td>
            <td style="${TD}color:#94a3b8;">${e.rank ?? '—'}</td>
            <td style="${TD}color:#f87171;">${reason}</td>
            <td style="${TD}">${status}</td>
          </tr>`;
        }).join('')}
      </table>`;

  return `
  <div style="${CARD}">
    <p style="${HEADING}">Exit Signals (${exits.length})</p>
    ${inner}
  </div>`;
}

function renderEntries(entries: EntryCandidate[]): string {
  const inner = entries.length === 0
    ? `<p style="color:#64748b;font-size:13px;margin:0;">No candidates outside portfolio in top 30</p>`
    : `<table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <th style="${TH}">#</th>
          <th style="${TH}">Symbol</th>
          <th style="${TH}">Score</th>
          <th style="${TH}">ATH%</th>
          <th style="${TH}">Cap</th>
        </tr>
        ${entries.map((e) => `<tr>
          <td style="${TD}color:#64748b;">${e.rank}</td>
          <td style="${TD}font-weight:700;">
            ${e.symbol}
            ${e.isNewEntrant ? `<span style="${BADGE_NEW}">NEW</span>` : ''}
          </td>
          <td style="${TD}color:#94a3b8;">${e.compositeScore.toFixed(3)}</td>
          <td style="${TD}color:#94a3b8;">${e.athProximityPct.toFixed(1)}%</td>
          <td style="${TD}font-size:11px;color:#64748b;">${e.marketCapCategory ?? '—'}</td>
        </tr>`).join('')}
      </table>`;

  return `
  <div style="${CARD}">
    <p style="${HEADING}">Entry Candidates — Top 30 (excl. portfolio)</p>
    ${inner}
  </div>`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildReportEmail(data: ReportData): { subject: string; html: string } {
  const dateLabel = new Date(data.date).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

  const daySign = data.portfolio
    ? ` ${data.portfolio.dayGainPercent >= 0 ? '▲' : '▼'} ${Math.abs(data.portfolio.dayGainPercent).toFixed(2)}%`
    : '';

  const subject = `Alpha Daily Report — ${dateLabel}${daySign}`;

  const errors = data.errors.length
    ? `<div style="background:#7f1d1d;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#fca5a5;">
        ⚠ Some data was unavailable: ${data.errors.join(' · ')}
      </div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="${BASE}">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:20px;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#64748b;text-transform:uppercase;">Alpha Portfolio</p>
              <h1 style="margin:4px 0 0 0;font-size:20px;font-weight:700;color:#f1f5f9;">${dateLabel}</h1>
            </td>
          </tr>

          ${errors ? `<tr><td>${errors}</td></tr>` : ''}

          <!-- AI Commentary -->
          <tr><td>${renderAISummary(data.aiSummary)}</td></tr>

          <!-- Portfolio -->
          <tr><td>${renderPortfolio(data.portfolio)}</td></tr>

          <!-- Market -->
          <tr><td>${renderMarket(data.market)}</td></tr>

          <!-- Exits -->
          <tr><td>${renderExits(data.exits)}</td></tr>

          <!-- Entries -->
          <tr><td>${renderEntries(data.entries)}</td></tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:8px;padding-bottom:32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#334155;">
                Generated at ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST · Alpha Portfolio Tracker
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
