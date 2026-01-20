/**
 * Connection Matrix Component
 *
 * Displays a blocks × blocks adjacency matrix showing which blocks connect to which.
 * Rows = source blocks, Columns = target blocks.
 * Cells show connection status with counts for multiple edges.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { rootStore } from '../../stores';
import type { Patch, Block, Edge } from '../../graph/Patch';
import type { BlockId } from '../../types';
import { colors } from '../theme';

interface MatrixRow {
  id: string;
  blockId: BlockId;
  displayName: string;
  isHeader?: boolean;
  isBus?: boolean;
  [key: string]: any; // Dynamic columns for each target block
}

/**
 * Find edges between two blocks.
 */
function findEdges(sourceId: BlockId, targetId: BlockId, edges: readonly Edge[]): readonly Edge[] {
  return edges.filter(e =>
    e.from.blockId === sourceId && e.to.blockId === targetId
  );
}

/**
 * Get display name for a block.
 */
function getBlockDisplayName(block: Block): string {
  return block.displayName || block.label || block.id;
}

/**
 * Filter and categorize blocks for the matrix.
 */
function categorizeBlocks(patch: Patch) {
  const allBlocks = Array.from(patch.blocks.values());

  // Filter out timeRoot blocks
  const visibleBlocks = allBlocks.filter(b => b.role.kind !== 'timeRoot');

  // Separate regular blocks from buses
  const regularBlocks = visibleBlocks.filter(b => b.role.kind !== 'bus');
  const busBlocks = visibleBlocks.filter(b => b.role.kind === 'bus');

  return { regularBlocks, busBlocks, allVisible: visibleBlocks };
}

/**
 * ConnectionMatrix component.
 */
export const ConnectionMatrix = observer(function ConnectionMatrix() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hasHeight, setHasHeight] = useState(false);
  const patch = rootStore.patch.patch;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      const height = container.getBoundingClientRect().height;
      setHasHeight(height > 0);
    };

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);
    updateHeight();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const { rows, columns } = useMemo(() => {
    if (!patch) {
      return { rows: [], columns: [] };
    }

    const { regularBlocks, busBlocks, allVisible } = categorizeBlocks(patch);

    // Build columns: one for the row header + one for each visible block
    const cols: GridColDef[] = [
      {
        field: 'displayName',
        headerName: '',
        width: 150,
        sortable: false,
        renderCell: (params: GridRenderCellParams) => {
          if (params.row.isHeader) {
            // Section header (BUSES)
            return (
              <div style={{
                fontWeight: 700,
                color: colors.textSecondary,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                {params.value}
              </div>
            );
          }

          // Regular row header - clickable block name
          return (
            <div
              style={{
                fontFamily: 'Courier New, monospace',
                color: colors.primary,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
              onClick={() => {
                if (params.row.blockId) {
                  rootStore.selection.selectBlock(params.row.blockId);
                }
              }}
            >
              {params.value}
            </div>
          );
        },
      },
    ];

    // Add a column for each visible block (targets)
    for (const block of allVisible) {
      const blockName = getBlockDisplayName(block);
      cols.push({
        field: block.id,
        headerName: blockName,
        width: 100,
        sortable: false,
        align: 'center',
        headerAlign: 'center',
        renderCell: (params: GridRenderCellParams) => {
          if (params.row.isHeader) {
            // No content for section headers
            return null;
          }

          const sourceId = params.row.blockId as BlockId;
          const targetId = block.id;

          // Self-reference shows =
          if (sourceId === targetId) {
            return (
              <div style={{ color: colors.textMuted }}>
                =
              </div>
            );
          }

          const edges = findEdges(sourceId, targetId, patch.edges);
          const count = edges.length;

          if (count === 0) {
            return null;
          }

          if (count === 1) {
            return (
              <div
                style={{
                  color: '#22c55e', // Green for connections
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                }}
                onClick={() => {
                  // Select the single edge
                  rootStore.selection.selectEdge(edges[0].id);
                }}
              >
                ●
              </div>
            );
          }

          // Multiple edges: show count
          // Currently select the first edge (could be enhanced to select all edges)
          return (
            <div
              style={{
                color: '#22c55e',
                cursor: 'pointer',
              }}
              onClick={() => {
                // Select the first edge (TODO: support multi-edge selection)
                rootStore.selection.selectEdge(edges[0].id);
              }}
            >
              ●{count}
            </div>
          );
        },
      });
    }

    // Build rows: one row per visible block
    const matrixRows: MatrixRow[] = [];

    // Regular blocks section
    for (const block of regularBlocks) {
      const row: MatrixRow = {
        id: block.id,
        blockId: block.id,
        displayName: getBlockDisplayName(block),
        isBus: false,
      };

      // Add connection data for each target block
      for (const target of allVisible) {
        row[target.id] = true; // Just a marker; actual rendering is in renderCell
      }

      matrixRows.push(row);
    }

    // Buses section (if any)
    if (busBlocks.length > 0) {
      // Add section header
      matrixRows.push({
        id: '__buses_header__',
        blockId: '' as BlockId,
        displayName: 'BUSES',
        isHeader: true,
      });

      for (const block of busBlocks) {
        const row: MatrixRow = {
          id: block.id,
          blockId: block.id,
          displayName: getBlockDisplayName(block),
          isBus: true,
        };

        for (const target of allVisible) {
          row[target.id] = true;
        }

        matrixRows.push(row);
      }
    }

    return { rows: matrixRows, columns: cols };
  }, [patch]);

  if (!patch) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        color: colors.textMuted
      }}>
        No patch loaded
      </div>
    );
  }

  return (
      <div
        ref={containerRef}
        style={{
        height: '100%',
        width: '100%',
        background: colors.bgContent,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        }}
      >
        {hasHeight ? (
          <DataGrid
            rows={rows}
            columns={columns}
            hideFooter
            disableColumnMenu
            disableRowSelectionOnClick
            rowHeight={32}
            columnHeaderHeight={40}
            sx={{
              border: 'none',
              flex: 1,
              minHeight: 0,
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: colors.bgPanel,
                borderBottom: `1px solid ${colors.border}`,
                fontSize: '0.75rem',
                fontWeight: 600,
                color: colors.textSecondary,
              },
              '& .MuiDataGrid-columnHeader': {
                padding: '0 8px',
              },
              '& .MuiDataGrid-columnHeaderTitle': {
                fontWeight: 600,
                overflow: 'visible',
                textOverflow: 'clip',
                whiteSpace: 'nowrap',
              },
              '& .MuiDataGrid-cell': {
                borderBottom: `1px solid ${colors.border}`,
                padding: '0 8px',
              },
              '& .MuiDataGrid-row': {
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                },
              },
              '& .MuiDataGrid-virtualScroller': {
                backgroundColor: colors.bgContent,
              },
            }}
          />
        ) : null}
      </div>
  );
});
