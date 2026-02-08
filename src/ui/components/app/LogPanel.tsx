/**
 * Log Panel Component
 *
 * Displays application logs with auto-scroll.
 * Error details are clickable — clicking selects the referenced block/port in the graph.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../../stores';
import { colors } from '../../theme';
import { blockId as toBlockId, portId as toPortId } from '../../../types';
import type { LogEntry, LogDetail } from '../../../stores/DiagnosticsStore';

export const LogPanel = observer(function LogPanel() {
  const { diagnostics, selection } = useStores();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [diagnostics.logs.length]);

  const handleDetailClick = useCallback((detail: LogDetail) => {
    if (!detail.blockId) return;
    if (detail.portId) {
      selection.selectPort(toBlockId(detail.blockId), toPortId(detail.portId));
    } else {
      selection.selectBlock(toBlockId(detail.blockId));
    }
  }, [selection]);

  const logs = diagnostics.logs;

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
          <div key={entry.id}>
            <div style={{ color }}>
              [{timestamp}] {entry.message}
            </div>
            {entry.details && entry.details.length > 0 && (
              <div style={{ marginLeft: '2rem', marginBottom: '0.25rem' }}>
                {entry.details.map((detail: LogDetail, i: number) => {
                  const clickable = !!detail.blockId;
                  return (
                    <div
                      key={i}
                      onClick={clickable ? () => handleDetailClick(detail) : undefined}
                      style={{
                        color,
                        opacity: 0.9,
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'baseline',
                        cursor: clickable ? 'pointer' : undefined,
                      }}
                    >
                      {detail.blockType && (
                        <span style={{
                          fontSize: '0.75rem',
                          padding: '0 4px',
                          borderRadius: '3px',
                          background: clickable ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)',
                          color: clickable ? '#bbb' : '#999',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          textDecoration: clickable ? 'underline' : undefined,
                          textDecorationColor: 'rgba(255,255,255,0.2)',
                          textUnderlineOffset: '2px',
                        }}>
                          {detail.blockType}{detail.portId ? `.${detail.portId}` : ''}
                        </span>
                      )}
                      <span>{detail.message}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
