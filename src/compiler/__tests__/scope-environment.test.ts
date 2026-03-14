import { describe, expect, it } from 'vitest';
import { ScopeEnvironment } from '../ir/naga-emitter';

describe('ScopeEnvironment', () => {
  it('resolves bindings from parent scopes', () => {
    const root = new ScopeEnvironment<number>();
    root.set('expr:0:0', 11);

    const child = root.createChild();

    expect(child.get('expr:0:0')).toBe(11);
  });

  it('supports shadowing without mutating parent bindings', () => {
    const root = new ScopeEnvironment<number>();
    root.set('expr:2:0', 7);

    const child = root.createChild();
    child.set('expr:2:0', 19);

    expect(child.get('expr:2:0')).toBe(19);
    expect(root.get('expr:2:0')).toBe(7);
  });

  it('keeps sibling scope bindings isolated while preserving parent lookup', () => {
    const root = new ScopeEnvironment<number>();
    root.set('shared', 5);

    const left = root.createChild();
    const right = root.createChild();
    left.set('left-only', 13);

    expect(left.get('shared')).toBe(5);
    expect(right.get('shared')).toBe(5);
    expect(right.get('left-only')).toBeUndefined();
  });
});
