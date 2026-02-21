/**
 * Composite Store Integration Tests
 *
 * Tests integration between CompositeEditorStore and the HCL serialization layer.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { serializeCompositeToHCL } from '../composite-serialize';
import { SmoothNoiseComposite } from '../../blocks/composites/library';
import { CompositeEditorStore } from '../../stores/CompositeEditorStore';
import { initializeComposites } from '../../blocks/composites';

// Trigger primitive block registration via side-effect imports
import '../../blocks/all';

describe('Store Integration', () => {
  beforeAll(() => {
    // [LAW:single-enforcer] Test owns environment setup for browser storage APIs.
    if (typeof globalThis.localStorage?.getItem !== 'function') {
      const store = new Map<string, string>();
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => { store.set(key, value); },
          removeItem: (key: string) => { store.delete(key); },
          clear: () => { store.clear(); },
          key: (index: number) => Array.from(store.keys())[index] ?? null,
          get length() { return store.size; },
        } satisfies Storage,
      });
    }

    // Register library composites (requires primitive blocks already registered)
    initializeComposites();
  });

  it('CompositeEditorStore can export library composite to HCL', () => {
    const store = new CompositeEditorStore();

    store.openExisting('SmoothNoise');
    const hcl = store.toHCL();

    expect(hcl).not.toBeNull();
    // Library composites are readonly, so openExisting forks with a unique name
    expect(hcl).toMatch(/composite "SmoothNoise\d*"/);
  });

  it('CompositeEditorStore can import HCL', () => {
    const store = new CompositeEditorStore();

    const hcl = serializeCompositeToHCL(SmoothNoiseComposite);
    const result = store.fromHCL(hcl);

    expect(result.errors).toHaveLength(0);
    expect(store.metadata.name).toBe('SmoothNoise');
    expect(store.internalBlocks.size).toBe(2);
    expect(store.internalEdges.length).toBe(1);
    expect(store.exposedInputs.length).toBe(2);
    expect(store.exposedOutputs.length).toBe(1);
  });

  it('CompositeEditorStore.fromHCL preserves state on error', () => {
    const store = new CompositeEditorStore();

    store.metadata = {
      name: 'Original',
      label: 'Original',
      category: 'user',
      description: 'Original desc',
    };

    const badHcl = 'invalid syntax { ] }';
    const result = store.fromHCL(badHcl);

    expect(result.errors.length).toBeGreaterThan(0);
    // fromHCL returns early on error without resetting, so state is preserved
    expect(store.metadata.name).toBe('Original');
  });
});
