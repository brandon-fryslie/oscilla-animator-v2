/**
 * Domains Panel Component (React)
 *
 * View domain definitions in the patch.
 * For now, extracts domains from DomainN/GridDomain blocks.
 */

import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../stores';
import { colors } from '../theme';

/**
 * Domain information extracted from blocks.
 */
interface DomainInfo {
  readonly blockId: string;
  readonly kind: 'n' | 'grid';
  readonly n?: number;  // For DomainN
  readonly rows?: number;  // For GridDomain
  readonly cols?: number;  // For GridDomain
  readonly seed?: number;
  readonly usedByCount: number;
}

/**
 * Domains Panel component.
 */
export const DomainsPanel = observer(function DomainsPanel() {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const patch = rootStore.patch.patch;

  // Extract domain information from patch
  const extractDomains = (): DomainInfo[] => {
    if (!patch) return [];

    const domains: DomainInfo[] = [];

    for (const block of patch.blocks.values()) {
      if (block.type === 'DomainN') {
        // Count blocks using this domain's output
        const usedByCount = patch.edges.filter(e =>
          e.from.blockId === block.id && e.from.slotId === 'domain'
        ).length;

        domains.push({
          blockId: block.id,
          kind: 'n',
          n: typeof block.params.n === 'number' ? block.params.n : undefined,
          seed: typeof block.params.seed === 'number' ? block.params.seed : undefined,
          usedByCount,
        });
      } else if (block.type === 'GridDomain') {
        const usedByCount = patch.edges.filter(e =>
          e.from.blockId === block.id && e.from.slotId === 'domain'
        ).length;

        domains.push({
          blockId: block.id,
          kind: 'grid',
          rows: typeof block.params.rows === 'number' ? block.params.rows : undefined,
          cols: typeof block.params.cols === 'number' ? block.params.cols : undefined,
          seed: typeof block.params.seed === 'number' ? block.params.seed : undefined,
          usedByCount,
        });
      }
    }

    return domains;
  };

  const toggleExpanded = (blockId: string) => {
    setExpandedDomains(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  const domains = extractDomains();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: colors.bgContent,
    }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1rem',
        borderBottom: `1px solid ${colors.border}`,
        background: colors.bgPanel,
        flexShrink: 0,
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '0.875rem',
          fontWeight: '600',
          color: colors.textPrimary,
        }}>
          Domains
        </h3>
      </div>

      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '0.75rem',
      }}>
        {!patch ? (
          <div style={{
            color: colors.textMuted,
            textAlign: 'center',
            marginTop: '2rem',
            fontSize: '0.8125rem',
          }}>
            No patch loaded
          </div>
        ) : domains.length === 0 ? (
          <div style={{
            color: colors.textMuted,
            textAlign: 'center',
            marginTop: '2rem',
            fontSize: '0.8125rem',
          }}>
            No domains defined
          </div>
        ) : (
          domains.map(domain => (
            <DomainCard
              key={domain.blockId}
              domain={domain}
              isExpanded={expandedDomains.has(domain.blockId)}
              onToggle={() => toggleExpanded(domain.blockId)}
            />
          ))
        )}
      </div>
    </div>
  );
});

/**
 * Domain card component.
 */
interface DomainCardProps {
  domain: DomainInfo;
  isExpanded: boolean;
  onToggle: () => void;
}

const DomainCard: React.FC<DomainCardProps> = ({ domain, isExpanded, onToggle }) => {
  return (
    <div style={{
      background: colors.bgPanel,
      border: `1px solid ${colors.border}`,
      borderRadius: '6px',
      padding: '0.75rem',
      marginBottom: '0.75rem',
    }}>
      {/* Header row */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '0.5rem',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{
          marginRight: '0.5rem',
          color: colors.textMuted,
          fontFamily: 'monospace',
          fontSize: '0.875rem',
        }}>
          {isExpanded ? '▼' : '▸'}
        </span>

        <span style={{
          fontSize: '0.875rem',
          fontWeight: '600',
          color: colors.primary,
          fontFamily: "'Courier New', monospace",
          flex: 1,
        }}>
          {domain.blockId}
        </span>
      </div>

      {/* Summary row */}
      <div style={{
        fontSize: '0.75rem',
        color: colors.textSecondary,
        marginBottom: '0.5rem',
      }}>
        {domain.kind === 'n'
          ? `N Elements: ${domain.n ?? '?'}`
          : `Grid: ${domain.rows ?? '?'} × ${domain.cols ?? '?'}`
        }
      </div>

      {/* Used by count */}
      <div style={{
        fontSize: '0.7rem',
        color: colors.textMuted,
      }}>
        Used by: {domain.usedByCount} blocks
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div style={{
          marginTop: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: `1px solid ${colors.border}`,
          fontSize: '0.75rem',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: '0.5rem',
          }}>
            <DetailRow label="Kind" value={domain.kind === 'n' ? 'N Elements' : 'Grid 2D'} />
            {domain.n !== undefined && <DetailRow label="Count" value={domain.n.toString()} />}
            {domain.rows !== undefined && <DetailRow label="Rows" value={domain.rows.toString()} />}
            {domain.cols !== undefined && <DetailRow label="Cols" value={domain.cols.toString()} />}
            {domain.seed !== undefined && <DetailRow label="Seed" value={domain.seed.toString()} />}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Detail row component.
 */
interface DetailRowProps {
  label: string;
  value: string;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value }) => {
  return (
    <>
      <div style={{
        color: colors.textSecondary,
        fontWeight: '500',
      }}>
        {label}
      </div>
      <div style={{
        color: colors.textPrimary,
        fontFamily: "'Courier New', monospace",
      }}>
        {value}
      </div>
    </>
  );
};
