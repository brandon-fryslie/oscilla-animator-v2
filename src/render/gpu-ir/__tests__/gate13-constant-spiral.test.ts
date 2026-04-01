import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';
import type { ComputePassSpec } from '../../rust/boundary-contract';

describe('GPU-IR DSL', () => {
  test('Gate 13: constant-spiral exercises constants map and LiteralI32', () => {
    const payload = loadFixturePayload('constant-spiral');
    expect(payload.roster).toHaveLength(3);
    const compute = payload.roster[0] as ComputePassSpec;
    // Constants become Let bindings in the AST preamble
    const firstThreeStmts = compute.ast.slice(0, 3);
    const constNames = firstThreeStmts
      .filter(s => s.type === 'Let')
      .map(s => (s as { name: string }).name);
    expect(constNames).toContain('RADIUS');
    expect(constNames).toContain('TWIST');
    expect(constNames).toContain('ARMS');
    // Verify LiteralI32 and Cast to i32 appear
    const astJson = JSON.stringify(compute.ast);
    expect(astJson).toContain('"LiteralI32"');
    expect(astJson).toContain('"i32"');
  });
});
