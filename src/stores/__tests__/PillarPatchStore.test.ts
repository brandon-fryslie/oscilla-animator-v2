/**
 * Contract tests for PillarPatchStore — the authored native-patch SSOT.
 *
 * [LAW:behavior-not-structure] Assert what the store means: the seed renders,
 *   edits change the derived plan, breaking the graph surfaces diagnostics
 *   without throwing. Never assert internal block array identity.
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { loadPillarPatchFromStorage } from '../../services/PillarPatchPersistence';
import { PillarPatchStore } from '../PillarPatchStore';

describe('PillarPatchStore', () => {
  it('seeds a renderable patch (grid demo) that compiles with no diagnostics', () => {
    const store = new PillarPatchStore();
    expect(store.compiled.kind).toBe('ok');
    expect(store.diagnostics).toEqual([]);
  });

  it('recompiles when a config edit changes the authored patch', () => {
    const store = new PillarPatchStore();
    const before = store.compiled;
    store.updateConfig('grid', 'rows', 4);
    expect(store.compiled).not.toBe(before);
    expect(store.compiled.kind).toBe('ok');
  });

  it('surfaces a config diagnostic for an out-of-range value instead of clamping', () => {
    const store = new PillarPatchStore();
    // rows is a positive int; zero must be rejected by the block schema.
    store.updateConfig('grid', 'rows', 0);
    expect(store.compiled.kind).toBe('error');
    expect(store.diagnostics.join('\n')).toMatch(/rows/);
  });

  it('drops edges touching a removed block and surfaces the now-missing input', () => {
    const store = new PillarPatchStore();
    store.removeBlock('grid');
    // The draw's primary input is no longer fed → not renderable, with a
    // diagnostic — never a silent empty render.
    expect(store.compiled.kind).toBe('error');
    expect(store.patch.edges.some((e) => e.source === 'grid' || e.target === 'grid')).toBe(false);
    expect(store.diagnostics.length).toBeGreaterThan(0);
  });

  it('adds a catalog block with schema-valid default config', () => {
    const store = new PillarPatchStore();
    const id = store.addBlock('InstanceGrid');
    const added = store.patch.blocks.find((b) => b.id === id);
    expect(added).toBeDefined();
    expect(added?.type).toBe('InstanceGrid');
    // Default config must satisfy the block's own schema (no parse diagnostic
    // mentioning the new block id).
    expect(store.diagnostics.some((d) => d.includes(id))).toBe(false);
  });

  it('refuses to add an unregistered block type loudly', () => {
    const store = new PillarPatchStore();
    expect(() => store.addBlock('NoSuchBlock')).toThrow(/unregistered/);
  });

  it('rewires an input slot in place (one feeder per slot)', () => {
    const store = new PillarPatchStore();
    const second = store.addBlock('InstanceGrid');
    store.addEdge(second, 'draw', 'primary');
    const feeders = store.patch.edges.filter((e) => e.target === 'draw' && e.inputSlot === 'primary');
    expect(feeders).toHaveLength(1);
    expect(feeders[0].source).toBe(second);
    expect(store.compiled.kind).toBe('ok');
  });

  it('exposes the scene catalog for the palette', () => {
    const store = new PillarPatchStore();
    const types = store.catalog.map((c) => c.type);
    expect(types).toContain('InstanceGrid');
    expect(types).toContain('DrawInstances');
  });

  it('seeds from an explicit saved patch instead of the default starter', () => {
    const saved = {
      blocks: [{ id: 'grid', kind: 'generator' as const, type: 'InstanceGrid', config: { rows: 3, cols: 3 } }],
      edges: [],
    };
    const store = new PillarPatchStore(saved);
    expect(store.patch.blocks).toHaveLength(1);
    expect(store.patch.blocks[0].config.rows).toBe(3);
  });
});

describe('PillarPatchStore persistence', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  beforeEach(() => {
    vi.useFakeTimers();
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('persists an edit so a fresh store reloads it (survives reload)', () => {
    const store = new PillarPatchStore();
    store.startPersistence(() => {});
    store.updateConfig('grid', 'rows', 7);
    vi.runAllTimers(); // flush the debounced save reaction

    const loaded = loadPillarPatchFromStorage();
    expect(loaded.kind).toBe('loaded');
    if (loaded.kind !== 'loaded') return;

    const reloaded = new PillarPatchStore(loaded.patch);
    const grid = reloaded.patch.blocks.find((b) => b.id === 'grid');
    expect(grid?.config.rows).toBe(7);
    store.stopPersistence();
  });

  it('stops writing after stopPersistence', () => {
    const store = new PillarPatchStore();
    store.startPersistence(() => {});
    store.updateConfig('grid', 'rows', 5);
    vi.runAllTimers();
    store.stopPersistence();

    store.updateConfig('grid', 'rows', 9);
    vi.runAllTimers();

    const loaded = loadPillarPatchFromStorage();
    expect(loaded.kind).toBe('loaded');
    if (loaded.kind !== 'loaded') return;
    const grid = loaded.patch.blocks.find((b) => b.id === 'grid');
    // The post-stop edit (9) was never written; storage still holds 5.
    expect(grid?.config.rows).toBe(5);
  });

  it('reports a write failure through the injected reporter', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota exceeded');
        },
      },
    });
    const issues: string[] = [];
    const store = new PillarPatchStore();
    store.startPersistence((message) => issues.push(message));
    store.updateConfig('grid', 'rows', 4);
    vi.runAllTimers();
    store.stopPersistence();

    expect(issues.some((m) => /quota exceeded/.test(m))).toBe(true);
  });
});
