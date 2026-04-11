import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';
import type { ComputePassSpec } from '../../rust/boundary-contract';

describe('GPU-IR DSL', () => {
  test('Gate 6: math-zoo exercises comprehensive builtins', () => {
    const payload = loadFixturePayload('math-zoo');
    expect(payload.roster).toHaveLength(4);
    const compute = payload.roster[0] as ComputePassSpec;
    // Verify many builtins appear in the AST
    const builtinNames = new Set<string>();
    JSON.stringify(compute.ast, (key, value) => {
      if (key === 'func' && typeof value === 'string') builtinNames.add(value);
      return value;
    });
    for (const fn of ['tan', 'exp', 'log', 'sqrt', 'sign', 'fract', 'ceil', 'floor',
      'round', 'pow', 'atan2', 'min', 'step', 'mix', 'asin', 'acos', 'atan']) {
      expect(builtinNames, `missing builtin: ${fn}`).toContain(fn);
    }
  });
});
