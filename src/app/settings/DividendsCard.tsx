'use client';

import { useState, useEffect } from 'react';
import {
    Paper, Button, Snackbar, Alert, CircularProgress,
    Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLeaf } from '@fortawesome/free-solid-svg-icons';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import {
    uploadDividendsAction,
    getDividendEntriesAction,
    deleteDividendByIdAction,
    setTransferWatermarkAction,
} from '@/app/actions/dividends';
import { formatCurrency } from '@/lib/format';

interface DividendEntry {
    id: number;
    isin: string;
    symbol: string | null;
    exDate: Date;
    amount: number;
    fiscalYear: string;
    quarter: string | null;
    transferredBack: boolean;
}

const fmtDate = (d: Date) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });

export default function DividendsCard() {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [entries, setEntries] = useState<DividendEntry[]>([]);
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
        open: false, message: '', severity: 'success',
    });

    // entries sorted oldest → newest for the sliding window
    const sorted = [...entries].sort(
        (a, b) => new Date(a.exDate).getTime() - new Date(b.exDate).getTime(),
    );

    // Index of the last transferred entry (watermark position), -1 = none
    const watermarkIdx = (() => {
        let last = -1;
        sorted.forEach((e, i) => { if (e.transferredBack) last = i; });
        return last;
    })();

    const fetchEntries = async () => {
        try {
            const rows = await getDividendEntriesAction();
            setEntries(rows);
        } catch (e) {
            console.error('Failed to fetch dividend entries', e);
        }
    };

    useEffect(() => { fetchEntries(); }, []);

    const handleUpload = async () => {
        if (!file) return;
        setIsUploading(true);
        setSnackbar({ open: true, message: 'Parsing dividend data…', severity: 'info' });
        try {
            const fd = new FormData();
            fd.append('file', file);
            const result = await uploadDividendsAction(fd);
            setSnackbar({ open: true, message: result.message, severity: result.success ? 'success' : 'error' });
            if (result.success) {
                setFile(null);
                await fetchEntries();
            }
        } catch (e) {
            setSnackbar({ open: true, message: `Upload failed: ${e instanceof Error ? e.message : 'Unknown error'}`, severity: 'error' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this dividend entry?')) return;
        const result = await deleteDividendByIdAction(id);
        setSnackbar({ open: true, message: result.message, severity: result.success ? 'success' : 'error' });
        if (result.success) {
            await fetchEntries();
            if (entries.length <= 1) setHistoryModalOpen(false);
        }
    };

    /**
     * Clicking a row slides the watermark:
     * - Click a pending row  → set watermark to that row's exDate (mark all up to here as transferred)
     * - Click a transferred row → retract watermark to one row before it (mark from here as pending)
     */
    const handleRowClick = async (row: DividendEntry, idx: number) => {
        if (isUpdating) return;
        setIsUpdating(true);

        let cutoffIso: string | null;
        if (!row.transferredBack) {
            // Extend watermark down to include this row
            cutoffIso = new Date(row.exDate).toISOString();
        } else if (idx === 0) {
            // Retract completely — first row clicked, clear all
            cutoffIso = null;
        } else {
            // Retract to the row just before this one
            cutoffIso = new Date(sorted[idx - 1].exDate).toISOString();
        }

        // Optimistic update
        setEntries(prev =>
            prev.map(e => ({
                ...e,
                transferredBack: cutoffIso
                    ? new Date(e.exDate).getTime() <= new Date(cutoffIso!).getTime()
                    : false,
            }))
        );

        const result = await setTransferWatermarkAction(cutoffIso);
        if (!result.success) {
            await fetchEntries(); // revert
            setSnackbar({ open: true, message: result.message, severity: 'error' });
        }
        setIsUpdating(false);
    };

    const handleClearWatermark = async () => {
        if (isUpdating) return;
        setIsUpdating(true);
        setEntries(prev => prev.map(e => ({ ...e, transferredBack: false })));
        await setTransferWatermarkAction(null);
        setIsUpdating(false);
    };

    const transferred = sorted.filter(e => e.transferredBack).reduce((s, e) => s + e.amount, 0);
    const pending = sorted.filter(e => !e.transferredBack).reduce((s, e) => s + e.amount, 0);

    return (
        <>
            <Paper
                className="p-5 rounded-xl border border-white/10 backdrop-blur-md flex flex-col justify-between h-full"
                style={{ background: 'rgba(255,255,255,0.04)', minHeight: '180px' }}
            >
                <div className="flex flex-col gap-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-500/5 flex items-center justify-center flex-shrink-0">
                                <FontAwesomeIcon icon={faLeaf} className="text-teal-400 text-lg" />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white">Dividends</div>
                                <div className="text-xs text-gray-400">Upload Zerodha Tax P&amp;L statement (.xlsx)</div>
                            </div>
                        </div>
                        <Button
                            variant="text"
                            size="small"
                            startIcon={<VisibilityIcon sx={{ fontSize: 14 }} />}
                            onClick={() => setHistoryModalOpen(true)}
                            disabled={entries.length === 0}
                            sx={{
                                textTransform: 'none',
                                color: '#94a3b8',
                                fontSize: '0.7rem',
                                minWidth: 'auto',
                                px: 1,
                                py: 0.5,
                                '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' },
                            }}
                        >
                            Entries ({entries.length})
                        </Button>
                    </div>

                    {/* File picker */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <label className="flex-1 cursor-pointer">
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                className="hidden"
                                onChange={e => setFile(e.target.files?.[0] ?? null)}
                            />
                            <div className={`h-10 px-4 flex items-center gap-2 rounded-lg border text-sm transition-colors ${
                                file
                                    ? 'border-teal-500/50 bg-teal-500/10 text-teal-300'
                                    : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                            }`}>
                                <CloudUploadIcon fontSize="small" />
                                <span className="truncate">{file ? file.name : 'Select taxpnl-…xlsx file'}</span>
                            </div>
                        </label>

                        <Button
                            variant="contained"
                            disabled={!file || isUploading}
                            onClick={handleUpload}
                            className="h-10 px-5 text-xs font-semibold normal-case"
                            style={{ background: file && !isUploading ? '#14b8a6' : undefined }}
                        >
                            {isUploading ? <CircularProgress size={16} color="inherit" /> : 'Upload'}
                        </Button>
                    </div>
                </div>
            </Paper>

            {/* Entries Modal */}
            <Dialog
                open={historyModalOpen}
                onClose={() => setHistoryModalOpen(false)}
                maxWidth="sm"
                fullWidth
                slotProps={{
                    paper: {
                        style: { backgroundColor: '#0f172a', color: 'white', maxHeight: '85vh' }
                    }
                }}
            >
                <DialogTitle sx={{ color: 'white', pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faLeaf} className="text-teal-400" />
                        Dividend Entries
                    </span>
                    {watermarkIdx >= 0 && (
                        <Tooltip title="Clear transfer watermark">
                            <Button
                                size="small"
                                onClick={handleClearWatermark}
                                disabled={isUpdating}
                                sx={{ textTransform: 'none', color: '#6b7280', fontSize: '0.65rem', minWidth: 'auto' }}
                            >
                                Clear
                            </Button>
                        </Tooltip>
                    )}
                </DialogTitle>

                <DialogContent sx={{ p: 0 }}>
                    {/* Column headers */}
                    <div className="flex items-center px-3 py-2 bg-slate-800 border-b border-white/10 sticky top-0 z-10">
                        <div className="w-20 text-xs font-semibold text-gray-400">Ex-Date</div>
                        <div className="flex-1 text-xs font-semibold text-gray-400">Symbol / ISIN</div>
                        <div className="w-16 text-xs font-semibold text-gray-400">Period</div>
                        <div className="w-20 text-xs font-semibold text-gray-400 text-right">Amount</div>
                        <div className="w-12 text-xs font-semibold text-gray-500 text-center">
                            <SwapVertIcon sx={{ fontSize: 14 }} />
                        </div>
                    </div>

                    <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 180px)' }}>
                        {sorted.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm">No dividend entries found.</div>
                        ) : (
                            sorted.map((row, idx) => {
                                const isLast = idx === sorted.length - 1;
                                const isWatermarkEdge = idx === watermarkIdx; // last transferred row

                                return (
                                    <div key={row.id}>
                                        {/* Data row */}
                                        <div
                                            onClick={() => handleRowClick(row, idx)}
                                            onContextMenu={e => { e.preventDefault(); handleDelete(row.id); }}
                                            className={`
                                                    flex items-center px-3 py-[7px] border-b border-white/5
                                                    cursor-pointer select-none transition-all duration-150
                                                    ${row.transferredBack
                                                        ? 'bg-teal-950/40 hover:bg-teal-900/30'
                                                        : 'bg-slate-900/30 hover:bg-indigo-950/40'
                                                    }
                                                    ${isUpdating ? 'pointer-events-none opacity-60' : ''}
                                                `}
                                        >
                                            <div className={`w-20 text-xs font-mono ${row.transferredBack ? 'text-teal-400' : 'text-gray-400'}`}>
                                                {fmtDate(row.exDate)}
                                            </div>
                                            <div className={`flex-1 text-sm font-medium truncate pr-2 ${row.transferredBack ? 'text-teal-200' : 'text-gray-200'}`}>
                                                {row.symbol ?? row.isin}
                                                {row.symbol && (
                                                    <span className="ml-1.5 text-[10px] text-gray-600 font-normal">
                                                        {row.isin}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="w-16 text-[10px] text-gray-600">
                                                {row.fiscalYear.replace('_', '-')}{row.quarter ? ` ${row.quarter}` : ''}
                                            </div>
                                            <div className={`w-20 text-xs text-right font-semibold tabular-nums ${row.transferredBack ? 'text-teal-300' : 'text-gray-300'}`}>
                                                {formatCurrency(row.amount, 0, 0)}
                                            </div>
                                            {/* Status indicator */}
                                            <div className="w-12 flex justify-center items-center">
                                                {row.transferredBack ? (
                                                    <span className="text-[9px] text-teal-500 font-semibold tracking-wide">✓</span>
                                                ) : (
                                                    <span className="text-[9px] text-gray-700">○</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Watermark divider — rendered after the last transferred row */}
                                        {isWatermarkEdge && !isLast && (
                                            <div className="relative flex items-center py-0.5 px-3 select-none pointer-events-none">
                                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-teal-500/70 to-transparent" />
                                                <span className="mx-3 flex items-center gap-1.5 text-[10px] font-semibold text-teal-500 whitespace-nowrap">
                                                    <span>↑ transferred to broker</span>
                                                    <span className="text-gray-600">·</span>
                                                    <span className="text-gray-500">pending ↓</span>
                                                </span>
                                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-teal-500/70 to-transparent" />
                                            </div>
                                        )}

                                        {/* Hint when nothing is transferred yet — above first pending row */}
                                        {watermarkIdx === -1 && idx === 0 && (
                                            <div className="flex items-center justify-center py-1 px-3 select-none pointer-events-none">
                                                <span className="text-[10px] text-gray-600 italic">
                                                    click any row to set the transfer watermark
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Summary footer */}
                    {sorted.length > 0 && (
                        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-t border-white/10">
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                                <span className="text-xs text-teal-300 font-semibold">{formatCurrency(transferred, 0, 0)}</span>
                                <span className="text-xs text-gray-500">transferred</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-500">pending</span>
                                <span className="text-xs text-yellow-300 font-semibold">{formatCurrency(pending, 0, 0)}</span>
                                <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
                            </div>
                        </div>
                    )}
                </DialogContent>

                <DialogActions sx={{ p: 1.5, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="text-[10px] text-gray-600 pl-1">Right-click a row to delete it</span>
                    <Button onClick={() => setHistoryModalOpen(false)} sx={{ color: '#94a3b8', textTransform: 'none', fontSize: '0.75rem' }}>
                        Close
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={5000}
                onClose={() => setSnackbar(s => ({ ...s, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert
                    onClose={() => setSnackbar(s => ({ ...s, open: false }))}
                    severity={snackbar.severity}
                    variant="filled"
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </>
    );
}
