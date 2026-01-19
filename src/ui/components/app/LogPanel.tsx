/**
 * Log Panel Component
 *
 * Displays application logs with auto-scroll.
 */

import React, { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../../stores';
import { colors } from '../../theme';
import type { LogEntry } from '../../../stores/DiagnosticsStore';

export const LogPanel = observer(function LogPanel() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [rootStore.diagnostics.logs.length]);

  const logs = rootStore.diagnostics.logs;

  return (
    <div
      ref={containerRef}
      style={{
        padding: '0.75rem',
        fontFamily: "'SF Mono', Monaco, Consolas, monospace",
        fontSize: '0.875rem',
        lineHeight: '1.4',
        height: '100%',
        overflow: 'auto',
        background: '#0f0f23',
      }}
    >
      {logs.map((entry: LogEntry) => {
        let color: string = colors.textSecondary;
        if (entry.level === 'error') color = '#ff6b6b';
        else if (entry.level === 'warn') color = '#ffd93d';
        else if (entry.level === 'info') color = colors.primary;

        const timestamp = new Date(entry.timestamp).toISOString().slice(11, 19);

        return (
          <div key={entry.id} style={{ color }}>
            [{timestamp}] {entry.message}
          </div>
        );
      })}
    </div>
  );
});
