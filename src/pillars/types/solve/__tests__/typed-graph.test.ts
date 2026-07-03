/**
 * src/pillars/types/solve/__tests__/typed-graph.test.ts
 *
 * DraftPortKey round-trip contract. Block IDs may contain ':' — every policy
 * synthesizes IDs like `_sys/adapter:needsAdapter:e1` — so the parser must
 * recover the exact parts the constructor was given, from the right.
 * [LAW:one-source-of-truth]
 */

import { describe, it, expect } from 'vitest';
import { draftPortKey, parseDraftPortKey } from '../typed-graph';

describe('DraftPortKey round-trip', () => {
  it('recovers plain block ids', () => {
    const key = draftPortKey('osc1', 'output', 'value', 'out');
    expect(parseDraftPortKey(key)).toEqual({ blockId: 'osc1', slotName: 'output', fieldName: 'value', dir: 'out' });
  });

  it('recovers system block ids containing colons', () => {
    const blockId = '_sys/adapter:needsAdapter:e1';
    const key = draftPortKey(blockId, 'input', 'value', 'in');
    expect(parseDraftPortKey(key)).toEqual({ blockId, slotName: 'input', fieldName: 'value', dir: 'in' });
  });

  it('rejects keys with too few segments', () => {
    expect(() => parseDraftPortKey('a:b:out' as never)).toThrow(/Invalid DraftPortKey/);
  });

  it('rejects keys whose final segment is not a direction', () => {
    expect(() => parseDraftPortKey('a:b:c:sideways' as never)).toThrow(/direction/);
  });
});
