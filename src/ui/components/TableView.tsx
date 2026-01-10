/**
 * Table View Component (React)
 *
 * Matrix showing all blocks and their connections.
 * Primary patch visualization component for center panel.
 */

import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../stores';
import { colors } from '../theme';
import type { Block } from '../../graph/Patch';
import type { BlockId } from '../../types';

/**
 * Connection information for display.
 */
interface ConnectionInfo {
  readonly targetBlockId: BlockId;
  readonly targetPort: string;
  readonly sourcePort: string;
}

/**
 * Block row data for table display.
 */
interface BlockRowData {
  readonly block: Block;
  readonly inputCount: number;
  readonly outputCount: number;
  readonly connections: ConnectionInfo[];
  readonly domainId?: string;
}

/**
 * Table View component.
 */
export const TableView = observer(function TableView() {
  const [expandedBlocks, setExpandedBlocks] = useState<Set<BlockId>>(new Set());
  const patch = rootStore.patch.immutablePatch;
  const selectedBlockId = rootStore.selection.selectedBlockId;

  const toggleExpanded = (blockId: BlockId) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  const handleRowClick = (blockId: BlockId) => {
    rootStore.selection.selectBlock(blockId);
  };

  const handleConnectionClick = (blockId: BlockId) => {
    rootStore.selection.selectBlock(blockId);
  };

  // Analyze blocks
  const analyzeBlocks = (): BlockRowData[] => {
    if (!patch) return [];

    const blockData: BlockRowData[] = [];

    for (const block of patch.blocks.values()) {
      const incomingEdges = patch.edges.filter(e => e.to.blockId === block.id);
      const outgoingEdges = patch.edges.filter(e => e.from.blockId === block.id);

      const connections: ConnectionInfo[] = outgoingEdges.map(e => ({
        targetBlockId: e.to.blockId as BlockId,
        targetPort: e.to.slotId,
        sourcePort: e.from.slotId,
      }));

      blockData.push({
        block,
        inputCount: incomingEdges.length,
        outputCount: outgoingEdges.length,
        connections,
        domainId: undefined, // TODO: Extract from params if needed
      });
    }

    return blockData;
  };

  const blockData = analyzeBlocks();

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
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexShrink: 0,
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '0.875rem',
          fontWeight: '600',
          color: colors.textPrimary,
          flex: 1,
        }}>
          Blocks
        </h3>

        <input
          type="text"
          placeholder="Search blocks..."
          disabled
          style={{
            padding: '0.25rem 0.5rem',
            background: colors.bgContent,
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            color: colors.textPrimary,
            fontSize: '0.75rem',
            width: '200px',
          }}
        />
      </div>

      {/* Scrollable table container */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '0.5rem',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.8125rem',
          color: colors.textPrimary,
        }}>
          <thead>
            <tr>
              <th style={headerCellStyle}>Block</th>
              <th style={headerCellStyle}>Type</th>
              <th style={headerCellStyle}>Domain</th>
              <th style={{ ...headerCellStyle, textAlign: 'center' }}>Inputs</th>
              <th style={{ ...headerCellStyle, textAlign: 'center' }}>Outputs</th>
            </tr>
          </thead>
          <tbody>
            {blockData.map(data => (
              <React.Fragment key={data.block.id}>
                <BlockRow
                  data={data}
                  isExpanded={expandedBlocks.has(data.block.id)}
                  isSelected={selectedBlockId === data.block.id}
                  onToggle={() => toggleExpanded(data.block.id)}
                  onClick={() => handleRowClick(data.block.id)}
                />
                {expandedBlocks.has(data.block.id) && (
                  <ExpandedRow
                    data={data}
                    onConnectionClick={handleConnectionClick}
                  />
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const headerCellStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem',
  background: colors.bgPanel,
  borderBottom: `1px solid ${colors.border}`,
  fontWeight: 600,
  color: colors.textSecondary,
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

/**
 * Block row component.
 */
interface BlockRowProps {
  data: BlockRowData;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
}

const BlockRow: React.FC<BlockRowProps> = ({
  data,
  isExpanded,
  isSelected,
  onToggle,
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const rowStyle: React.CSSProperties = {
    cursor: 'pointer',
    transition: 'background 0.1s',
    background: isSelected
      ? `${colors.primary}22`
      : isHovered
      ? 'rgba(255, 255, 255, 0.03)'
      : 'transparent',
  };

  return (
    <tr
      style={rowStyle}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <td style={cellStyle}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            style={{
              cursor: 'pointer',
              userSelect: 'none',
              color: colors.textMuted,
              fontFamily: 'monospace',
              fontSize: '1rem',
              width: '20px',
              display: 'inline-block',
              textAlign: 'center',
              marginRight: '0.5rem',
            }}
          >
            {isExpanded ? '▼' : '▸'}
          </span>
          <span style={{
            fontFamily: "'Courier New', monospace",
            color: colors.primary,
          }}>
            {data.block.label || data.block.id}
          </span>
        </div>
      </td>
      <td style={cellStyle}>
        <span style={{ color: colors.textSecondary }}>
          {data.block.type}
        </span>
      </td>
      <td style={cellStyle}>
        {data.domainId ? (
          <span style={{
            fontFamily: "'Courier New', monospace",
            color: colors.primary,
            fontSize: '0.75rem',
          }}>
            {data.domainId}
          </span>
        ) : (
          <span style={{ color: colors.textMuted }}>-</span>
        )}
      </td>
      <td style={{ ...cellStyle, textAlign: 'center' }}>
        <span style={{ color: colors.textMuted }}>
          {data.inputCount}
        </span>
      </td>
      <td style={{ ...cellStyle, textAlign: 'center' }}>
        <span style={{ color: colors.textMuted }}>
          {data.outputCount} ({data.connections.length})
        </span>
      </td>
    </tr>
  );
};

const cellStyle: React.CSSProperties = {
  padding: '0.5rem',
  borderBottom: `1px solid ${colors.border}`,
};

/**
 * Expanded row showing ports and connections.
 */
interface ExpandedRowProps {
  data: BlockRowData;
  onConnectionClick: (blockId: BlockId) => void;
}

const ExpandedRow: React.FC<ExpandedRowProps> = observer(({ data, onConnectionClick }) => {
  const patch = rootStore.patch.immutablePatch;

  if (!patch) return null;

  const incomingEdges = patch.edges.filter(e => e.to.blockId === data.block.id);
  const connectionsByPort = new Map<string, ConnectionInfo[]>();
  for (const conn of data.connections) {
    if (!connectionsByPort.has(conn.sourcePort)) {
      connectionsByPort.set(conn.sourcePort, []);
    }
    connectionsByPort.get(conn.sourcePort)!.push(conn);
  }

  return (
    <tr>
      <td colSpan={5} style={{ padding: 0 }}>
        <div style={{
          background: colors.bgPanel,
          padding: '0.5rem 1rem',
          fontSize: '0.75rem',
        }}>
          {/* Inputs section */}
          {data.inputCount > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{
                fontWeight: 600,
                marginBottom: '0.5rem',
                color: colors.textSecondary,
                fontSize: '0.7rem',
              }}>
                INPUTS
              </div>

              {incomingEdges.map((edge, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.25rem 0',
                    color: colors.textSecondary,
                  }}
                >
                  <span style={{
                    fontFamily: "'Courier New', monospace",
                    color: colors.primary,
                    minWidth: '100px',
                  }}>
                    ← {edge.to.slotId}
                  </span>
                  <span
                    onClick={() => onConnectionClick(edge.from.blockId as BlockId)}
                    style={{
                      color: colors.primary,
                      fontFamily: "'Courier New', monospace",
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    {edge.from.blockId}.{edge.from.slotId}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Outputs section */}
          {data.outputCount > 0 && (
            <div>
              <div style={{
                fontWeight: 600,
                marginTop: '0.75rem',
                marginBottom: '0.5rem',
                color: colors.textSecondary,
                fontSize: '0.7rem',
              }}>
                OUTPUTS
              </div>

              {Array.from(connectionsByPort.entries()).map(([port, conns]) => (
                <div key={port} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.25rem 0',
                  color: colors.textSecondary,
                }}>
                  <span style={{
                    fontFamily: "'Courier New', monospace",
                    color: colors.primary,
                    minWidth: '100px',
                  }}>
                    {port} →
                  </span>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}>
                    {conns.map((conn, idx) => (
                      <span
                        key={idx}
                        onClick={() => onConnectionClick(conn.targetBlockId)}
                        style={{
                          color: colors.primary,
                          fontFamily: "'Courier New', monospace",
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        {conn.targetBlockId}.{conn.targetPort}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
});
