import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';
import type { ComputePassSpec } from '../../rust/boundary-contract';

describe('GPU-IR DSL', () => {
  test('Gate 5: scalar-accumulator uses LoadScalar as expression', () => {
    const payload = loadFixturePayload('scalar-accumulator');
    expect(payload.roster).toHaveLength(5); // 2 compute + drawPrep + camera + render

    // Second compute reads the scalar written by the first
    const evalPass = payload.roster[1] as ComputePassSpec;
    const hasLoadScalar = evalPass.ast.some(s =>
      s.type === 'Let' && s.value.type === 'LoadScalar',
    );
    expect(hasLoadScalar).toBe(true);
  });
});
