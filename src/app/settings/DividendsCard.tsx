'use client';

import { useState, useEffect } from 'react';
import { Paper, Button, Snackbar, Alert, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLeaf } from '@fortawesome/free-solid-svg-icons';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import {
    uploadDividendsAction,
    getDividendEntriesAction,
    deleteDividendByIdAction,
    markDividendTransferredAction,
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

export default function DividendsCard() {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [entries, setEntries] = useState<DividendEntry[]>([]);
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
        open: false, message: '', severity: 'success',
    });

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

    const handleToggleTransfer = async (id: number, current: boolean) => {
        // Optimistic update
        setEntries(prev => prev.map(e => e.id === id ? { ...e, transferredBack: !current } : e));
        const result = await markDividendTransferredAction(id, !current);
        if (!result.success) {
            // Revert on failure
            setEntries(prev => prev.map(e => e.id === id ? { ...e, transferredBack: current } : e));
            setSnackbar({ open: true, message: result.message, severity: 'error' });
        }
    };

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
                    Dividend Entries
                </DialogTitle>
                <DialogContent sx={{ p: 0 }}>
                    {/* Table header */}
                    <div className="flex items-center px-3 py-2 bg-slate-800 border-b border-white/10 sticky top-0 z-10">
                        <div className="w-8"></div>
                        <div className="w-24 text-xs font-semibold text-gray-400">Ex-Date</div>
                        <div className="flex-1 text-xs font-semibold text-gray-400">Symbol / ISIN</div>
                        <div className="w-20 text-xs font-semibold text-gray-400">Period</div>
                        <div className="w-24 text-xs font-semibold text-gray-400 text-right">Amount</div>
                        <div className="w-10"></div>
                    </div>

                    <div className="max-h-[360px] overflow-y-auto">
                        {entries.length > 0 ? entries.map((row, index) => (
                            <div
                                key={row.id}
                                className={`flex items-center px-3 py-2 border-b border-white/5 transition-colors ${
                                    row.transferredBack
                                        ? 'bg-teal-900/20'
                                        : index % 2 === 0 ? 'bg-slate-900/20' : 'bg-slate-900/40'
                                }`}
                            >
                                {/* Transfer toggle */}
                                <Tooltip title={row.transferredBack ? 'Mark as pending' : 'Mark as transferred to broker'} placement="right">
                                    <IconButton
                                        onClick={() => handleToggleTransfer(row.id, row.transferredBack)}
                                        size="small"
                                        sx={{ color: row.transferredBack ? '#2dd4bf' : '#374151', '&:hover': { color: '#2dd4bf' }, p: 0.5, mr: 0.5 }}
                                    >
                                        {row.transferredBack
                                            ? <CheckCircleIcon sx={{ fontSize: 16 }} />
                                            : <RadioButtonUncheckedIcon sx={{ fontSize: 16 }} />
                                        }
                                    </IconButton>
                                </Tooltip>
                                <div className={`w-24 text-xs font-mono ${row.transferredBack ? 'text-teal-300' : 'text-gray-300'}`}>
                                    {new Date(row.exDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                </div>
                                <div className={`flex-1 text-sm font-medium truncate pr-2 ${row.transferredBack ? 'text-teal-200' : 'text-gray-200'}`}>
                                    {row.symbol ?? row.isin}
                                    {row.symbol && <span className="ml-1 text-xs text-gray-500">{row.isin}</span>}
                                </div>
                                <div className="w-20 text-xs text-gray-500">
                                    {row.fiscalYear.replace('_', '-')}{row.quarter ? ` ${row.quarter}` : ''}
                                </div>
                                <div className={`w-24 text-xs text-right font-semibold ${row.transferredBack ? 'text-teal-300' : 'text-gray-300'}`}>
                                    {formatCurrency(row.amount, 0, 0)}
                                </div>
                                <IconButton
                                    onClick={() => handleDelete(row.id)}
                                    size="small"
                                    sx={{ color: '#6b7280', '&:hover': { color: '#ef4444' }, ml: 1 }}
                                >
                                    <DeleteIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </div>
                        )) : (
                            <div className="text-center py-8 text-gray-500 text-sm">
                                No dividend entries found.
                            </div>
                        )}
                    </div>

                    {/* Summary footer */}
                    {entries.length > 0 && (() => {
                        const transferred = entries.filter(e => e.transferredBack).reduce((s, e) => s + e.amount, 0);
                        const pending = entries.filter(e => !e.transferredBack).reduce((s, e) => s + e.amount, 0);
                        return (
                            <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-t border-white/10 text-xs">
                                <span className="text-gray-400">
                                    <span className="text-teal-400 font-semibold">{formatCurrency(transferred, 0, 0)}</span>
                                    <span className="ml-1">transferred</span>
                                </span>
                                <span className="text-gray-400">
                                    <span className="text-yellow-400 font-semibold">{formatCurrency(pending, 0, 0)}</span>
                                    <span className="ml-1">pending transfer</span>
                                </span>
                            </div>
                        );
                    })()}
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
