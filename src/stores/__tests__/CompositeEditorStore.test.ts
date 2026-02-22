import { describe, it, expect } from 'vitest';
import { CompositeEditorStore, type CompositeEditorIssue } from '../CompositeEditorStore';

describe('CompositeEditorStore', () => {
  it('reports missing composite definitions through injected issue reporter', () => {
    const reported: CompositeEditorIssue[] = [];
    const store = new CompositeEditorStore((issue) => reported.push(issue));

    store.openExisting('DoesNotExist_Composite');

    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatchObject({
      level: 'warn',
      message: 'Composite "DoesNotExist_Composite" not found in registry',
    });
    expect(store.lastIssue).toEqual(reported[0]);
  });

  it('reports save validation failures instead of emitting direct console warnings', () => {
    const reported: CompositeEditorIssue[] = [];
    const store = new CompositeEditorStore((issue) => reported.push(issue));

    store.openNew();
    const result = store.save();

    expect(result).toBeNull();
    expect(reported).toHaveLength(1);
    expect(reported[0].level).toBe('warn');
    expect(reported[0].message).toBe('Cannot save composite with validation errors');
    expect(Array.isArray(reported[0].detail)).toBe(true);
  });
});
