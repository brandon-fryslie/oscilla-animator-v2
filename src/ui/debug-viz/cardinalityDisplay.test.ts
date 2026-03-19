import { describe, expect, it } from 'vitest';
import { getDebugMiniViewDisplayMode } from './cardinalityDisplay';

describe('getDebugMiniViewDisplayMode', () => {
  it('treats zero cardinality as a scalar display mode', () => {
    expect(getDebugMiniViewDisplayMode('zero')).toBe('scalar');
  });
});
