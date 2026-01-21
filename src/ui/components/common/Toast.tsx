/**
 * Toast Component
 *
 * Simple toast notification using MUI Snackbar.
 * Displays brief confirmation messages that auto-dismiss.
 */

import React from 'react';
import { Snackbar, Alert, type AlertColor } from '@mui/material';

export interface ToastProps {
  open: boolean;
  message: string;
  severity?: AlertColor;
  duration?: number;
  onClose: () => void;
}

/**
 * Toast notification component.
 * Auto-dismisses after duration (default: 3000ms).
 */
export const Toast: React.FC<ToastProps> = ({
  open,
  message,
  severity = 'success',
  duration = 3000,
  onClose,
}) => {
  return (
    <Snackbar
      open={open}
      autoHideDuration={duration}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      <Alert onClose={onClose} severity={severity} sx={{ width: '100%' }}>
        {message}
      </Alert>
    </Snackbar>
  );
};
