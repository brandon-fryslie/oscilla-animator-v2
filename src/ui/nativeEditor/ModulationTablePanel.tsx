/**
 * src/ui/nativeEditor/ModulationTablePanel.tsx
 *
 * The Modulation Table: a spreadsheet-style projection of all patch routing. Rows
 * are input ports, columns are output ports, and each cell is the connection at
 * that crossing. Clicking a cell connects, disconnects, or retargets — mutating
 * the SAME `PillarPatchStore` the graph canvas edits, so the two views stay in
 * lockstep by construction (one patch, two views).
 *
 * [LAW:one-way-deps] Reads/writes `PillarPatchStore` through the pure model in
 *   `modulationTable.ts`; it touches no renderer and no Three object.
 * [LAW:effects-at-boundaries] The grid and per-cell action are computed purely;
 *   this component only performs the resolved action against the store.
 * [LAW:dataflow-not-control-flow] Each cell renders from its (edge, connectable)
 *   value through one presentation map — no per-block-type branching.
 */

import React from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../../stores';
import type { PillarPatchStore } from '../../stores/PillarPatchStore';
import {
  buildModulationTable,
  cellAction,
  type ModulationAction,
  type ModulationCell,
  type ModulationPortRef,
} from './modulationTable';

const styles = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#0f0f17',
    color: '#e6e6ef',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 12,
    overflow: 'auto',
  },
  intro: { padding: '10px 12px', color: '#8a8aa0', fontSize: 11, borderBottom: '1px solid #2a2a38' },
  empty: { padding: 20, color: '#6f6f88' },
  table: { borderCollapse: 'collapse', margin: 12 },
  corner: {
    padding: '6px 10px',
    textAlign: 'left',
    color: '#6f6f88',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    position: 'sticky',
    left: 0,
    background: '#0f0f17',
  },
  colHead: {
    padding: '6px 10px',
    textAlign: 'center',
    color: '#d7caff',
    borderBottom: '1px solid #2a2a38',
    whiteSpace: 'nowrap',
  },
  colPort: { color: '#7a7a95', fontWeight: 400, fontSize: 10 },
  rowHead: {
    padding: '6px 10px',
    textAlign: 'right',
    color: '#b7b7c8',
    borderRight: '1px solid #2a2a38',
    whiteSpace: 'nowrap',
    position: 'sticky',
    left: 0,
    background: '#0f0f17',
  },
  rowPort: { color: '#7a7a95', fontSize: 10 },
  cell: {
    width: 36,
    height: 30,
    textAlign: 'center',
    verticalAlign: 'middle',
    border: '1px solid #1c1c2a',
  },
  cellConnected: {
    cursor: 'pointer',
    color: '#6fcf97',
    background: '#16241c',
    fontSize: 15,
  },
  cellOpen: {
    cursor: 'pointer',
    color: '#4a4a60',
    background: 'transparent',
  },
  cellInert: {
    color: '#26263a',
    background: '#0c0c14',
    cursor: 'default',
  },
} as const;

/** Apply a resolved cell action to the store. The one effectful step. */
function applyAction(store: PillarPatchStore, action: ModulationAction): void {
  switch (action.kind) {
    case 'connect':
      store.addEdge(action.source, action.target, action.inputSlot);
      return;
    case 'disconnect':
      store.removeEdge(action.edgeId);
      return;
  }
}

export const ModulationTablePanel: React.FC = observer(() => {
  const { pillarPatch } = useStores();
  const model = buildModulationTable(pillarPatch.patch, pillarPatch.registry);

  if (model.rows.length === 0 || model.columns.length === 0) {
    return (
      <div style={styles.panel as React.CSSProperties} data-testid="modulation-table">
        <div style={styles.empty as React.CSSProperties}>
          No routable ports yet — add blocks with inputs and outputs to see the modulation grid.
        </div>
      </div>
    );
  }

  return (
    <div style={styles.panel as React.CSSProperties} data-testid="modulation-table">
      <div style={styles.intro as React.CSSProperties}>
        Rows are inputs, columns are outputs. Click a cell to connect, disconnect, or retarget.
      </div>
      <table style={styles.table as React.CSSProperties}>
        <thead>
          <tr>
            <th style={styles.corner as React.CSSProperties}>input \ output</th>
            {model.columns.map((column) => (
              <th key={`${column.blockId}:${column.portId}`} style={styles.colHead as React.CSSProperties}>
                {column.blockLabel}
                <div style={styles.colPort as React.CSSProperties}>{column.portLabel}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, rowIndex) => (
            <tr key={`${row.blockId}:${row.portId}`}>
              <th style={styles.rowHead as React.CSSProperties}>
                {row.blockLabel}
                <div style={styles.rowPort as React.CSSProperties}>◄ {row.portLabel}</div>
              </th>
              {model.columns.map((column, colIndex) => (
                <CellView
                  key={`${column.blockId}:${column.portId}`}
                  cell={model.cells[rowIndex][colIndex]}
                  row={row}
                  column={column}
                  store={pillarPatch}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

const CellView: React.FC<{
  cell: ModulationCell;
  row: ModulationPortRef;
  column: ModulationPortRef;
  store: PillarPatchStore;
}> = ({ cell, row, column, store }) => {
  const action = cellAction(cell, row, column);
  const connected = cell.edge !== null;
  const stateStyle = connected
    ? styles.cellConnected
    : action !== null
      ? styles.cellOpen
      : styles.cellInert;
  const glyph = connected ? '●' : action !== null ? '+' : '';

  return (
    <td
      style={{ ...styles.cell, ...stateStyle } as React.CSSProperties}
      data-testid={`mod-cell-${row.blockId}:${row.portId}--${column.blockId}`}
      data-connected={connected}
      title={
        connected
          ? `${column.blockLabel} → ${row.blockLabel}.${row.portLabel} (click to disconnect)`
          : action !== null
            ? `Connect ${column.blockLabel} → ${row.blockLabel}.${row.portLabel}`
            : 'Incompatible'
      }
      onClick={action === null ? undefined : () => applyAction(store, action)}
    >
      {glyph}
    </td>
  );
};
