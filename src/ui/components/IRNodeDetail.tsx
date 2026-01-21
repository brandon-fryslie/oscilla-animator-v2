/**
 * IRNodeDetail Component
 *
 * Displays detailed information about a selected IR node.
 * Shows:
 * - Node path
 * - Formatted value
 * - Raw JSON
 */

import React, { useState, useMemo } from 'react';
import { colors } from '../theme';
import './CompilationInspector.css';

export interface IRNodeDetailProps {
  /** Path to the node */
  path: string[];

  /** Node value */
  value: unknown;

  /** Optional close callback */
  onClose?: () => void;
}

/**
 * IRNodeDetail component.
 * Shows detailed view of selected IR node.
 */
export const IRNodeDetail: React.FC<IRNodeDetailProps> = ({ path, value, onClose }) => {
  const [showRawJSON, setShowRawJSON] = useState(false);

  // Format path for display
  const pathDisplay = useMemo(() => {
    if (path.length === 0) return '(root)';
    return path.join(' → ');
  }, [path]);

  // Format value for display
  const formattedValue = useMemo(() => {
    return formatValuePretty(value);
  }, [value]);

  // Raw JSON
  const rawJSON = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch (e) {
      return '[Error serializing value]';
    }
  }, [value]);

  return (
    <div className="ir-node-detail">
      {/* Header */}
      <div className="ir-node-detail-header">
        <div className="ir-node-detail-path">{pathDisplay}</div>
        {onClose && (
          <button onClick={onClose} className="ir-node-detail-close" aria-label="Close">
            ✕
          </button>
        )}
      </div>

      {/* Toggle */}
      <div className="ir-node-detail-toggle">
        <button
          className={`toggle-button ${!showRawJSON ? 'toggle-button-active' : ''}`}
          onClick={() => setShowRawJSON(false)}
        >
          Formatted
        </button>
        <button
          className={`toggle-button ${showRawJSON ? 'toggle-button-active' : ''}`}
          onClick={() => setShowRawJSON(true)}
        >
          Raw JSON
        </button>
      </div>

      {/* Content */}
      <div className="ir-node-detail-content">
        {showRawJSON ? (
          <pre className="ir-node-detail-json">{rawJSON}</pre>
        ) : (
          <div className="ir-node-detail-formatted">{formattedValue}</div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format value for pretty display (not JSON).
 */
function formatValuePretty(value: unknown): React.ReactNode {
  // Null/undefined
  if (value === null) {
    return <span style={{ color: colors.textMuted, fontStyle: 'italic' }}>null</span>;
  }
  if (value === undefined) {
    return <span style={{ color: colors.textMuted, fontStyle: 'italic' }}>undefined</span>;
  }

  // Primitives
  if (typeof value === 'string') {
    // Special markers
    if (value === '[Circular]') {
      return <span style={{ color: colors.warning }}>↻ [Circular Reference]</span>;
    }
    if (value === '[Function]') {
      return <span style={{ color: colors.textSecondary }}>ƒ [Function]</span>;
    }
    // Regular string
    return <span style={{ color: colors.primary }}>{`"${value}"`}</span>;
  }
  if (typeof value === 'number') {
    return <span style={{ color: '#c586c0' }}>{value}</span>;
  }
  if (typeof value === 'boolean') {
    return <span style={{ color: '#569cd6' }}>{String(value)}</span>;
  }

  // Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span style={{ color: colors.textSecondary }}>[]</span>;
    }
    return (
      <div>
        <div style={{ color: colors.textSecondary, marginBottom: '8px' }}>
          Array ({value.length} items)
        </div>
        <div style={{ paddingLeft: '12px' }}>
          {value.slice(0, 10).map((item, idx) => (
            <div key={idx} style={{ marginBottom: '4px' }}>
              <span style={{ color: colors.textMuted }}>[{idx}]</span>:{' '}
              {formatValueInline(item)}
            </div>
          ))}
          {value.length > 10 && (
            <div style={{ color: colors.textMuted, fontStyle: 'italic' }}>
              ... and {value.length - 10} more
            </div>
          )}
        </div>
      </div>
    );
  }

  // Objects (including serialized Maps/Sets)
  if (typeof value === 'object') {
    // Serialized Map
    if ('__type' in value && (value as any).__type === 'Map') {
      const entries = Object.entries((value as any).entries || {});
      if (entries.length === 0) {
        return <span style={{ color: colors.textSecondary }}>Map (empty)</span>;
      }
      return (
        <div>
          <div style={{ color: colors.textSecondary, marginBottom: '8px' }}>
            Map ({entries.length} entries)
          </div>
          <div style={{ paddingLeft: '12px' }}>
            {entries.slice(0, 10).map(([k, v], idx) => (
              <div key={idx} style={{ marginBottom: '4px' }}>
                <span style={{ color: colors.primary }}>{k}</span> →{' '}
                {formatValueInline(v)}
              </div>
            ))}
            {entries.length > 10 && (
              <div style={{ color: colors.textMuted, fontStyle: 'italic' }}>
                ... and {entries.length - 10} more
              </div>
            )}
          </div>
        </div>
      );
    }

    // Serialized Set
    if ('__type' in value && (value as any).__type === 'Set') {
      const values = (value as any).values || [];
      if (values.length === 0) {
        return <span style={{ color: colors.textSecondary }}>Set (empty)</span>;
      }
      return (
        <div>
          <div style={{ color: colors.textSecondary, marginBottom: '8px' }}>
            Set ({values.length} values)
          </div>
          <div style={{ paddingLeft: '12px' }}>
            {values.slice(0, 10).map((v: unknown, idx: number) => (
              <div key={idx} style={{ marginBottom: '4px' }}>
                {formatValueInline(v)}
              </div>
            ))}
            {values.length > 10 && (
              <div style={{ color: colors.textMuted, fontStyle: 'italic' }}>
                ... and {values.length - 10} more
              </div>
            )}
          </div>
        </div>
      );
    }

    // Regular object
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span style={{ color: colors.textSecondary }}>{'{}'}</span>;
    }
    return (
      <div>
        <div style={{ color: colors.textSecondary, marginBottom: '8px' }}>
          Object ({entries.length} properties)
        </div>
        <div style={{ paddingLeft: '12px' }}>
          {entries.slice(0, 10).map(([k, v], idx) => (
            <div key={idx} style={{ marginBottom: '4px' }}>
              <span style={{ color: colors.textSecondary }}>{k}</span>:{' '}
              {formatValueInline(v)}
            </div>
          ))}
          {entries.length > 10 && (
            <div style={{ color: colors.textMuted, fontStyle: 'italic' }}>
              ... and {entries.length - 10} more
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback
  return <span style={{ color: colors.textMuted }}>{String(value)}</span>;
}

/**
 * Format value inline (single line, truncated).
 */
function formatValueInline(value: unknown): React.ReactNode {
  if (value === null) return <span style={{ color: colors.textMuted }}>null</span>;
  if (value === undefined) return <span style={{ color: colors.textMuted }}>undefined</span>;
  if (typeof value === 'string') {
    if (value === '[Circular]') return <span style={{ color: colors.warning }}>↻ Circular</span>;
    if (value === '[Function]') return <span style={{ color: colors.textSecondary }}>ƒ Function</span>;
    const truncated = value.length > 50 ? value.slice(0, 47) + '...' : value;
    return <span style={{ color: colors.primary }}>{`"${truncated}"`}</span>;
  }
  if (typeof value === 'number') return <span style={{ color: '#c586c0' }}>{value}</span>;
  if (typeof value === 'boolean') return <span style={{ color: '#569cd6' }}>{String(value)}</span>;
  if (Array.isArray(value)) {
    return <span style={{ color: colors.textSecondary }}>[{value.length}]</span>;
  }
  if (typeof value === 'object') {
    if ('__type' in value) {
      const typed = value as { __type: string };
      if (typed.__type === 'Map') {
        const count = Object.keys((value as any).entries || {}).length;
        return <span style={{ color: colors.textSecondary }}>Map({count})</span>;
      }
      if (typed.__type === 'Set') {
        const count = ((value as any).values || []).length;
        return <span style={{ color: colors.textSecondary }}>Set({count})</span>;
      }
    }
    const count = Object.keys(value).length;
    return <span style={{ color: colors.textSecondary }}>{`{${count}}`}</span>;
  }
  return <span style={{ color: colors.textMuted }}>{String(value)}</span>;
}
