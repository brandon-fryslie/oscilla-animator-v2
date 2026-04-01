import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';
import type { ComputePassSpec } from '../../rust/boundary-contract';

describe('GPU-IR DSL', () => {
  test('Gate 10: atomic-histogram exercises atomicLoad + assignResultTo', () => {
    const payload = loadFixturePayload('atomic-histogram');
    expect(payload.roster).toHaveLength(4);
    const compute = payload.roster[0] as ComputePassSpec;
    const astJson = JSON.stringify(compute.ast);

    // assignResultTo: const old_value = atomicAdd(...)
    expect(astJson).toContain('"assignResultTo"');
    expect(astJson).toContain('"old_value"');

    // atomicLoad as expression: const current = atomicLoad(...)
    expect(astJson).toContain('"AtomicLoadField"');
  });
});
