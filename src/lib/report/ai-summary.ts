import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/logger';
import type { ReportData } from './types';

const aiLogger = logger.scope('ReportAI');

const SYSTEM_INSTRUCTION = `You are a concise market analyst writing a brief evening summary for an Indian equity momentum-strategy portfolio investor. Write in plain English, 2-3 short paragraphs. No bullet points, no headers, no emojis. Focus on: (1) how the portfolio performed relative to Nifty 50 and Nifty 500 Momentum 50, (2) notable sector movements and what is driving market breadth, (3) any exit signals or interesting entry candidates worth noting. Only reference data provided. Do not speculate or add external information.`;

function buildSummaryInput(data: ReportData): string {
  const p = data.portfolio;
  const m = data.market;

  const input = {
    date: data.date,
    portfolio: p
      ? {
          dayGainPercent: p.dayGainPercent.toFixed(2),
          totalPnlPercent: p.totalPnlPercent.toFixed(2),
          holdingsCount: p.holdingsCount,
          topGainer: p.topGainer
            ? `${p.topGainer.symbol} (${p.topGainer.changePercent.toFixed(2)}%)`
            : 'N/A',
          topLoser: p.topLoser
            ? `${p.topLoser.symbol} (${p.topLoser.changePercent.toFixed(2)}%)`
            : 'N/A',
        }
      : null,
    benchmarks: p?.benchmarks
      ? {
          nifty50: p.benchmarks.nifty50ChangePercent != null
            ? `${p.benchmarks.nifty50ChangePercent.toFixed(2)}%`
            : 'N/A',
          nifty500Momentum50: p.benchmarks.momentum50ChangePercent != null
            ? `${p.benchmarks.momentum50ChangePercent.toFixed(2)}%`
            : 'N/A',
        }
      : null,
    sectors: m
      ? {
          topGainers: m.topSectors.map(
            (s) => `${s.shortName} (+${s.changePercent.toFixed(2)}%)`
          ),
          topLosers: m.bottomSectors.map(
            (s) => `${s.shortName} (${s.changePercent.toFixed(2)}%)`
          ),
        }
      : null,
    breadth: m
      ? {
          totalMarket: m.totalMarket
            ? `${m.totalMarket.advancing} advancing, ${m.totalMarket.declining} declining`
            : 'N/A',
          nifty50: m.nifty50
            ? `${m.nifty50.advancing} advancing, ${m.nifty50.declining} declining`
            : 'N/A',
        }
      : null,
    exitSignals: data.exits.length
      ? data.exits.map((e) => ({
          symbol: e.symbol,
          reason: e.byRank
            ? e.isUnranked
              ? 'dropped out of screener universe'
              : `rank ${e.rank} (above 50 cut-off)`
            : 'below 200 DMA and far from ATH',
          protected: e.protected,
        }))
      : 'None',
    newEntrants: data.entries.filter((e) => e.isNewEntrant).map((e) => ({
      rank: e.rank,
      symbol: e.symbol,
    })),
  };

  return JSON.stringify(input, null, 2);
}

export async function generateAISummary(data: ReportData): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const prompt = `Here is today's market data. Write the summary:\n\n${buildSummaryInput(data)}`;

  aiLogger.info('Requesting AI summary from Gemini Flash...');
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
  });

  const text = result.response.text().trim();
  aiLogger.info(`AI summary generated (${text.length} chars)`);
  return text;
}
