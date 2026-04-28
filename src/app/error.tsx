'use client';

import { useEffect } from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faRefresh } from '@fortawesome/free-solid-svg-icons';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        p: 4,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 4,
          textAlign: 'center',
          backgroundColor: 'rgba(244, 67, 54, 0.05)',
          border: '1px solid rgba(244, 67, 54, 0.2)',
          borderRadius: 2,
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <FontAwesomeIcon
          icon={faExclamationTriangle}
          style={{ fontSize: 40, color: '#f44336' }}
        />
        <Typography variant="h6" color="error">
          Something went wrong
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {error.message || 'An unexpected error occurred'}
        </Typography>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<FontAwesomeIcon icon={faRefresh} />}
          onClick={reset}
          sx={{ mt: 1 }}
        >
          Try Again
        </Button>
      </Paper>
    </Box>
  );
}
