import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';
import type { ComputePassSpec } from '../../rust/boundary-contract';

describe('GPU-IR DSL', () => {
  test('Gate 7: vector-field exercises vector builtins', () => {
    const payload = loadFixturePayload('vector-field');
    expect(payload.roster).toHaveLength(3);
    const compute = payload.roster[0] as ComputePassSpec;
    const builtinNames = new Set<string>();
    JSON.stringify(compute.ast, (key, value) => {
      if (key === 'func' && typeof value === 'string') builtinNames.add(value);
      return value;
    });
    for (const fn of ['normalize', 'length', 'distance', 'dot', 'cross', 'reflect']) {
      expect(builtinNames, `missing builtin: ${fn}`).toContain(fn);
    }
  });
});
