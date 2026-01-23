/**
 * WarmupIndicator - Shows buffer fill progress during warmup period.
 *
 * Displays "history: N/M" text when the ring buffer hasn't been
 * completely filled yet. Returns null when fully warmed up.
 */

import React from 'react';

export interface WarmupIndicatorProps {
  filled: number;
  capacity: number;
}

const style = {
  color: '#666',
  fontSize: '11px',
  fontFamily: 'monospace',
} as const;

export const WarmupIndicator: React.FC<WarmupIndicatorProps> = ({ filled, capacity }) => {
  if (filled >= capacity) return null;
  return React.createElement('span', { style }, `history: ${filled}/${capacity}`);
};
