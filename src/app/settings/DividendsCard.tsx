'use client';

import { useState, useEffect } from 'react';
import { Paper, Button, Snackbar, Alert, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, IconButton } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLeaf } from '@fortawesome/free-solid-svg-icons';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import VisibilityIcon from '@mui/icons-material/Visibility';
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
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
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
        if (result.success) {
            await fetchHistory();
            // Close modal if history becomes empty
            const nextHistory = await getDividendHistoryAction();
            if (nextHistory.length === 0) {
                setHistoryModalOpen(false);
            }
        }
    };

    const periodLabel = (row: HistoryRow) =>
        `FY ${row.fiscalYear.replace('_', '-')}${row.quarter ? ` ${row.quarter}` : ''}`;

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
                            disabled={history.length === 0}
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
                            History ({history.length})
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

            {/* History Modal */}
            <Dialog
                open={historyModalOpen}
                onClose={() => setHistoryModalOpen(false)}
                maxWidth="sm"
                fullWidth
                slotProps={{
                    paper: {
                        style: { backgroundColor: '#1e293b', color: 'white', maxHeight: '80vh' }
                    }
                }}
            >
                <DialogTitle sx={{ color: 'white', pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FontAwesomeIcon icon={faLeaf} className="text-teal-400" />
                    Dividends Upload History
                </DialogTitle>
                <DialogContent sx={{ p: 0 }}>
                    <div className="flex items-center px-3 py-2 bg-slate-800 border-b border-white/10 sticky top-0 z-10">
                        <div className="flex-1 text-xs font-semibold text-gray-400">Period</div>
                        <div className="w-20 text-xs font-semibold text-gray-400 text-center">Records</div>
                        <div className="w-24 text-xs font-semibold text-gray-400 text-right">Total Amount</div>
                        <div className="w-10"></div>
                    </div>
                    
                    <div className="max-h-[400px] overflow-y-auto">
                        {history.length > 0 ? history.map((row, index) => (
                            <div 
                                key={`${row.fiscalYear}-${row.quarter ?? 'all'}`}
                                className={`flex items-center px-3 py-2 border-b border-white/5 ${index % 2 === 0 ? 'bg-slate-900/20' : 'bg-slate-900/40'}`}
                            >
                                <div className="flex-1 text-sm text-gray-200 font-medium">
                                    {periodLabel(row)}
                                </div>
                                <div className="w-20 text-xs text-gray-400 text-center">
                                    {row.count}
                                </div>
                                <div className="w-24 text-xs text-gray-400 text-right font-semibold">
                                    {formatCurrency(row.total, 0, 0)}
                                </div>
                                <IconButton
                                    onClick={() => handleDelete(row.fiscalYear, row.quarter)}
                                    size="small"
                                    sx={{ color: '#6b7280', '&:hover': { color: '#ef4444' }, ml: 1 }}
                                >
                                    <DeleteIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </div>
                        )) : (
                            <div className="text-center py-8 text-gray-500 text-sm">
                                No dividend upload history found.
                            </div>
                        )}
                    </div>
                </DialogContent>
                <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <Button onClick={() => setHistoryModalOpen(false)} sx={{ color: '#94a3b8', textTransform: 'none' }}>
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
