/**
 * Toolbar Component
 *
 * Top toolbar with app title and performance stats.
 */

import React from 'react';
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
        <button
          className="toolbar-btn"
          style={{
            padding: '6px 12px',
            background: 'transparent',
            border: '1px solid #0f3460',
            borderRadius: '4px',
            color: '#888',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          New
        </button>
        <button
          className="toolbar-btn"
          style={{
            padding: '6px 12px',
            background: 'transparent',
            border: '1px solid #0f3460',
            borderRadius: '4px',
            color: '#888',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          Open
        </button>
        <button
          className="toolbar-btn"
          style={{
            padding: '6px 12px',
            background: 'transparent',
            border: '1px solid #0f3460',
            borderRadius: '4px',
            color: '#888',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          Save
        </button>
      </div>
    </header>
  );
};
