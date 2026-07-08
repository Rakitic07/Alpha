'use client';

import { useState, useEffect } from 'react';
import { Paper, Button, Snackbar, Alert, CircularProgress } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLeaf } from '@fortawesome/free-solid-svg-icons';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import {
    uploadDividendsAction,
    getDividendHistoryAction,
    deleteDividendPeriodAction,
} from '@/app/actions/dividends';
import { formatCurrency } from '@/lib/format';

interface HistoryRow {
    fiscalYear: string;
    quarter: string | null;
    count: number;
    total: number;
    updatedAt: Date;
}

export default function DividendsCard() {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
        open: false, message: '', severity: 'success',
    });

    const fetchHistory = async () => {
        try {
            const rows = await getDividendHistoryAction();
            setHistory(rows);
        } catch (e) {
            console.error('Failed to fetch dividend history', e);
        }
    };

    useEffect(() => { fetchHistory(); }, []);

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
                await fetchHistory();
            }
        } catch (e) {
            setSnackbar({ open: true, message: `Upload failed: ${e instanceof Error ? e.message : 'Unknown error'}`, severity: 'error' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (fiscalYear: string, quarter: string | null) => {
        if (!confirm(`Delete dividends for ${fiscalYear}${quarter ? ` ${quarter}` : ''}?`)) return;
        const result = await deleteDividendPeriodAction(fiscalYear, quarter ?? undefined);
        setSnackbar({ open: true, message: result.message, severity: result.success ? 'success' : 'error' });
        if (result.success) await fetchHistory();
    };

    const periodLabel = (row: HistoryRow) =>
        `FY ${row.fiscalYear.replace('_', '-')}${row.quarter ? ` ${row.quarter}` : ''}`;

    return (
        <>
            <Paper
                className="p-5 rounded-xl border border-white/10 backdrop-blur-md"
                style={{ background: 'rgba(255,255,255,0.04)' }}
            >
                {/* Header */}
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-500/5 flex items-center justify-center flex-shrink-0">
                        <FontAwesomeIcon icon={faLeaf} className="text-teal-400 text-lg" />
                    </div>
                    <div>
                        <div className="text-sm font-bold text-white">Dividends</div>
                        <div className="text-xs text-gray-400">Upload Zerodha Tax P&amp;L statement (.xlsx)</div>
                    </div>
                </div>

                {/* File picker */}
                <div className="flex flex-col sm:flex-row gap-3 mb-5">
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

                {/* Upload history */}
                {history.length > 0 && (
                    <div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Upload History</div>
                        <div className="flex flex-col gap-1.5">
                            {history.map(row => (
                                <div
                                    key={`${row.fiscalYear}-${row.quarter ?? 'all'}`}
                                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/8"
                                >
                                    <div>
                                        <span className="text-xs font-semibold text-gray-200">{periodLabel(row)}</span>
                                        <span className="text-[10px] text-gray-500 ml-2">
                                            {row.count} record{row.count !== 1 ? 's' : ''} · {formatCurrency(row.total, 0, 0)}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(row.fiscalYear, row.quarter)}
                                        className="text-gray-600 hover:text-red-400 transition-colors p-1"
                                        title="Delete this period"
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {history.length === 0 && (
                    <div className="text-xs text-gray-600 text-center py-3">No dividend data uploaded yet.</div>
                )}
            </Paper>

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
