import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';
import type { ComputePassSpec } from '../../rust/boundary-contract';

describe('GPU-IR DSL', () => {
  test('Gate 5: scalar-accumulator produces valid payload with LoadScalar + AtomicOpScalar', () => {
    const payload = loadFixturePayload('scalar-accumulator');
    expect(payload.roster).toHaveLength(4);
    expect(payload.roster[0].type).toBe('Compute');
    expect(payload.roster[1].type).toBe('Compute');

    // Verify the second compute pass uses scalars (LoadScalar + AtomicOpScalar)
    const evalPass = payload.roster[1] as ComputePassSpec;
    expect(evalPass.dependencies.requiresGlobals).toBe(false);
    // The AST should contain LoadScalar and AtomicOpScalar nodes
    const hasLoadScalar = evalPass.ast.some(s =>
      s.type === 'Let' && s.value.type === 'LoadScalar',
    );
    const hasAtomicOp = evalPass.ast.some(s => s.type === 'AtomicOpScalar');
    expect(hasLoadScalar).toBe(true);
    expect(hasAtomicOp).toBe(true);
  });
});
