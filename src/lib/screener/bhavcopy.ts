/**
 * NSE Bhavcopy parser — downloads market cap data from NSE archives.
 * URL: https://nsearchives.nseindia.com/archives/equities/bhavcopy/pr/PR{DDMMYY}.zip
 * Contains mcap{DDMMYYYY}.csv with market cap per stock.
 */

import AdmZip from 'adm-zip';
import { prisma, chunkArray } from '@/lib/db';
import { toBhavcopyDateFormat, toMcapDateFormat, previousTradingDay, fromDateStr, toDateStr } from './dates';
import { logger } from '@/lib/logger';

const bhavcopyLogger = logger.scope('Bhavcopy');

const NSE_BHAVCOPY_URL = 'https://nsearchives.nseindia.com/archives/equities/bhavcopy/pr';

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  Referer: 'https://www.nseindia.com/',
};

/**
 * Download and parse NSE bhavcopy ZIP for market cap data.
 * Tries the given date, then falls back to up to 3 previous trading days.
 */
export async function fetchAndStoreBhavcopy(dateStr: string): Promise<{ updated: number; date: string }> {
  let d = fromDateStr(dateStr);
  let attempts = 0;

  while (attempts < 4) {
    const dateFormatted = toBhavcopyDateFormat(toDateStr(d));
    const mcapDateFormatted = toMcapDateFormat(toDateStr(d));
    const zipUrl = `${NSE_BHAVCOPY_URL}/PR${dateFormatted}.zip`;

    try {
      bhavcopyLogger.info(`Fetching bhavcopy: ${zipUrl}`);
      const response = await fetch(zipUrl, { headers: NSE_HEADERS });

      if (!response.ok) {
        if (response.status === 404) {
          bhavcopyLogger.warn(`Bhavcopy not found for ${toDateStr(d)}, trying previous trading day`);
          d = previousTradingDay(d);
          attempts++;
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();

      // Find the mcap CSV file
      const mcapEntry = entries.find(
        e => e.entryName.toLowerCase().startsWith('mcap') && e.entryName.endsWith('.csv')
      );

      if (!mcapEntry) {
        bhavcopyLogger.warn(`No mcap CSV found in bhavcopy ZIP for ${toDateStr(d)}`);
        d = previousTradingDay(d);
        attempts++;
        continue;
      }

      const csvContent = mcapEntry.getData().toString('utf8');
      const rows = parseMcapCSV(csvContent);

      if (rows.length === 0) {
        bhavcopyLogger.warn(`Empty mcap CSV for ${toDateStr(d)}`);
        d = previousTradingDay(d);
        attempts++;
        continue;
      }

      // Batch upsert into StockMarketCap (delete + createMany for speed)
      const symbols = rows.map(r => r.symbol);
      for (const chunk of chunkArray(symbols)) {
        await prisma.stockMarketCap.deleteMany({ where: { symbol: { in: chunk } } });
      }
      let updated = 0;
      const createRows = rows.map(r => ({ symbol: r.symbol, marketCap: r.marketCapCr }));
      for (const chunk of chunkArray(createRows)) {
        await prisma.stockMarketCap.createMany({ data: chunk });
        updated += chunk.length;
      }

      bhavcopyLogger.info(`Updated ${updated} market cap entries from bhavcopy ${toDateStr(d)}`);
      return { updated, date: toDateStr(d) };
    } catch (err) {
      bhavcopyLogger.error(`Failed to fetch bhavcopy for ${toDateStr(d)}:`, err);
      d = previousTradingDay(d);
      attempts++;
    }
  }

  bhavcopyLogger.warn('All bhavcopy attempts failed, using existing StockMarketCap data');
  return { updated: 0, date: dateStr };
}

interface McapRow {
  symbol: string;
  marketCapCr: number; // in Crores
}

/**
 * Parse NSE mcap CSV. Expected columns include "Symbol" and "Mkt Cap".
 * Market cap value from NSE — convert to Crores (÷ 1e7).
 */
function parseMcapCSV(csv: string): McapRow[] {
  const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Find header row — NSE CSVs sometimes have metadata rows before the actual header
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('symbol') && (lower.includes('mkt cap') || lower.includes('market cap') || lower.includes('mcap'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const headers = lines[headerIdx].split(',').map(h => h.trim().toLowerCase());
  const symbolIdx = headers.findIndex(h => h === 'symbol');
  const mcapIdx = headers.findIndex(h => h.includes('mkt cap') || h.includes('market cap') || h.includes('mcap'));

  if (symbolIdx === -1 || mcapIdx === -1) return [];

  const rows: McapRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
    if (cols.length <= Math.max(symbolIdx, mcapIdx)) continue;

    const symbol = cols[symbolIdx].toUpperCase();
    const mcapRaw = parseFloat(cols[mcapIdx]);

    if (symbol && !isNaN(mcapRaw) && mcapRaw > 0) {
      rows.push({
        symbol,
        marketCapCr: mcapRaw / 1e7, // Rupees → Crores (1 Cr = 10,000,000)
      });
    }
  }

  return rows;
}
