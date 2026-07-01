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
