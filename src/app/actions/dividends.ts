'use server';

import {
    parseZerodhaTaxPnLDividends,
    upsertDividends,
    getDividendHistory,
    deleteDividendsByPeriod,
} from '@/lib/dividends';
import { revalidateApp } from '@/app/actions';

// ============================================================
// Upload
// ============================================================

export async function uploadDividendsAction(
    formData: FormData,
): Promise<{ success: boolean; count?: number; total?: number; message: string }> {
    const file = formData.get('file') as File | null;
    if (!file) return { success: false, message: 'No file provided.' };

    const allowedExts = ['.xlsx', '.xls'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExts.includes(ext)) {
        return { success: false, message: 'Only .xlsx / .xls files are supported.' };
    }

    try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const records = parseZerodhaTaxPnLDividends(buffer, file.name);

        if (records.length === 0) {
            return {
                success: false,
                message:
                    'No dividend rows found. Make sure the file contains a sheet with ISIN and Amount columns.',
            };
        }

        const count = await upsertDividends(records);
        const total = records.reduce((s, r) => s + r.amount, 0);

        // Invalidate Next.js cache so the dashboard/portfolio show updated values
        await revalidateApp();

        return {
            success: true,
            count,
            total,
            message: `Imported ${count} dividend record${count !== 1 ? 's' : ''} (₹${Math.round(total).toLocaleString('en-IN')} total). Duplicates were overwritten.`,
        };
    } catch (err) {
        console.error('[uploadDividendsAction]', err);
        return {
            success: false,
            message: `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        };
    }
}

// ============================================================
// History (for settings card)
// ============================================================

export async function getDividendHistoryAction() {
    return getDividendHistory();
}

// ============================================================
// Delete a period
// ============================================================

export async function deleteDividendPeriodAction(
    fiscalYear: string,
    quarter?: string,
): Promise<{ success: boolean; deleted: number; message: string }> {
    try {
        const deleted = await deleteDividendsByPeriod(fiscalYear, quarter);
        
        // Invalidate Next.js cache so the dashboard/portfolio show updated values
        await revalidateApp();

        return {
            success: true,
            deleted,
            message: `Deleted ${deleted} record${deleted !== 1 ? 's' : ''} for ${fiscalYear}${quarter ? ` ${quarter}` : ''}.`,
        };
    } catch (err) {
        console.error('[deleteDividendPeriodAction]', err);
        return {
            success: false,
            deleted: 0,
            message: `Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        };
    }
}
