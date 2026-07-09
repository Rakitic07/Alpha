import 'server-only';
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
//                   "taxpnl-ZQ1267-2026_2027-Q3-Q4.xlsx"
// ============================================================

export function parseDividendFilename(filename: string): {
    fiscalYear: string;
    quarter: string | null;
} {
    // Match pattern like 2026_2027 and optional Q1-Q2 / Q3 / Q4 etc.
    const fyMatch = filename.match(/(\d{4}_\d{4})/);
    const qMatch = filename.match(/(\d{4}_\d{4})[-_](Q[\d\-Q]+)/i);

    const fiscalYear = fyMatch ? fyMatch[1] : 'unknown';
    const quarter = qMatch ? qMatch[2].toUpperCase() : null;

    return { fiscalYear, quarter };
}

// ============================================================
// Excel parser — Zerodha Tax P&L dividend sheet
// ============================================================

/** Finds the dividend data range inside the Zerodha Tax P&L workbook.
 *  The dividend section has a header row containing "ISIN" and "Amount".
 *  Returns an array of row objects.
 */
function findDividendRows(wb: XLSX.WorkBook): Record<string, unknown>[] {
    for (const sheetName of wb.SheetNames) {
        // First filter: Only look at sheets that have 'dividend' in their name
        if (!sheetName.toLowerCase().includes('dividend')) {
            continue;
        }

        const ws = wb.Sheets[sheetName];
        
        // Zerodha sheets have metadata headers (Client ID, PAN) at the top,
        // so we must use raw AoA to find the actual table headers row.
        const rawAoA = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
        let headerRowIdx = -1;
        for (let i = 0; i < rawAoA.length; i++) {
            const row = rawAoA[i] as string[];
            const rowStr = row.map(c => String(c).toLowerCase()).join('|');
            if (rowStr.includes('isin') && (rowStr.includes('amount') || rowStr.includes('dividend'))) {
                headerRowIdx = i;
                break;
            }
        }

        if (headerRowIdx >= 0) {
            const headers = (rawAoA[headerRowIdx] as string[]).map(h => String(h).trim());
            const dataRows: Record<string, unknown>[] = [];
            for (let i = headerRowIdx + 1; i < rawAoA.length; i++) {
                const cells = rawAoA[i] as unknown[];
                // Skip empty rows
                if (cells.every(c => c === '' || c === null || c === undefined)) {
                    continue;
                }
                const firstCell = String(cells[0]).toLowerCase();
                // Skip total or summary footer rows
                if (firstCell.includes('total') || firstCell.includes('summary')) {
                    continue;
                }
                const obj: Record<string, unknown> = {};
                headers.forEach((h, idx) => { obj[h] = cells[idx] ?? ''; });
                dataRows.push(obj);
            }
            if (dataRows.length > 0) return dataRows;
        }
    }
    return [];
}

/** Attempt to find a column value across multiple possible header spellings */
function col(row: Record<string, unknown>, ...candidates: string[]): string {
    for (const c of candidates) {
        for (const key of Object.keys(row)) {
            if (key.toLowerCase().includes(c.toLowerCase())) {
                const v = row[key];
                if (v !== undefined && v !== null && String(v).trim() !== '') {
                    return String(v).trim();
                }
            }
        }
    }
    return '';
}

function parseDate(raw: string): Date | null {
    if (!raw) return null;
    // Try DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD
    const parts = raw.match(/(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (!parts) return null;
    const [, a, b, c] = parts;
    // Determine format by position
    if (a.length === 4) return new Date(`${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`);
    if (c.length === 4) return new Date(`${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`);
    return null;
}

export function parseZerodhaTaxPnLDividends(
    buffer: Buffer,
    filename: string,
): ParsedDividend[] {
    const { fiscalYear, quarter } = parseDividendFilename(filename);

    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const rows = findDividendRows(wb);

    const results: ParsedDividend[] = [];

    for (const row of rows) {
        const isin = col(row, 'isin');
        if (!isin || isin.length < 10) continue; // skip non-data rows

        const amountStr = col(row, 'amount', 'dividend amount', 'total');
        const amount = parseFloat(amountStr.replace(/[₹,\s]/g, ''));
        if (isNaN(amount) || amount === 0) continue;

        const exDateRaw = col(row, 'ex date', 'ex-date', 'exdate', 'date');
        const exDate = parseDate(exDateRaw);
        if (!exDate) continue;

        const payDateRaw = col(row, 'pay date', 'payment date', 'paydate');
        const payDate = parseDate(payDateRaw);

        const dpsStr = col(row, 'dps', 'dividend per share', 'rate');
        const dps = dpsStr ? parseFloat(dpsStr.replace(/[₹,\s]/g, '')) || null : null;

        const qtyStr = col(row, 'qty', 'quantity', 'shares', 'units');
        const quantity = qtyStr ? parseFloat(qtyStr.replace(/[,\s]/g, '')) || null : null;

        const symbol = col(row, 'symbol', 'scrip', 'stock', 'name') || null;

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

/** Upsert parsed dividends — dedup on (isin, exDate) */
export async function upsertDividends(records: ParsedDividend[]): Promise<number> {
    let count = 0;
    for (const r of records) {
        await prisma.dividend.upsert({
            where: { isin_exDate: { isin: r.isin, exDate: r.exDate } },
            update: {
                symbol: r.symbol,
                payDate: r.payDate,
                amount: r.amount,
                dps: r.dps,
                quantity: r.quantity,
                fiscalYear: r.fiscalYear,
                quarter: r.quarter,
            },
            create: {
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
        count++;
    }
    return count;
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
