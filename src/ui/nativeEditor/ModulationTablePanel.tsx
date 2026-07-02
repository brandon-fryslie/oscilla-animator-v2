/**
 * src/ui/nativeEditor/ModulationTablePanel.tsx
 *
 * The Modulation Table: a spreadsheet-style projection of all patch routing. Rows
 * are input ports, columns are output ports, and each cell is the ROUTE at that
 * crossing. Clicking a cell connects, disconnects, or retargets — mutating the SAME
 * `PillarPatchStore` the graph canvas edits, so the two views stay in lockstep by
 * construction (one patch, two views).
 *
 * A route may pass through transform blocks (Scale/Offset/Clamp). Those are
 * route-internal: they never appear as their own row or column. Instead an occupied
 * cell carries a compact chain editor (the `ƒ` affordance) that inserts, removes,
 * and retunes the transforms along the route — each edit is an ordinary graph
 * mutation on the store. The chain editor is a SEPARATE affordance from the primary
 * cell click, which stays connect/disconnect for the route itself.
 *
 * [LAW:one-way-deps] Reads/writes `PillarPatchStore` through the pure model in
 *   `modulationTable.ts`; it touches no renderer and no Three object.
 * [LAW:effects-at-boundaries] The grid, per-cell action, and per-edit action are
 *   computed purely; this component only performs the resolved action against the
 *   store.
 * [LAW:dataflow-not-control-flow] Each cell renders from its (route, connectable)
 *   value through one presentation map — no per-block-type branching.
 */

import React from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../../stores';
import type { PillarPatchStore } from '../../stores/PillarPatchStore';
import {
  appendTransformAction,
  buildModulationTable,
  cellAction,
  removeTransformAction,
  setTransformConfigAction,
  soleInputPortId,
  transformPalette,
  type ModulationAction,
  type ModulationCell,
  type ModulationPortRef,
  type ModulationRoute,
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
    position: 'relative',
    width: 40,
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
  // The `ƒ` chain-editor affordance in the corner of an occupied cell.
  fxBadge: {
    position: 'absolute',
    top: 1,
    right: 2,
    fontSize: 9,
    lineHeight: '10px',
    padding: '0 3px',
    borderRadius: 4,
    background: '#2a3a48',
    color: '#5bc0be',
    cursor: 'pointer',
    border: '1px solid #38505e',
  },
  fxBadgeActive: { background: '#5bc0be', color: '#0f0f17' },
  popover: {
    position: 'absolute',
    top: 30,
    right: 0,
    zIndex: 10,
    minWidth: 200,
    padding: 10,
    background: '#151521',
    border: '1px solid #38505e',
    borderRadius: 6,
    boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
    textAlign: 'left',
    cursor: 'default',
  },
  popTitle: { color: '#8a8aa0', fontSize: 10, marginBottom: 8 },
  chainItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 0',
    borderTop: '1px solid #23233400',
  },
  chainName: { color: '#5bc0be', fontSize: 11, minWidth: 46 },
  fieldLabel: { color: '#7a7a95', fontSize: 10 },
  numberInput: {
    width: 46,
    background: '#0c0c14',
    color: '#e6e6ef',
    border: '1px solid #2a2a38',
    borderRadius: 3,
    fontSize: 11,
    padding: '2px 4px',
  },
  removeBtn: {
    marginLeft: 'auto',
    color: '#c46',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
  },
  addRow: { display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  addBtn: {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    background: '#1c2a24',
    color: '#6fcf97',
    border: '1px solid #2a3a30',
    cursor: 'pointer',
  },
  disconnectBtn: {
    marginTop: 8,
    width: '100%',
    fontSize: 10,
    padding: '3px 6px',
    borderRadius: 4,
    background: '#2a1414',
    color: '#e08a8a',
    border: '1px solid #3a2020',
    cursor: 'pointer',
  },
} as const;

/**
 * Apply a resolved action to the store — the one effectful step. Each kind composes
 * the store's block/edge CRUD; the model decided *what*, this performs it.
 */
function applyAction(store: PillarPatchStore, action: ModulationAction): void {
  switch (action.kind) {
    case 'connect':
      // Tear down the route this connect replaces (its transforms + their edges)
      // before wiring the new source, so a retarget leaves no orphaned chain.
      for (const id of action.replacedTransformBlockIds) store.removeBlock(id);
      store.addEdge(action.source, action.target, action.inputSlot);
      return;
    case 'disconnect':
      // Remove the transform blocks (each cascades its edges) and the input edge.
      for (const id of action.transformBlockIds) store.removeBlock(id);
      store.removeEdge(action.inputEdgeId);
      return;
    case 'appendTransform': {
      // Resolve the precondition before any mutation: a null sole-input slot (an
      // impossible state defineScalarModifier prevents) must throw before addBlock,
      // never after — a failed precondition leaves the store untouched.
      // [LAW:effects-at-boundaries]
      const inSlot = soleInputPortId(store.registry, action.transformType);
      if (inSlot === null) {
        throw new Error(`[modulation-table] transform '${action.transformType}' has no sole input port`);
      }
      const newId = store.addBlock(action.transformType);
      store.addEdge(action.upstreamBlockId, newId, inSlot); // upstream → newTransform.in
      store.addEdge(newId, action.target, action.inputSlot); // newTransform.out → input (replaces feeder)
      return;
    }
    case 'removeTransform':
      // Bridge upstream → downstream (replaces the transform's downstream feeder),
      // then drop the transform block (cascades its now-dangling upstream edge).
      store.addEdge(action.upstreamBlockId, action.downstreamTarget, action.downstreamInputSlot);
      store.removeBlock(action.blockId);
      return;
    case 'setTransformConfig':
      store.updateConfig(action.blockId, action.key, action.value);
      return;
  }
}

/** Which cell's chain editor is open, by grid position. */
interface OpenEditor {
  readonly rowIndex: number;
  readonly colIndex: number;
}

export const ModulationTablePanel: React.FC = observer(() => {
  const { pillarPatch } = useStores();
  const model = buildModulationTable(pillarPatch.patch, pillarPatch.registry);
  const [openEditor, setOpenEditor] = React.useState<OpenEditor | null>(null);

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
        Rows are inputs, columns are outputs. Click a cell to connect or disconnect; use ƒ on a
        connected cell to insert scale / offset / clamp transforms along the route.
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
                  editorOpen={openEditor?.rowIndex === rowIndex && openEditor?.colIndex === colIndex}
                  onToggleEditor={() =>
                    setOpenEditor((cur) =>
                      cur?.rowIndex === rowIndex && cur?.colIndex === colIndex
                        ? null
                        : { rowIndex, colIndex },
                    )
                  }
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
  editorOpen: boolean;
  onToggleEditor: () => void;
}> = ({ cell, row, column, store, editorOpen, onToggleEditor }) => {
  const action = cellAction(cell, row, column);
  const connected = cell.route !== null;
  const chainLength = cell.route?.transforms.length ?? 0;
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
      data-chain-length={chainLength}
      title={
        connected
          ? `${column.blockLabel} → ${row.blockLabel}.${row.portLabel}` +
            (chainLength > 0 ? ` (via ${chainLength} transform${chainLength > 1 ? 's' : ''})` : '') +
            ' — click to disconnect'
          : action !== null
            ? `Connect ${column.blockLabel} → ${row.blockLabel}.${row.portLabel}`
            : 'Incompatible'
      }
      onClick={action === null ? undefined : () => applyAction(store, action)}
    >
      {glyph}
      {connected && cell.route !== null && (
        <span
          style={
            {
              ...styles.fxBadge,
              ...(editorOpen ? styles.fxBadgeActive : {}),
            } as React.CSSProperties
          }
          data-testid={`mod-fx-${row.blockId}:${row.portId}--${column.blockId}`}
          title="Edit transform chain"
          onClick={(e) => {
            e.stopPropagation();
            onToggleEditor();
          }}
        >
          {chainLength > 0 ? `ƒ${chainLength}` : 'ƒ'}
        </span>
      )}
      {editorOpen && cell.route !== null && (
        <ChainEditor route={cell.route} row={row} store={store} onClose={onToggleEditor} />
      )}
    </td>
  );
};

/**
 * The compact in-cell chain editor: the transforms along a route, each with its
 * editable parameters and a remove control, plus a palette to append more and a
 * button to disconnect the whole route. Every control resolves to a pure
 * `ModulationAction` applied against the store.
 */
const ChainEditor: React.FC<{
  route: ModulationRoute;
  row: ModulationPortRef;
  store: PillarPatchStore;
  onClose: () => void;
}> = ({ route, row, store, onClose }) => {
  const palette = transformPalette(store.registry);
  return (
    <div
      style={styles.popover as React.CSSProperties}
      data-testid={`mod-chain-${row.blockId}:${row.portId}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={styles.popTitle as React.CSSProperties}>Transform chain (source → input)</div>

      {route.transforms.length === 0 && (
        <div style={{ color: '#6f6f88', fontSize: 10 } as React.CSSProperties}>
          Direct route — add a transform below.
        </div>
      )}

      {route.transforms.map((transform, index) => (
        <div key={transform.blockId} style={styles.chainItem as React.CSSProperties}>
          <span style={styles.chainName as React.CSSProperties}>{transform.displayName}</span>
          {transform.fields.map((field) => (
            <label key={field.key} style={styles.fieldLabel as React.CSSProperties}>
              {field.label}{' '}
              <input
                style={styles.numberInput as React.CSSProperties}
                type="number"
                // A cleared/partial number input yields NaN (which is `typeof
                // 'number'`); Number.isFinite keeps the field blank rather than
                // rendering NaN, matching the field's `.finite()` schema. The
                // transient invalid value is still caught loudly by zod at compile.
                value={typeof field.value === 'number' && Number.isFinite(field.value) ? field.value : ''}
                data-testid={`mod-field-${transform.blockId}-${field.key}`}
                onChange={(e) =>
                  applyAction(
                    store,
                    setTransformConfigAction(transform.blockId, field.key, e.target.valueAsNumber),
                  )
                }
              />
            </label>
          ))}
          <button
            style={styles.removeBtn as React.CSSProperties}
            title="Remove this transform"
            data-testid={`mod-remove-${transform.blockId}`}
            onClick={() => applyAction(store, removeTransformAction(route, row, index))}
          >
            ×
          </button>
        </div>
      ))}

      <div style={styles.addRow as React.CSSProperties}>
        {palette.map((entry) => (
          <button
            key={entry.type}
            style={styles.addBtn as React.CSSProperties}
            data-testid={`mod-add-${entry.type}`}
            onClick={() => applyAction(store, appendTransformAction(route, row, entry.type))}
          >
            + {entry.displayName}
          </button>
        ))}
      </div>

      <button
        style={styles.disconnectBtn as React.CSSProperties}
        data-testid={`mod-disconnect-${row.blockId}:${row.portId}`}
        onClick={() => {
          applyAction(store, {
            kind: 'disconnect',
            inputEdgeId: route.inputEdgeId,
            transformBlockIds: route.transforms.map((t) => t.blockId),
          });
          onClose();
        }}
      >
        Disconnect route
      </button>
    </div>
  );
};
