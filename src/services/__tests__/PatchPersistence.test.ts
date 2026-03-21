import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Patch } from '../../graph';
import {
  clearPatchFromStorage,
  clearPatchPersistenceIssues,
  deserializePatch,
  getPatchPersistenceIssues,
  loadPatchFromStorage,
  savePatchToStorage,
  serializePatch,
  setPatchPersistenceIssueReporter,
  STORAGE_KEY,
} from '../PatchPersistence';

function createEmptyPatch(): Patch {
  return { blocks: new Map(), edges: [] };
}

describe('PatchPersistence issue reporting', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  beforeEach(() => {
    vi.restoreAllMocks();
    clearPatchPersistenceIssues();
    setPatchPersistenceIssueReporter(null);
  });

  afterEach(() => {
    clearPatchPersistenceIssues();
    setPatchPersistenceIssueReporter(null);
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    } else {
       
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('records deserialize failures as warn issues', () => {
    const result = deserializePatch('{broken json');
    expect(result).toBeNull();
    expect(getPatchPersistenceIssues()).toHaveLength(1);
    expect(getPatchPersistenceIssues()[0]).toMatchObject({
      level: 'warn',
      op: 'deserialize',
      message: 'Failed to deserialize persisted patch JSON',
    });
  });

  it('records save failures and emits reporter callback', () => {
    const received: Array<{ level: string; op: string; message: string }> = [];
    setPatchPersistenceIssueReporter((issue) => {
      received.push({ level: issue.level, op: issue.op, message: issue.message });
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          throw new Error('quota exceeded');
        }),
      },
    });

    savePatchToStorage(createEmptyPatch(), 0);

    expect(getPatchPersistenceIssues()).toHaveLength(1);
    expect(getPatchPersistenceIssues()[0]).toMatchObject({
      level: 'warn',
      op: 'save',
      message: 'Failed to persist patch to local storage',
    });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      level: 'warn',
      op: 'save',
      message: 'Failed to persist patch to local storage',
    });
  });

  it('records load failures as warn issues', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => {
          throw new Error('storage unavailable');
        }),
        setItem: vi.fn(),
      },
    });

    const result = loadPatchFromStorage();

    expect(result).toBeNull();
    expect(getPatchPersistenceIssues()).toHaveLength(1);
    expect(getPatchPersistenceIssues()[0]).toMatchObject({
      level: 'warn',
      op: 'load',
      message: 'Failed to load patch from local storage',
    });
  });

  it('clears the persisted patch key without reloading', () => {
    const removeItem = vi.fn();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem,
      },
    });

    clearPatchFromStorage();

    expect(removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('records clear failures as warn issues', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(() => {
          throw new Error('remove unavailable');
        }),
      },
    });

    clearPatchFromStorage();

    expect(getPatchPersistenceIssues()).toHaveLength(1);
    expect(getPatchPersistenceIssues()[0]).toMatchObject({
      level: 'warn',
      op: 'clear',
      message: 'Failed to clear stored patch',
    });
  });

  it('serializes canonical displayName without legacy label field', () => {
    const patch = {
      blocks: new Map([
        ['b0', {
          id: 'b0',
          type: 'Add',
          params: {},
          label: 'Legacy Label',
          displayName: 'Add 1',
          domainId: null,
          role: { kind: 'user', meta: {} },
          inputPorts: new Map(),
          outputPorts: new Map(),
        }],
      ]),
      edges: [],
    } as unknown as Patch;

    const serialized = serializePatch(patch, 0);
    const parsed = JSON.parse(serialized) as { blocks: Array<Record<string, unknown>> };

    expect(parsed.blocks[0].displayName).toBe('Add 1');
    expect(parsed.blocks[0]).not.toHaveProperty('label');
  });

  it('drops legacy label field when deserializing persisted patches', () => {
    const legacyJson = JSON.stringify({
      blocks: [
        {
          id: 'b0',
          type: 'Add',
          params: {},
          label: 'Old Label',
          displayName: 'Add 1',
          domainId: null,
          role: { kind: 'user', meta: {} },
          inputPorts: [],
          outputPorts: [],
        },
      ],
      edges: [],
      presetIndex: 0,
    });

    const result = deserializePatch(legacyJson);

    expect(result).not.toBeNull();
    const block = result!.patch.blocks.get('b0' as any);
    expect(block?.displayName).toBe('Add 1');
    expect('label' in (block as unknown as Record<string, unknown>)).toBe(false);
  });
});
