import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/logger';
import type { ReportData, PortfolioHolding, ExitCandidate, WarnCandidate, EntryCandidate } from './types';

const aiLogger = logger.scope('ReportAI');

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a seasoned Indian equity analyst writing a personalised end-of-day portfolio review for a momentum-strategy investor. Write 4–5 flowing paragraphs of plain English prose. No bullet points, no headers, no emojis, no markdown. Be specific — name stocks, cite exact numbers from the data, and explain what they mean. Never invent facts not present in the data.

Structure your response as follows (blend naturally — do not label the sections):
1. HEADLINE SENTENCE — one crisp sentence summarising the day's dominant theme (portfolio vs market, any urgent action).
2. PORTFOLIO PERFORMANCE — how the portfolio moved vs Nifty 50 and Nifty 500 Momentum 50. Name the biggest contributor and biggest drag. Comment on total PnL context.
3. MARKET CONTEXT — which sectors led or lagged, whether breadth was supportive or deteriorating, and any notable broad-market movers that are relevant to the portfolio.
4. RISK REVIEW — if there are EXIT signals, name each stock, state its specific trigger (e.g. "rank 63, below 200 DMA, 28% off ATH") and whether it is protected from exit. If there are WARNING signals, name each stock and its specific reason (below 50 DMA, rank 51–60, or moved to BE category). If a stock is on ASM surveillance, mention it by name and stage. If there are no risk flags, say so briefly but confidently.
5. OPPORTUNITIES & CLOSE — mention any new entrants in the top 30 worth watching for deployment. Close with one action-oriented sentence (e.g. "One exit to act on tomorrow; the rest of the portfolio remains well-positioned.").

Screener rules for reference:
- EXIT (red) is triggered when: the stock falls below its 200 DMA AND is more than 25% below ATH, OR rank exceeds 60, OR it drops out of the screener universe (except due to BE category reclassification).
- WARNING (yellow) is triggered when: stock slips below its 50 DMA, OR rank is between 51 and 60, OR it is moved to the BE (trade-to-trade) category.
- PROTECTED: a stock held for fewer than 14 days cannot be exited regardless of signal.
- HOLD (green): no signal; stock is within ranking and DMA thresholds.

Be direct, confident, and concise. Target ~400–500 words.`;

// ─── Input builder ────────────────────────────────────────────────────────────

function holdingSignalSummary(h: PortfolioHolding): string {
  const base = `${h.symbol}: day ${h.dayChangePercent >= 0 ? '+' : ''}${h.dayChangePercent.toFixed(2)}%, total PnL ${h.totalPnlPercent >= 0 ? '+' : ''}${h.totalPnlPercent.toFixed(2)}%, rank ${h.rank ?? 'unranked'}, signal=${h.signal}`;
  const parts = [base];
  if (h.signalReason)                         parts.push(`reason: ${h.signalReason}`);
  if (h.drawdownSinceEntry != null)            parts.push(`drawdown since entry: ${h.drawdownSinceEntry.toFixed(1)}%`);
  if (h.asmInfo)                              parts.push(`ASM surveillance: ${h.asmInfo.type}-${h.asmInfo.stage}`);
  return parts.join(' | ');
}

function exitSummary(e: ExitCandidate): string {
  const reasons: string[] = [];
  if (e.byFilter)   reasons.push('below 200 DMA / far from ATH');
  if (e.by50Dma && !e.byFilter) reasons.push('below 50 DMA');
  if (e.isBE)       reasons.push('moved to BE category');
  if (e.isUnranked && !e.isBE) reasons.push('dropped out of screener universe');
  if (e.byRank && e.rank != null && !e.isUnranked) reasons.push(`rank ${e.rank}`);
  return `${e.symbol} [EXIT${e.protected ? ' — PROTECTED' : ''}]: ${reasons.join(', ')}`;
}

function warnSummary(w: WarnCandidate): string {
  const reasons: string[] = [];
  if (w.by50Dma) reasons.push('below 50 DMA');
  if (w.isBE)    reasons.push('moved to BE category');
  if (w.byRank && w.rank != null) reasons.push(`rank ${w.rank} (51–60 band)`);
  return `${w.symbol} [WARNING${w.protected ? ' — PROTECTED' : ''}]: ${reasons.join(', ')}`;
}

function entrySummary(e: EntryCandidate): string {
  return `#${e.rank} ${e.symbol}${e.isNewEntrant ? ' (NEW)' : ''} — ${e.marketCapCategory ?? 'unknown cap'}, ${(e.athProximityPct - 100).toFixed(1)}% from ATH`;
}

function buildSummaryInput(data: ReportData): string {
  const p = data.portfolio;
  const m = data.market;

  const sections: Record<string, unknown> = { date: data.date };

  // Portfolio overview
  if (p) {
    const nifty50 = p.benchmarks.find((b) => b.name === 'Nifty 50');
    const mom50   = p.benchmarks.find((b) => b.name.toLowerCase().includes('momentum'));
    sections.portfolio = {
      dayGainPercent:  `${p.dayGainPercent >= 0 ? '+' : ''}${p.dayGainPercent.toFixed(2)}%`,
      totalPnlPercent: `${p.totalPnlPercent >= 0 ? '+' : ''}${p.totalPnlPercent.toFixed(2)}%`,
      holdingsCount:   p.holdingsCount,
      signalCounts:    p.holdWarnExitCounts,
      alphaVsNifty50:  nifty50 != null ? `${(p.dayGainPercent - nifty50.changePercent) >= 0 ? '+' : ''}${(p.dayGainPercent - nifty50.changePercent).toFixed(2)}%` : 'N/A',
      topGainer:       p.topGainer ? `${p.topGainer.symbol} (${p.topGainer.changePercent >= 0 ? '+' : ''}${p.topGainer.changePercent.toFixed(2)}%)` : 'N/A',
      topLoser:        p.topLoser  ? `${p.topLoser.symbol} (${p.topLoser.changePercent.toFixed(2)}%)`  : 'N/A',
      benchmarks:      p.benchmarks.reduce((acc, b) => ({ ...acc, [b.name]: `${b.changePercent >= 0 ? '+' : ''}${b.changePercent.toFixed(2)}%` }), {} as Record<string, string>),
      nifty500Mom50:   mom50 ? `${mom50.changePercent >= 0 ? '+' : ''}${mom50.changePercent.toFixed(2)}%` : 'N/A',
    };
  }

  // Per-holding detail (all portfolio stocks, sorted by day change)
  if (data.holdings.length > 0) {
    sections.holdings = data.holdings.map(holdingSignalSummary);
  }

  // Market
  if (m) {
    sections.market = {
      topSectors:    m.topSectors.map((s)    => `${s.shortName} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)`),
      bottomSectors: m.bottomSectors.map((s) => `${s.shortName} (${s.changePercent.toFixed(2)}%)`),
      breadth: {
        nifty50:     m.nifty50     ? `${m.nifty50.advancing} adv / ${m.nifty50.declining} dec / ${m.nifty50.unchanged} unch` : 'N/A',
        totalMarket: m.totalMarket ? `${m.totalMarket.advancing} adv / ${m.totalMarket.declining} dec / ${m.totalMarket.unchanged} unch` : 'N/A',
      },
      topGainers: m.topGainers.map((g) => `${g.symbol} (${g.changePercent >= 0 ? '+' : ''}${g.changePercent.toFixed(2)}%)`),
      topLosers:  m.topLosers.map((g)  => `${g.symbol} (${g.changePercent.toFixed(2)}%)`),
    };
  }

  // Exit signals
  sections.exitSignals = data.exits.length > 0
    ? data.exits.map(exitSummary)
    : 'None';

  // Warning signals
  sections.warningSignals = data.warnings.length > 0
    ? data.warnings.map(warnSummary)
    : 'None';

  // Entry candidates (top 5 non-portfolio)
  sections.entryCandidates = data.entries.slice(0, 5).map(entrySummary);

  return JSON.stringify(sections, null, 2);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateAISummary(data: ReportData): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const modelName = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite';
  aiLogger.info(`Requesting AI summary from Gemini (${modelName})...`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
  });

  const prompt = `Here is today's portfolio and market data. Write the analyst summary:\n\n${buildSummaryInput(data)}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 800,
      temperature: 0.4,
    },
  });

  const text = result.response.text().trim();
  aiLogger.info(`AI summary generated (${text.length} chars)`);
  return text;
}
