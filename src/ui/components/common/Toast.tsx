/**
 * Toast Component
 *
 * Simple toast notification using Mantine's Notification component.
 * Displays brief confirmation messages that auto-dismiss.
 */

import React, { useEffect } from 'react';
import { Notification, Transition, rem, Box } from '@mantine/core';

export interface ToastProps {
  open: boolean;
  message: string;
  severity?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onClose: () => void;
}

// Map severity to Mantine colors and icons
const severityConfig = {
  success: {
    color: 'teal',
    icon: '✓',
    gradient: 'linear-gradient(135deg, rgba(32, 201, 151, 0.15) 0%, rgba(32, 201, 151, 0.05) 100%)',
  },
  error: {
    color: 'red',
    icon: '✕',
    gradient: 'linear-gradient(135deg, rgba(250, 82, 82, 0.15) 0%, rgba(250, 82, 82, 0.05) 100%)',
  },
  warning: {
    color: 'yellow',
    icon: '⚠',
    gradient: 'linear-gradient(135deg, rgba(252, 196, 25, 0.15) 0%, rgba(252, 196, 25, 0.05) 100%)',
  },
  info: {
    color: 'blue',
    icon: 'ℹ',
    gradient: 'linear-gradient(135deg, rgba(34, 139, 230, 0.15) 0%, rgba(34, 139, 230, 0.05) 100%)',
  },
} as const;

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
  const config = severityConfig[severity];

  // Auto-dismiss after duration
  useEffect(() => {
    if (open && duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [open, duration, onClose]);

  return (
    <Box
      style={{
        position: 'fixed',
        bottom: rem(24),
        right: rem(24),
        zIndex: 9999,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <Transition
        mounted={open}
        transition="slide-left"
        duration={300}
        timingFunction="ease"
      >
        {(styles) => (
          <Notification
            style={{
              ...styles,
              background: config.gradient,
              backdropFilter: 'blur(12px)',
              border: `1px solid rgba(139, 92, 246, 0.2)`,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            }}
            icon={
              <span style={{ fontSize: rem(16), fontWeight: 'bold' }}>
                {config.icon}
              </span>
            }
            color={config.color}
            withCloseButton
            onClose={onClose}
            title={severity === 'error' ? 'Error' : severity === 'success' ? 'Success' : undefined}
            radius="lg"
          >
            {message}
          </Notification>
        )}
      </Transition>
    </Box>
  );
};
