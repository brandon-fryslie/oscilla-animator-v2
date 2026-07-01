/**
 * The Modulation Table is a second projection of the authored patch, not a second
 * copy of it. These tests pin the two claims the ticket rests on:
 *
 *  1. The grid renders one cell per existing connection over the authored patch.
 *  2. Adding / removing / retargeting a connection through a cell updates the SAME
 *     patch the graph edits — a table edit and the equivalent graph edit converge
 *     on one patch, because both reduce to the same `PillarPatchStore` operation.
 */

import { describe, it, expect } from 'vitest';

import { PillarPatchStore } from '../../../stores/PillarPatchStore';
import { makeGridOfSquaresPatch } from '../../../pillars/fixtures/grid-of-squares';
import type { PillarEdge } from '../../../pillars/types';
import { buildModulationTable, cellAction } from '../modulationTable';

/** Locate a cell by its row (target input) and column (source output) block ids. */
function locate(
  store: PillarPatchStore,
  rowBlockId: string,
  rowPortId: string,
  colBlockId: string,
) {
  const model = buildModulationTable(store.patch, store.registry);
  const rowIndex = model.rows.findIndex((r) => r.blockId === rowBlockId && r.portId === rowPortId);
  const colIndex = model.columns.findIndex((c) => c.blockId === colBlockId);
  expect(rowIndex).toBeGreaterThanOrEqual(0);
  expect(colIndex).toBeGreaterThanOrEqual(0);
  return {
    model,
    row: model.rows[rowIndex],
    column: model.columns[colIndex],
    cell: model.cells[rowIndex][colIndex],
  };
}

/** Edges sorted by id — order-insensitive comparison of two patches' routing. */
function edgesById(edges: readonly PillarEdge[]): PillarEdge[] {
  return [...edges].sort((a, b) => a.id.localeCompare(b.id));
}

describe('buildModulationTable', () => {
  it('projects the seed patch into input rows and output columns', () => {
    const store = new PillarPatchStore(makeGridOfSquaresPatch());
    const model = buildModulationTable(store.patch, store.registry);

    // Rows = every input port: ColorCycle.primary and DrawInstances.primary.
    expect(model.rows.map((r) => `${r.blockId}.${r.portId}`)).toEqual([
      'color.primary',
      'draw.primary',
    ]);
    // Columns = every single-output block: grid, color, draw.
    expect(model.columns.map((c) => c.blockId)).toEqual(['grid', 'color', 'draw']);
  });

  it('renders exactly one cell per existing connection', () => {
    const store = new PillarPatchStore(makeGridOfSquaresPatch());
    const model = buildModulationTable(store.patch, store.registry);

    const connectedCells = model.cells.flat().filter((cell) => cell.edge !== null);
    expect(connectedCells).toHaveLength(store.patch.edges.length);
    expect(connectedCells.map((c) => c.edge?.id).sort()).toEqual(['e0', 'e1']);
  });

  it('marks a block feeding itself and type-incompatible crossings as not connectable', () => {
    const store = new PillarPatchStore(makeGridOfSquaresPatch());

    // ColorCycle → ColorCycle.primary: a block cannot feed its own input.
    expect(locate(store, 'color', 'primary', 'color').cell.connectable).toBe(false);
    // DrawInstances (materialShell output) → ColorCycle.primary (instanceBundle): mismatch.
    expect(locate(store, 'color', 'primary', 'draw').cell.connectable).toBe(false);
    // InstanceGrid (instanceBundle) → ColorCycle.primary (instanceBundle): compatible.
    expect(locate(store, 'color', 'primary', 'grid').cell.connectable).toBe(true);
  });
});

describe('scalar routing — a scalar source column feeds a knob row', () => {
  it('shows a connectable scalar row/column pair and connects it', () => {
    // A bare patch with a Constant scalar source and a WaveOffset (whose amplitude
    // is a routable scalar knob). The table must offer Constant.value → the knob.
    const store = new PillarPatchStore({ blocks: [], edges: [] });
    const constId = store.addBlock('Constant');
    const waveId = store.addBlock('WaveOffset');

    const { cell, row, column } = locate(store, waveId, 'amplitude', constId);
    // The scalar row (a knob input) crosses the scalar column (Constant output) as
    // a connectable, empty cell.
    expect(row.value).toBe('scalar');
    expect(column.value).toBe('scalar');
    expect(cell.edge).toBeNull();
    expect(cell.connectable).toBe(true);

    // Clicking it connects the Constant into the knob.
    const action = cellAction(cell, row, column);
    expect(action).toEqual({
      kind: 'connect',
      source: constId,
      target: waveId,
      inputSlot: 'amplitude',
    });
    if (action?.kind === 'connect') store.addEdge(action.source, action.target, action.inputSlot);

    // The rebuilt table now shows the connection at that scalar crossing.
    expect(locate(store, waveId, 'amplitude', constId).cell.edge).not.toBeNull();
  });
});

describe('cellAction', () => {
  it('resolves an occupied cell to a disconnect of its edge', () => {
    const store = new PillarPatchStore(makeGridOfSquaresPatch());
    const { cell, row, column } = locate(store, 'color', 'primary', 'grid');
    expect(cellAction(cell, row, column)).toEqual({ kind: 'disconnect', edgeId: 'e0' });
  });

  it('resolves an empty compatible cell to a connect', () => {
    const store = new PillarPatchStore(makeGridOfSquaresPatch());
    store.removeEdge('e1'); // free DrawInstances.primary
    const { cell, row, column } = locate(store, 'draw', 'primary', 'grid');
    expect(cellAction(cell, row, column)).toEqual({
      kind: 'connect',
      source: 'grid',
      target: 'draw',
      inputSlot: 'primary',
    });
  });

  it('resolves an inert (incompatible / self) cell to no action', () => {
    const store = new PillarPatchStore(makeGridOfSquaresPatch());
    const { cell, row, column } = locate(store, 'color', 'primary', 'draw');
    expect(cellAction(cell, row, column)).toBeNull();
  });
});

describe('table edits mutate the same patch the graph edits', () => {
  it('remove: a table disconnect equals the graph removeEdge', () => {
    const viaTable = new PillarPatchStore(makeGridOfSquaresPatch());
    const viaGraph = new PillarPatchStore(makeGridOfSquaresPatch());

    // Table path: click the connected (color.primary × grid) cell.
    const { cell, row, column } = locate(viaTable, 'color', 'primary', 'grid');
    const action = cellAction(cell, row, column);
    expect(action).toEqual({ kind: 'disconnect', edgeId: 'e0' });
    if (action?.kind === 'disconnect') viaTable.removeEdge(action.edgeId);

    // Graph path: the same intent expressed as the store call the graph makes.
    viaGraph.removeEdge('e0');

    expect(edgesById(viaTable.patch.edges)).toEqual(edgesById(viaGraph.patch.edges));
    expect(viaTable.patch.edges.some((e) => e.id === 'e0')).toBe(false);
  });

  it('add: a table connect equals the graph addEdge', () => {
    const viaTable = new PillarPatchStore(makeGridOfSquaresPatch());
    const viaGraph = new PillarPatchStore(makeGridOfSquaresPatch());
    viaTable.removeEdge('e1');
    viaGraph.removeEdge('e1');

    const { cell, row, column } = locate(viaTable, 'draw', 'primary', 'grid');
    const action = cellAction(cell, row, column);
    if (action?.kind === 'connect') viaTable.addEdge(action.source, action.target, action.inputSlot);

    viaGraph.addEdge('grid', 'draw', 'primary');

    expect(edgesById(viaTable.patch.edges)).toEqual(edgesById(viaGraph.patch.edges));
    const drawFeeders = viaTable.patch.edges.filter((e) => e.target === 'draw' && e.inputSlot === 'primary');
    expect(drawFeeders.map((e) => e.source)).toEqual(['grid']);
  });

  it('retarget: connecting into an occupied row replaces the old feeder (one feeder per input slot)', () => {
    const viaTable = new PillarPatchStore(makeGridOfSquaresPatch());
    const viaGraph = new PillarPatchStore(makeGridOfSquaresPatch());

    // DrawInstances.primary is fed by color (e1). Click the grid column in that row.
    const { cell, row, column } = locate(viaTable, 'draw', 'primary', 'grid');
    const action = cellAction(cell, row, column);
    if (action?.kind === 'connect') viaTable.addEdge(action.source, action.target, action.inputSlot);

    viaGraph.addEdge('grid', 'draw', 'primary');

    expect(edgesById(viaTable.patch.edges)).toEqual(edgesById(viaGraph.patch.edges));
    // Exactly one feeder remains, and it is the new source.
    const drawFeeders = viaTable.patch.edges.filter((e) => e.target === 'draw' && e.inputSlot === 'primary');
    expect(drawFeeders.map((e) => e.source)).toEqual(['grid']);
  });

  it('a graph edit is visible in the table projection (one patch, two views)', () => {
    const store = new PillarPatchStore(makeGridOfSquaresPatch());

    // Graph path retargets DrawInstances.primary from color to grid.
    store.addEdge('grid', 'draw', 'primary');

    // The table, rebuilt from the same patch, reflects it: grid→draw is now
    // connected and color→draw is empty.
    expect(locate(store, 'draw', 'primary', 'grid').cell.edge).not.toBeNull();
    expect(locate(store, 'draw', 'primary', 'color').cell.edge).toBeNull();
  });
});
