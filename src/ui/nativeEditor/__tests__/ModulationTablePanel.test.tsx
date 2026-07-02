/**
 * The Modulation Table view wires a cell click to the SAME `PillarPatchStore`
 * mutation the graph editor performs. These DOM tests prove the wiring end to
 * end: rendering the seed patch, clicking a cell, and observing the store's
 * authored edges change — the compiled-plan / preview follows from that store,
 * which the runtime observes elsewhere.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { autorun } from 'mobx';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

import { ModulationTablePanel } from '../ModulationTablePanel';
import { RootStore, StoreProvider } from '../../../stores';

function readComputed<T>(reader: () => T): T {
  let value!: T;
  const disposer = autorun(() => {
    value = reader();
  });
  disposer();
  return value;
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

let store: RootStore;

beforeEach(() => {
  localStorageMock.clear(); // empty storage → default grid-of-squares seed
  store = new RootStore();
});

function renderTable() {
  return render(
    <StoreProvider store={store}>
      <ModulationTablePanel />
    </StoreProvider>,
  );
}

describe('ModulationTablePanel', () => {
  it('renders a connected cell for each existing edge in the seed patch', () => {
    renderTable();
    // grid → color.primary (e0) and color → draw.primary (e1) are connected.
    expect(screen.getByTestId('mod-cell-color:primary--grid')).toHaveAttribute('data-connected', 'true');
    expect(screen.getByTestId('mod-cell-draw:primary--color')).toHaveAttribute('data-connected', 'true');
    // grid → draw.primary is an open (empty) crossing.
    expect(screen.getByTestId('mod-cell-draw:primary--grid')).toHaveAttribute('data-connected', 'false');
  });

  it('clicking a connected cell disconnects it in the store', () => {
    renderTable();
    expect(readComputed(() => store.pillarPatch.patch.edges.some((e) => e.id === 'e0'))).toBe(true);

    fireEvent.click(screen.getByTestId('mod-cell-color:primary--grid'));

    expect(readComputed(() => store.pillarPatch.patch.edges.some((e) => e.id === 'e0'))).toBe(false);
    // The cell now reads as open, live.
    expect(screen.getByTestId('mod-cell-color:primary--grid')).toHaveAttribute('data-connected', 'false');
  });

  it('clicking an empty compatible cell retargets the row to the new source', () => {
    renderTable();
    // DrawInstances.primary starts fed by color; click its grid column.
    fireEvent.click(screen.getByTestId('mod-cell-draw:primary--grid'));

    const feeders = readComputed(() =>
      store.pillarPatch.patch.edges.filter((e) => e.target === 'draw' && e.inputSlot === 'primary'),
    );
    expect(feeders.map((e) => e.source)).toEqual(['grid']);
    expect(screen.getByTestId('mod-cell-draw:primary--grid')).toHaveAttribute('data-connected', 'true');
    expect(screen.getByTestId('mod-cell-draw:primary--color')).toHaveAttribute('data-connected', 'false');
  });

  it('an incompatible cell is inert (clicking does nothing)', () => {
    renderTable();
    const before = readComputed(() => store.pillarPatch.patch.edges.length);
    // DrawInstances (materialShell) → ColorCycle.primary (instanceBundle) is a mismatch.
    fireEvent.click(screen.getByTestId('mod-cell-color:primary--draw'));
    expect(readComputed(() => store.pillarPatch.patch.edges.length)).toBe(before);
  });
});

describe('ModulationTablePanel — in-cell transform chain editor', () => {
  /**
   * Seed a COMPLETE renderable patch (grid → WaveOffset → draw) plus a direct
   * Constant → WaveOffset.amplitude scalar route — so compilation is `ok` and
   * inserting a transform on the route is a real round-trip, not a plan with a
   * missing draw.
   */
  function seedScalarRoute() {
    localStorageMock.clear();
    store = new RootStore();
    const patch = store.pillarPatch;
    for (const edge of [...patch.patch.edges]) patch.removeEdge(edge.id);
    for (const block of [...patch.patch.blocks]) patch.removeBlock(block.id);
    const gridId = patch.addBlock('InstanceGrid');
    const waveId = patch.addBlock('WaveOffset');
    const drawId = patch.addBlock('DrawInstances');
    const constId = patch.addBlock('Constant');
    patch.addEdge(gridId, waveId, 'primary');
    patch.addEdge(waveId, drawId, 'primary');
    patch.addEdge(constId, waveId, 'amplitude');
    return { constId, waveId };
  }

  it('inserts a Scale transform along the route via the ƒ editor, and it round-trips', () => {
    const { constId, waveId } = seedScalarRoute();
    renderTable();

    // Open the chain editor on the connected (amplitude × Constant) cell.
    fireEvent.click(screen.getByTestId(`mod-fx-${waveId}:amplitude--${constId}`));
    // Append a Scale transform.
    fireEvent.click(screen.getByTestId('mod-add-Scale'));

    // The store now routes Constant → Scale → amplitude, with exactly one transform.
    const edges = readComputed(() => store.pillarPatch.patch.edges);
    const scaleBlock = readComputed(() =>
      store.pillarPatch.patch.blocks.find((b) => b.type === 'Scale'),
    );
    expect(scaleBlock).toBeDefined();
    const scaleId = scaleBlock!.id;
    expect(edges.some((e) => e.source === constId && e.target === scaleId)).toBe(true);
    expect(edges.some((e) => e.source === scaleId && e.target === waveId && e.inputSlot === 'amplitude')).toBe(true);
    // No direct Constant → amplitude edge remains (the feeder was replaced).
    expect(edges.some((e) => e.source === constId && e.target === waveId)).toBe(false);

    // The route compiles (the scalar transform folds cleanly into the plan).
    expect(readComputed(() => store.pillarPatch.compiled.kind)).toBe('ok');
    // The cell now advertises a one-transform chain.
    expect(screen.getByTestId(`mod-cell-${waveId}:amplitude--${constId}`)).toHaveAttribute(
      'data-chain-length',
      '1',
    );
  });

  it('removing the transform restores the direct route', () => {
    const { constId, waveId } = seedScalarRoute();
    renderTable();
    fireEvent.click(screen.getByTestId(`mod-fx-${waveId}:amplitude--${constId}`));
    fireEvent.click(screen.getByTestId('mod-add-Scale'));

    const scaleId = readComputed(
      () => store.pillarPatch.patch.blocks.find((b) => b.type === 'Scale')!.id,
    );
    // Remove it via the × control (editor is still open on the same cell).
    fireEvent.click(screen.getByTestId(`mod-remove-${scaleId}`));

    const blocks = readComputed(() => store.pillarPatch.patch.blocks);
    const edges = readComputed(() => store.pillarPatch.patch.edges);
    expect(blocks.some((b) => b.type === 'Scale')).toBe(false);
    // The direct Constant → amplitude route is back.
    expect(edges.some((e) => e.source === constId && e.target === waveId && e.inputSlot === 'amplitude')).toBe(true);
  });

  it('retargeting a transform-laden route to a new source removes the orphaned chain', () => {
    // grid → wave → draw, Constant → Scale → wave.amplitude, plus a Time source.
    localStorageMock.clear();
    store = new RootStore();
    const p = store.pillarPatch;
    for (const e of [...p.patch.edges]) p.removeEdge(e.id);
    for (const b of [...p.patch.blocks]) p.removeBlock(b.id);
    const gridId = p.addBlock('InstanceGrid');
    const waveId = p.addBlock('WaveOffset');
    const drawId = p.addBlock('DrawInstances');
    const constId = p.addBlock('Constant');
    const scaleId = p.addBlock('Scale');
    const timeId = p.addBlock('Time');
    p.addEdge(gridId, waveId, 'primary');
    p.addEdge(waveId, drawId, 'primary');
    p.addEdge(constId, scaleId, 'in');
    p.addEdge(scaleId, waveId, 'amplitude');
    renderTable();

    // Retarget the amplitude knob to Time by clicking that empty cell.
    fireEvent.click(screen.getByTestId(`mod-cell-${waveId}:amplitude--${timeId}`));

    const blocks = readComputed(() => store.pillarPatch.patch.blocks);
    const edges = readComputed(() => store.pillarPatch.patch.edges);
    // The old Scale chain is gone — no orphaned block, no dangling Constant→Scale edge.
    expect(blocks.some((b) => b.id === scaleId)).toBe(false);
    expect(edges.some((e) => e.source === scaleId || e.target === scaleId)).toBe(false);
    // Amplitude is now fed directly by Time, and the patch compiles clean.
    expect(edges.some((e) => e.source === timeId && e.target === waveId && e.inputSlot === 'amplitude')).toBe(true);
    expect(readComputed(() => store.pillarPatch.compiled.kind)).toBe('ok');
  });

  it('editing a transform field writes the block config (persisted with the patch)', () => {
    const { constId, waveId } = seedScalarRoute();
    renderTable();
    fireEvent.click(screen.getByTestId(`mod-fx-${waveId}:amplitude--${constId}`));
    fireEvent.click(screen.getByTestId('mod-add-Scale'));

    const scaleId = readComputed(
      () => store.pillarPatch.patch.blocks.find((b) => b.type === 'Scale')!.id,
    );
    fireEvent.change(screen.getByTestId(`mod-field-${scaleId}-factor`), {
      target: { value: '4' },
    });

    const config = readComputed(
      () => store.pillarPatch.patch.blocks.find((b) => b.id === scaleId)!.config,
    );
    expect(config.factor).toBe(4);
  });
});
