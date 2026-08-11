import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';

// ============================================================
// Types
// ============================================================

export interface ParsedDividend {
    isin: string;
    symbol: string | null;
    exDate: Date;
    payDate: Date | null;
    amount: number;   // total ₹ received
    dps: number | null;
    quantity: number | null;
    fiscalYear: string;
    quarter: string | null;
}

export interface DividendHistoryEntry {
    fiscalYear: string;
    quarter: string | null;
    count: number;
    total: number;
    updatedAt: Date;
}

// ============================================================
// Filename parser — "taxpnl-ZQ1267-2026_2027-Q1-Q2.xlsx"
//                   "taxpnl-ZQ1267-2026-2027.xlsx"
//                   "tax.xlsx"
// ============================================================

export function parseDividendFilename(filename: string): {
    fiscalYear: string | null;
    quarter: string | null;
} {
    // Match patterns like 2023_2024 or 2023-2024 (avoid matching client IDs like AB1234)
    const fyMatch = filename.match(/(20\d{2})[-_](20\d{2})/);
    const qMatch = filename.match(/(20\d{2})[-_](20\d{2})[-_](Q[\d\-Q]+)/i);

    const fiscalYear = fyMatch ? `${fyMatch[1]}_${fyMatch[2]}` : null;
    const quarter = qMatch ? qMatch[3].toUpperCase() : null;

    return { fiscalYear, quarter };
}

/** Compute Indian Financial Year (e.g. "2024_2025") and Quarter (Q1-Q4) from a Date */
export function getFYAndQuarterFromDate(date: Date): { fiscalYear: string; quarter: string } {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1; // 1-12

    let fyStart: number;
    let fyEnd: number;
    let q: string;

    if (month >= 4) {
        fyStart = year;
        fyEnd = year + 1;
        if (month <= 6) q = 'Q1';
        else if (month <= 9) q = 'Q2';
        else q = 'Q3';
    } else {
        fyStart = year - 1;
        fyEnd = year;
        q = 'Q4';
    }

    return {
        fiscalYear: `${fyStart}_${fyEnd}`,
        quarter: q,
    };
}

// ============================================================
// Excel parser — Zerodha Tax P&L dividend sheet
// ============================================================

/** Finds the dividend data range inside the Zerodha Tax P&L workbook.
 *  The dividend section has a header row containing "ISIN" and "Amount".
 *  Returns an array of row objects.
 */
function findDividendRows(wb: XLSX.WorkBook): Record<string, unknown>[] {
    const extractRowsFromSheet = (sheetName: string): Record<string, unknown>[] => {
        const ws = wb.Sheets[sheetName];
        if (!ws) return [];

        const rawAoA = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
        let headerRowIdx = -1;
        for (let i = 0; i < rawAoA.length; i++) {
            const row = rawAoA[i] as unknown[];
            const rowStr = row.map(c => String(c).toLowerCase()).join('|');
            if (
                rowStr.includes('isin') &&
                (rowStr.includes('amount') || rowStr.includes('dividend') || rowStr.includes('net') || rowStr.includes('total'))
            ) {
                headerRowIdx = i;
                break;
            }
        }

        if (headerRowIdx >= 0) {
            const headers = (rawAoA[headerRowIdx] as unknown[]).map(h => String(h).trim());
            const dataRows: Record<string, unknown>[] = [];
            for (let i = headerRowIdx + 1; i < rawAoA.length; i++) {
                const cells = rawAoA[i] as unknown[];
                if (cells.every(c => c === '' || c === null || c === undefined)) {
                    continue;
                }
                const firstCell = String(cells[0] ?? '').toLowerCase();
                if (firstCell.includes('total') || firstCell.includes('summary')) {
                    continue;
                }
                const obj: Record<string, unknown> = {};
                headers.forEach((h, idx) => {
                    if (h) obj[h] = cells[idx] ?? '';
                });
                dataRows.push(obj);
            }
            return dataRows;
        }
        return [];
    };

    // Phase 1: Try sheets with 'dividend' or 'div' in name
    const dividendSheets = wb.SheetNames.filter(
        s => s.toLowerCase().includes('dividend') || s.toLowerCase().includes('div')
    );

    for (const sheetName of dividendSheets) {
        const rows = extractRowsFromSheet(sheetName);
        if (rows.length > 0) return rows;
    }

    // Phase 2: Fallback to all remaining sheets
    for (const sheetName of wb.SheetNames) {
        if (dividendSheets.includes(sheetName)) continue;
        const rows = extractRowsFromSheet(sheetName);
        if (rows.length > 0) return rows;
    }

    return [];
}

/** Attempt to find a column value across candidate header spellings */
function col(row: Record<string, unknown>, candidates: string[]): unknown {
    const keys = Object.keys(row);
    for (const cand of candidates) {
        const candLower = cand.toLowerCase();
        for (const key of keys) {
            const keyLower = key.toLowerCase().trim();
            // Skip DPS/per-share keys if candidate is for total amount
            if (
                candLower.includes('amount') &&
                !candLower.includes('dps') &&
                !candLower.includes('per share') &&
                (keyLower.includes('dps') || keyLower.includes('per share'))
            ) {
                continue;
            }

            if (keyLower === candLower || keyLower.includes(candLower)) {
                const v = row[key];
                if (v !== undefined && v !== null && String(v).trim() !== '') {
                    return v;
                }
            }
        }
    }
    return null;
}

export function parseDate(raw: unknown): Date | null {
    if (raw === null || raw === undefined || raw === '') return null;

    if (raw instanceof Date) {
        return isNaN(raw.getTime()) ? null : raw;
    }

    if (typeof raw === 'number') {
        if (isNaN(raw) || raw <= 0) return null;
        try {
            const parsed = XLSX.SSF.parse_date_code(raw);
            if (parsed && parsed.y && parsed.m && parsed.d) {
                return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
            }
        } catch {
            return null;
        }
        return null;
    }

    const str = String(raw).trim();
    if (!str) return null;

    // Handle JS Date string or ISO string (e.g., "Wed May 15 2024..." or "2024-05-15T00:00:00.000Z")
    if (str.includes('GMT') || str.includes('T') || str.includes('Z')) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d;
    }

    // Try DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, YYYY/MM/DD, DD-MMM-YYYY (15-May-2024)
    const parts = str.match(/(\d{1,4})[\/\-\s]+([A-Za-z]{3,9}|\d{1,2})[\/\-\s]+(\d{2,4})/);
    if (parts) {
        const [, a, b, c] = parts;
        let month = -1;

        if (/^\d+$/.test(b)) {
            month = parseInt(b, 10) - 1;
        } else {
            const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            const bSub = b.substring(0, 3).toLowerCase();
            month = months.indexOf(bSub);
        }

        if (month >= 0 && month <= 11) {
            let year = -1;
            let day = -1;

            if (a.length === 4) {
                year = parseInt(a, 10);
                day = parseInt(c, 10);
            } else if (c.length === 4) {
                year = parseInt(c, 10);
                day = parseInt(a, 10);
            } else if (c.length === 2) {
                year = 2000 + parseInt(c, 10);
                day = parseInt(a, 10);
            }

            if (year > 1900 && day >= 1 && day <= 31) {
                return new Date(Date.UTC(year, month, day));
            }
        }
    }

    const fallbackDate = new Date(str);
    if (!isNaN(fallbackDate.getTime())) {
        return fallbackDate;
    }

    return null;
}

export function parseZerodhaTaxPnLDividends(
    buffer: Buffer,
    filename: string,
): ParsedDividend[] {
    const { fiscalYear: filenameFY, quarter: filenameQuarter } = parseDividendFilename(filename);

    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const rows = findDividendRows(wb);

    const results: ParsedDividend[] = [];

    for (const row of rows) {
        const isinVal = col(row, ['isin code', 'isin']);
        const isin = isinVal ? String(isinVal).trim() : '';
        if (!isin || isin.length < 10) continue; // skip non-data rows

        const amountVal = col(row, [
            'net amount',
            'dividend amount',
            'gross amount',
            'total amount',
            'amount (rs.)',
            'amount(inr)',
            'amount',
            'total',
        ]);
        if (amountVal === null || amountVal === undefined) continue;
        const amountStr = String(amountVal).replace(/[₹,\s]/g, '');
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount === 0) continue;

        const exDateVal = col(row, ['ex date', 'ex-date', 'exdate', 'record date', 'date']);
        const exDate = parseDate(exDateVal);
        if (!exDate) continue;

        const payDateVal = col(row, ['pay date', 'payment date', 'paydate', 'credit date', 'payout date']);
        const payDate = parseDate(payDateVal);

        const dpsVal = col(row, ['dps', 'dividend per share', 'rate', 'div/share']);
        const dpsStr = dpsVal ? String(dpsVal).replace(/[₹,\s]/g, '') : '';
        const dps = dpsStr ? parseFloat(dpsStr) || null : null;

        const qtyVal = col(row, ['quantity', 'qty', 'shares', 'units']);
        const qtyStr = qtyVal ? String(qtyVal).replace(/[,\s]/g, '') : '';
        const quantity = qtyStr ? parseFloat(qtyStr) || null : null;

        const symbolVal = col(row, ['symbol', 'stock symbol', 'scrip', 'stock', 'company name', 'name', 'instrument']);
        const symbol = symbolVal ? String(symbolVal).trim() : null;

        const datePeriod = getFYAndQuarterFromDate(exDate);
        const fiscalYear = filenameFY ?? datePeriod.fiscalYear;
        const quarter = filenameQuarter ?? datePeriod.quarter;

        results.push({
            isin,
            symbol: symbol || null,
            exDate,
            payDate: payDate || null,
            amount,
            dps: dps || null,
            quantity: quantity || null,
            fiscalYear,
            quarter,
        });
    }

    return results;
}

// ============================================================
// DB helpers
// ============================================================

export interface UpsertDividendsResult {
    inserted: number;
    updated: number;
    unchanged: number;
    total: number;
}

/**
 * Upsert parsed dividends with entry-level duplicate detection.
 * Dedup key: (isin, exDate).
 * - "inserted"  — new entries not previously in DB
 * - "updated"   — existing entries whose amount changed
 * - "unchanged" — existing entries that match exactly (no write needed)
 */
export async function upsertDividends(records: ParsedDividend[]): Promise<UpsertDividendsResult> {
    if (records.length === 0) return { inserted: 0, updated: 0, unchanged: 0, total: 0 };

    // Fetch all existing rows that could overlap with the incoming batch
    const isins = [...new Set(records.map(r => r.isin))];
    const existing = await prisma.dividend.findMany({
        where: { isin: { in: isins } },
        select: { isin: true, exDate: true, amount: true },
    });

    // Build a lookup map: "isin::exDate(ISO)" → existing amount
    const existingMap = new Map<string, number>();
    for (const row of existing) {
        existingMap.set(`${row.isin}::${row.exDate.toISOString()}`, row.amount);
    }

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const r of records) {
        const key = `${r.isin}::${r.exDate.toISOString()}`;
        const existingAmount = existingMap.get(key);

        if (existingAmount === undefined) {
            // New entry
            await prisma.dividend.create({
                data: {
                    isin: r.isin,
                    symbol: r.symbol,
                    exDate: r.exDate,
                    payDate: r.payDate,
                    amount: r.amount,
                    dps: r.dps,
                    quantity: r.quantity,
                    fiscalYear: r.fiscalYear,
                    quarter: r.quarter,
                },
            });
            inserted++;
        } else if (Math.abs(existingAmount - r.amount) > 0.001) {
            // Existing entry with a changed amount — update
            await prisma.dividend.update({
                where: { isin_exDate: { isin: r.isin, exDate: r.exDate } },
                data: {
                    symbol: r.symbol,
                    payDate: r.payDate,
                    amount: r.amount,
                    dps: r.dps,
                    quantity: r.quantity,
                    fiscalYear: r.fiscalYear,
                    quarter: r.quarter,
                },
            });
            updated++;
        } else {
            // Exact duplicate — skip
            unchanged++;
        }
    }

    return { inserted, updated, unchanged, total: records.length };
}

/** Sum of all dividend amounts grouped by ISIN (for future ISIN-based joins) */
export async function getDividendTotalByISIN(): Promise<Map<string, number>> {
    const rows = await prisma.dividend.groupBy({
        by: ['isin'],
        _sum: { amount: true },
    });
    const map = new Map<string, number>();
    for (const row of rows) {
        map.set(row.isin, row._sum.amount ?? 0);
    }
    return map;
}

/** Sum of all dividend amounts grouped by NSE symbol (for ExitsTable join) */
export async function getDividendTotalBySymbol(): Promise<Map<string, number>> {
    const rows = await prisma.dividend.groupBy({
        by: ['symbol'],
        _sum: { amount: true },
    });
    const map = new Map<string, number>();
    for (const row of rows) {
        if (row.symbol) map.set(row.symbol, row._sum.amount ?? 0);
    }
    return map;
}

/** Grand total of all dividends received (for dashboard P/L card) */
export async function getTotalDividends(): Promise<number> {
    const result = await prisma.dividend.aggregate({ _sum: { amount: true } });
    return result._sum.amount ?? 0;
}

/** Per-period history for the Settings card */
export async function getDividendHistory(): Promise<DividendHistoryEntry[]> {
    const rows = await prisma.dividend.groupBy({
        by: ['fiscalYear', 'quarter'],
        _count: { id: true },
        _sum: { amount: true },
        _max: { updatedAt: true },
        orderBy: [{ fiscalYear: 'desc' }],
    });

    return rows.map(r => ({
        fiscalYear: r.fiscalYear,
        quarter: r.quarter,
        count: r._count.id,
        total: r._sum.amount ?? 0,
        updatedAt: r._max.updatedAt ?? new Date(),
    }));
}

/** Delete all dividends for a given fiscalYear (optionally scoped to quarter) */
export async function deleteDividendsByPeriod(
    fiscalYear: string,
    quarter?: string,
): Promise<number> {
    const result = await prisma.dividend.deleteMany({
        where: {
            fiscalYear,
            ...(quarter ? { quarter } : {}),
        },
    });
    return result.count;
}

export interface DividendEntry {
    id: number;
    isin: string;
    symbol: string | null;
    exDate: Date;
    payDate: Date | null;
    amount: number;
    dps: number | null;
    quantity: number | null;
    fiscalYear: string;
    quarter: string | null;
    transferredBack: boolean;
}

/** All dividend entries sorted by ex-date descending (for the Settings card table) */
export async function getDividendEntries(): Promise<DividendEntry[]> {
    return prisma.dividend.findMany({
        select: {
            id: true,
            isin: true,
            symbol: true,
            exDate: true,
            payDate: true,
            amount: true,
            dps: true,
            quantity: true,
            fiscalYear: true,
            quarter: true,
            transferredBack: true,
        },
        orderBy: { exDate: 'desc' },
    });
}

/** Delete a single dividend entry by its primary key */
export async function deleteDividendById(id: number): Promise<void> {
    await prisma.dividend.delete({ where: { id } });
}

/** Toggle / set the transferred-back status of a single dividend entry */
export async function setDividendTransferred(id: number, transferred: boolean): Promise<void> {
    await prisma.dividend.update({
        where: { id },
        data: { transferredBack: transferred },
    });
}

/**
 * Sliding-window watermark: mark all entries with exDate ≤ cutoffDate as transferred,
 * all entries with exDate > cutoffDate as pending.
 * Pass null to clear the watermark (mark everything as pending).
 */
export async function setTransferWatermark(cutoffDate: Date | null): Promise<void> {
    if (cutoffDate === null) {
        await prisma.dividend.updateMany({ data: { transferredBack: false } });
    } else {
        await prisma.$transaction([
            prisma.dividend.updateMany({
                where: { exDate: { lte: cutoffDate } },
                data: { transferredBack: true },
            }),
            prisma.dividend.updateMany({
                where: { exDate: { gt: cutoffDate } },
                data: { transferredBack: false },
            }),
        ]);
    }
}
