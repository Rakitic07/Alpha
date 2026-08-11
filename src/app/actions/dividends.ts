'use server';

import {
    parseZerodhaTaxPnLDividends,
    upsertDividends,
    getDividendHistory,
    getDividendEntries,
    deleteDividendsByPeriod,
    deleteDividendById,
    setDividendTransferred,
    setTransferWatermark,
    type UpsertDividendsResult,
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

        const result: UpsertDividendsResult = await upsertDividends(records);
        const total = records.reduce((s, r) => s + r.amount, 0);

        // Invalidate Next.js cache so the dashboard/portfolio show updated values
        await revalidateApp();

        const parts: string[] = [];
        if (result.inserted > 0) parts.push(`${result.inserted} new`);
        if (result.updated > 0) parts.push(`${result.updated} updated`);
        if (result.unchanged > 0) parts.push(`${result.unchanged} unchanged`);
        const summary = parts.length > 0 ? parts.join(', ') : 'no changes';

        return {
            success: true,
            count: result.inserted + result.updated,
            total,
            message: `Processed ${result.total} record${result.total !== 1 ? 's' : ''}: ${summary}. Total value ₹${Math.round(total).toLocaleString('en-IN')}.`,
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
// Entries (sorted by date — for settings card table)
// ============================================================

export async function getDividendEntriesAction() {
    return getDividendEntries();
}

// ============================================================
// History (grouped by period — kept for backward compat)
// ============================================================

export async function getDividendHistoryAction() {
    return getDividendHistory();
}

// ============================================================
// Delete a single entry by id
// ============================================================

export async function deleteDividendByIdAction(
    id: number,
): Promise<{ success: boolean; message: string }> {
    try {
        await deleteDividendById(id);
        await revalidateApp();
        return { success: true, message: 'Entry deleted.' };
    } catch (err) {
        console.error('[deleteDividendByIdAction]', err);
        return {
            success: false,
            message: `Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        };
    }
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

// ============================================================
// Sliding-window watermark: set or clear the transfer boundary
// ============================================================

/**
 * Mark all dividend entries with exDate ≤ cutoffIso as transferred,
 * all entries with exDate > cutoffIso as pending.
 * Pass null to clear the watermark entirely.
 */
export async function setTransferWatermarkAction(
    cutoffIso: string | null,
): Promise<{ success: boolean; message: string }> {
    try {
        const cutoff = cutoffIso ? new Date(cutoffIso) : null;
        await setTransferWatermark(cutoff);
        return {
            success: true,
            message: cutoff
                ? `Watermark set to ${cutoff.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.`
                : 'Transfer watermark cleared.',
        };
    } catch (err) {
        console.error('[setTransferWatermarkAction]', err);
        return {
            success: false,
            message: `Update failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        };
    }
}
