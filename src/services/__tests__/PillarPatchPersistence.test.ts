/**
 * Storage shell contract for pillar-patch persistence.
 *
 * [LAW:behavior-not-structure] Assert the meaning: an authored patch saved to
 *   storage loads back identically (survives reload); no saved patch reports
 *   `empty` (the first-visit default case); a stored-but-unreadable patch reports
 *   `failed` (never silently treated as empty). [LAW:no-silent-failure]
 *
 * `resolveLocalStorageCapability` accepts only a `value` descriptor on
 * `globalThis.localStorage` in the Node test runtime, so the mock is installed
 * that way (mirroring the V1 PatchPersistence test).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeGridOfSquaresPatch } from '../../pillars/fixtures/grid-of-squares';
import { serializePillarPatch } from '../../pillars/persistence';
import {
  PILLAR_PATCH_STORAGE_KEY,
  loadPillarPatchFromStorage,
  savePillarPatchToStorage,
} from '../PillarPatchPersistence';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function installStorage(store: Map<string, string>): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  } else {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

describe('pillar-patch storage', () => {
  it('round-trips an authored patch across save → load (survives reload)', () => {
    installStorage(new Map());
    const patch = makeGridOfSquaresPatch();

    expect(savePillarPatchToStorage(patch)).toEqual({ kind: 'saved' });

    const loaded = loadPillarPatchFromStorage();
    expect(loaded.kind).toBe('loaded');
    if (loaded.kind === 'loaded') expect(loaded.patch).toEqual(patch);
  });

  it('reports empty when nothing is stored (first-visit default case)', () => {
    installStorage(new Map());
    expect(loadPillarPatchFromStorage()).toEqual({ kind: 'empty' });
  });

  it('reports empty when no storage capability exists', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(loadPillarPatchFromStorage()).toEqual({ kind: 'empty' });
  });

  it('reports failed for a stored-but-unreadable patch instead of empty', () => {
    const store = new Map<string, string>([[PILLAR_PATCH_STORAGE_KEY, '{ corrupt']]);
    installStorage(store);
    const loaded = loadPillarPatchFromStorage();
    expect(loaded.kind).toBe('failed');
    if (loaded.kind === 'failed') expect(loaded.error).toMatch(/unreadable/);
  });

  it('reports failed when a write rejects (e.g. quota)', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota exceeded');
        },
      },
    });
    const result = savePillarPatchToStorage(makeGridOfSquaresPatch());
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') expect(result.error).toMatch(/quota exceeded/);
  });

  it('is no-op success when no storage capability exists', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(savePillarPatchToStorage(makeGridOfSquaresPatch())).toEqual({ kind: 'saved' });
  });

  it('rejects a patch persisted under an incompatible future version', () => {
    const futureBlob = JSON.stringify({ version: 999, patch: makeGridOfSquaresPatch() });
    const store = new Map<string, string>([[PILLAR_PATCH_STORAGE_KEY, futureBlob]]);
    installStorage(store);
    expect(loadPillarPatchFromStorage().kind).toBe('failed');

    // Sanity: the current version under the same key loads.
    store.set(PILLAR_PATCH_STORAGE_KEY, serializePillarPatch(makeGridOfSquaresPatch()));
    expect(loadPillarPatchFromStorage().kind).toBe('loaded');
  });
});
