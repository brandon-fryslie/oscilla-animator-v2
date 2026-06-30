/**
 * Contract tests for PillarPatchStore — the authored native-patch SSOT.
 *
 * [LAW:behavior-not-structure] Assert what the store means: the seed renders,
 *   edits change the derived plan, breaking the graph surfaces diagnostics
 *   without throwing. Never assert internal block array identity.
 */

import { describe, it, expect } from 'vitest';

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
});
