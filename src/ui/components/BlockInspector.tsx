/**
 * Block Inspector Component (React)
 *
 * Detailed view of selected block OR block type preview.
 * Shows ports, connections, and parameters.
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../stores';
import { colors } from '../theme';
import { getBlockTypeInfo } from '../registry/blockTypes';
import type { Block } from '../../graph/Patch';
import type { BlockId } from '../../types';

/**
 * Block Inspector component.
 */
export const BlockInspector = observer(function BlockInspector() {
  const { previewType, selectedBlockId } = rootStore.selection;
  const patch = rootStore.patch.immutablePatch;

  // Preview mode takes precedence
  if (previewType) {
    return <TypePreview type={previewType} />;
  }

  // Block selection mode
  if (!selectedBlockId || !patch) {
    return <NoSelection />;
  }

  const block = patch.blocks.get(selectedBlockId);
  if (!block) {
    return <BlockNotFound blockId={selectedBlockId} />;
  }

  return <BlockDetails block={block} />;
});

/**
 * No selection state.
 */
const NoSelection: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'auto',
      padding: '1rem',
      background: colors.bgContent,
      color: colors.textPrimary,
      fontSize: '0.8125rem',
    }}>
      <div style={{
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: '2rem',
      }}>
        No block selected
      </div>
    </div>
  );
};

/**
 * Block not found error.
 */
interface BlockNotFoundProps {
  blockId: BlockId;
}

const BlockNotFound: React.FC<BlockNotFoundProps> = ({ blockId }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'auto',
      padding: '1rem',
      background: colors.bgContent,
      color: colors.textPrimary,
      fontSize: '0.8125rem',
    }}>
      <div style={{
        color: colors.secondary,
        textAlign: 'center',
        marginTop: '2rem',
      }}>
        Block not found: {blockId}
      </div>
    </div>
  );
};

/**
 * Type preview mode.
 */
interface TypePreviewProps {
  type: string;
}

const TypePreview: React.FC<TypePreviewProps> = ({ type }) => {
  const typeInfo = getBlockTypeInfo(type);

  if (!typeInfo) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'auto',
        padding: '1rem',
        background: colors.bgContent,
        color: colors.textPrimary,
        fontSize: '0.8125rem',
      }}>
        <div style={{
          color: colors.secondary,
          textAlign: 'center',
          marginTop: '2rem',
        }}>
          Unknown type: {type}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'auto',
      padding: '1rem',
      background: colors.bgContent,
      color: colors.textPrimary,
      fontSize: '0.8125rem',
    }}>
      {/* Header */}
      <div style={{
        marginBottom: '1rem',
        paddingBottom: '0.75rem',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <div style={{
          fontSize: '0.7rem',
          fontWeight: '600',
          color: colors.secondary,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '0.5rem',
        }}>
          [TYPE PREVIEW]
        </div>

        <div style={{
          fontSize: '1.125rem',
          fontWeight: '600',
          color: colors.primary,
          marginBottom: '0.25rem',
        }}>
          {typeInfo.label}
        </div>

        <div style={{
          fontSize: '0.75rem',
          fontFamily: "'Courier New', monospace",
          color: colors.textSecondary,
          marginBottom: '0.5rem',
        }}>
          {typeInfo.type}
        </div>

        <div style={{
          fontSize: '0.75rem',
          color: colors.textSecondary,
          lineHeight: '1.5',
        }}>
          {typeInfo.description}
        </div>

        <div style={{
          fontSize: '0.7rem',
          color: colors.textMuted,
          marginTop: '0.5rem',
        }}>
          Category: {typeInfo.category}
        </div>
      </div>

      {/* Inputs */}
      {typeInfo.inputs.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            fontSize: '0.7rem',
            fontWeight: '600',
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '0.75rem',
          }}>
            INPUTS
          </div>

          {typeInfo.inputs.map(port => (
            <div key={port.id} style={{
              marginBottom: '0.75rem',
              paddingBottom: '0.75rem',
              borderBottom: `1px solid ${colors.border}`,
            }}>
              <div style={{
                fontFamily: "'Courier New', monospace",
                color: colors.primary,
                marginBottom: '0.25rem',
              }}>
                {port.id}
              </div>
              <div style={{
                fontSize: '0.7rem',
                color: colors.textMuted,
              }}>
                {port.typeStr}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Outputs */}
      {typeInfo.outputs.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            fontSize: '0.7rem',
            fontWeight: '600',
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '0.75rem',
          }}>
            OUTPUTS
          </div>

          {typeInfo.outputs.map(port => (
            <div key={port.id} style={{
              marginBottom: '0.75rem',
              paddingBottom: '0.75rem',
              borderBottom: `1px solid ${colors.border}`,
            }}>
              <div style={{
                fontFamily: "'Courier New', monospace",
                color: colors.primary,
                marginBottom: '0.25rem',
              }}>
                {port.id}
              </div>
              <div style={{
                fontSize: '0.7rem',
                color: colors.textMuted,
              }}>
                {port.typeStr}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Block details view.
 */
interface BlockDetailsProps {
  block: Block;
}

const BlockDetails: React.FC<BlockDetailsProps> = observer(({ block }) => {
  const patch = rootStore.patch.immutablePatch;

  if (!patch) return null;

  // Analyze ports and connections
  const incomingEdges = patch.edges.filter(e => e.to.blockId === block.id);
  const outgoingEdges = patch.edges.filter(e => e.from.blockId === block.id);

  // Group incoming edges by port
  const inputPorts = new Map<string, string[]>();
  for (const edge of incomingEdges) {
    const portId = edge.to.slotId;
    if (!inputPorts.has(portId)) {
      inputPorts.set(portId, []);
    }
    inputPorts.get(portId)!.push(`${edge.from.blockId}.${edge.from.slotId}`);
  }

  // Group outgoing edges by port
  const outputPorts = new Map<string, string[]>();
  for (const edge of outgoingEdges) {
    const portId = edge.from.slotId;
    if (!outputPorts.has(portId)) {
      outputPorts.set(portId, []);
    }
    outputPorts.get(portId)!.push(`${edge.to.blockId}.${edge.to.slotId}`);
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'auto',
      padding: '1rem',
      background: colors.bgContent,
      color: colors.textPrimary,
      fontSize: '0.8125rem',
    }}>
      {/* Header: Block ID */}
      <div style={{
        marginBottom: '1rem',
        paddingBottom: '0.75rem',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <div style={{
          fontSize: '1.125rem',
          fontWeight: '600',
          color: colors.primary,
          fontFamily: "'Courier New', monospace",
          marginBottom: '0.25rem',
        }}>
          {block.label || block.id}
        </div>

        <div style={{
          fontSize: '0.875rem',
          color: colors.textSecondary,
        }}>
          {block.type}
        </div>
      </div>

      {/* Inputs section */}
      {inputPorts.size > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            fontSize: '0.7rem',
            fontWeight: '600',
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '0.75rem',
          }}>
            INPUTS
          </div>

          {Array.from(inputPorts.entries()).map(([portId, connections]) => (
            <div key={portId} style={{
              marginBottom: '0.75rem',
              paddingBottom: '0.75rem',
              borderBottom: `1px solid ${colors.border}`,
            }}>
              <div style={{
                fontFamily: "'Courier New', monospace",
                color: colors.primary,
                marginBottom: '0.5rem',
              }}>
                {portId}
              </div>

              <div style={{
                fontSize: '0.7rem',
                color: colors.textMuted,
                marginBottom: '0.25rem',
              }}>
                From:
              </div>

              {connections.map(conn => (
                <div
                  key={conn}
                  onClick={() => {
                    const [blockId] = conn.split('.');
                    rootStore.selection.selectBlock(blockId as BlockId);
                  }}
                  style={{
                    fontSize: '0.75rem',
                    color: colors.primary,
                    fontFamily: "'Courier New', monospace",
                    cursor: 'pointer',
                    marginLeft: '0.5rem',
                    marginBottom: '0.25rem',
                    textDecoration: 'underline',
                  }}
                >
                  • {conn}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Outputs section */}
      {outputPorts.size > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            fontSize: '0.7rem',
            fontWeight: '600',
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '0.75rem',
          }}>
            OUTPUTS
          </div>

          {Array.from(outputPorts.entries()).map(([portId, connections]) => (
            <div key={portId} style={{
              marginBottom: '0.75rem',
              paddingBottom: '0.75rem',
              borderBottom: `1px solid ${colors.border}`,
            }}>
              <div style={{
                fontFamily: "'Courier New', monospace",
                color: colors.primary,
                marginBottom: '0.5rem',
              }}>
                {portId}
              </div>

              {connections.length > 0 ? (
                <>
                  <div style={{
                    fontSize: '0.7rem',
                    color: colors.textMuted,
                    marginBottom: '0.25rem',
                  }}>
                    To:
                  </div>

                  {connections.map(conn => (
                    <div
                      key={conn}
                      onClick={() => {
                        const [blockId] = conn.split('.');
                        rootStore.selection.selectBlock(blockId as BlockId);
                      }}
                      style={{
                        fontSize: '0.75rem',
                        color: colors.primary,
                        fontFamily: "'Courier New', monospace",
                        cursor: 'pointer',
                        marginLeft: '0.5rem',
                        marginBottom: '0.25rem',
                        textDecoration: 'underline',
                      }}
                    >
                      • {conn}
                    </div>
                  ))}
                </>
              ) : (
                <div style={{
                  fontSize: '0.7rem',
                  color: colors.textMuted,
                  fontStyle: 'italic',
                }}>
                  (not connected)
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Parameters section */}
      {Object.keys(block.params).length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            fontSize: '0.7rem',
            fontWeight: '600',
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '0.75rem',
          }}>
            PARAMETERS
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: '0.5rem',
            fontSize: '0.75rem',
          }}>
            {Object.entries(block.params).map(([key, value]) => (
              <React.Fragment key={key}>
                <div style={{
                  color: colors.textSecondary,
                  fontWeight: '500',
                }}>
                  {key}
                </div>
                <div style={{
                  color: colors.textPrimary,
                  fontFamily: "'Courier New', monospace",
                }}>
                  {formatParamValue(value)}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Format parameter value for display.
 */
function formatParamValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  } else if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toFixed(3);
  } else if (typeof value === 'boolean') {
    return value.toString();
  } else if (value === null || value === undefined) {
    return 'null';
  } else {
    return JSON.stringify(value);
  }
}
