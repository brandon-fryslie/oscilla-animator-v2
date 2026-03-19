import { describe, expect, it } from 'vitest';
import { ExpressionEditorStore } from '../ExpressionEditorStore';
import type { BlockId } from '../../types';

describe('ExpressionEditorStore', () => {
  it('seeds draft state from the persisted expression value', () => {
    const store = new ExpressionEditorStore();
    const blockId = 'expr-1' as BlockId;

    store.syncPersistedValue(blockId, 'clock.phaseA');

    expect(store.getPersistedValue(blockId, '')).toBe('clock.phaseA');
    expect(store.getDraftValue(blockId, '')).toBe('clock.phaseA');
  });

  it('keeps a dirty draft when persisted value syncs underneath it', () => {
    const store = new ExpressionEditorStore();
    const blockId = 'expr-1' as BlockId;

    store.syncPersistedValue(blockId, 'clock.phaseA');
    store.setDraftValue(blockId, 'clock.phaseA * 2');
    store.syncPersistedValue(blockId, 'clock.phaseB');

    expect(store.getPersistedValue(blockId, '')).toBe('clock.phaseB');
    expect(store.getDraftValue(blockId, '')).toBe('clock.phaseA * 2');
  });

  it('marks the shared draft clean when a draft commit succeeds', () => {
    const store = new ExpressionEditorStore();
    const blockId = 'expr-1' as BlockId;

    store.syncPersistedValue(blockId, 'clock.phaseA');
    store.setDraftValue(blockId, 'clock.phaseA * 2');
    store.commitDraftValue(blockId, 'clock.phaseA * 2');

    expect(store.getPersistedValue(blockId, '')).toBe('clock.phaseA * 2');
    expect(store.getDraftValue(blockId, '')).toBe('clock.phaseA * 2');
  });
});
