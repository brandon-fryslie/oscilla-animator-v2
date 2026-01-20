/**
 * Toolbar Component
 *
 * Top toolbar with app title and performance stats.
 */

import React from 'react';
import { Button } from '@mui/material';
import { colors } from '../../theme';

interface ToolbarProps {
  stats?: string;
}

export const Toolbar: React.FC<ToolbarProps> = ({ stats = 'FPS: --' }) => {
  return (
    <header
      style={{
        flexShrink: 0,
        height: '48px',
        background: '#16213e',
        borderBottom: '1px solid #0f3460',
        display: 'flex',
        alignItems: 'center',
        padding: '0 1rem',
        gap: '1rem',
      }}
    >
      <h1
        style={{
          fontSize: '1rem',
          fontWeight: '500',
          color: colors.primary,
          margin: 0,
        }}
      >
        Oscilla v2
      </h1>

      <div style={{ flex: 1 }} />

      <div
        id="stats"
        style={{
          fontFamily: "'SF Mono', Monaco, Consolas, monospace",
          fontSize: '0.75rem',
          color: '#888',
          padding: '4px 8px',
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '4px',
        }}
      >
        {stats}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Button
          variant="text"
          size="small"
          sx={{
            color: '#888',
            fontSize: '0.75rem',
            textTransform: 'none',
            minWidth: 'auto',
            padding: '6px 12px',
            border: '1px solid #0f3460',
            '&:hover': {
              border: '1px solid #0f3460',
              background: 'rgba(255, 255, 255, 0.05)',
            },
          }}
        >
          New
        </Button>
        <Button
          variant="text"
          size="small"
          sx={{
            color: '#888',
            fontSize: '0.75rem',
            textTransform: 'none',
            minWidth: 'auto',
            padding: '6px 12px',
            border: '1px solid #0f3460',
            '&:hover': {
              border: '1px solid #0f3460',
              background: 'rgba(255, 255, 255, 0.05)',
            },
          }}
        >
          Open
        </Button>
        <Button
          variant="text"
          size="small"
          sx={{
            color: '#888',
            fontSize: '0.75rem',
            textTransform: 'none',
            minWidth: 'auto',
            padding: '6px 12px',
            border: '1px solid #0f3460',
            '&:hover': {
              border: '1px solid #0f3460',
              background: 'rgba(255, 255, 255, 0.05)',
            },
          }}
        >
          Save
        </Button>
      </div>
    </header>
  );
};
