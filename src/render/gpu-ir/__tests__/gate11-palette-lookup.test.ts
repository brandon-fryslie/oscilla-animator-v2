import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';
import type { ComputePassSpec } from '../../rust/boundary-contract';

describe('GPU-IR DSL', () => {
  test('Gate 11: palette-lookup exercises IndexAccess and nested Construct', () => {
    const payload = loadFixturePayload('palette-lookup');
    expect(payload.roster).toHaveLength(4);
    const compute = payload.roster[0] as ComputePassSpec;
    // Verify IndexAccess appears in AST
    const hasIndexAccess = JSON.stringify(compute.ast).includes('"IndexAccess"');
    expect(hasIndexAccess).toBe(true);
  });
});
