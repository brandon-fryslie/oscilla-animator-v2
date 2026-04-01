/**
 * Gate 0: instanced-write — validates fixture compiles and produces valid payload.
 */
import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';

describe('GPU-IR DSL', () => {
  test('Gate 0: instanced-write produces valid payload', () => {
    const payload = loadFixturePayload('instanced-write');
    expect(payload.manifest).toBeDefined();
    expect(payload.roster).toHaveLength(3);
    expect(payload.roster[0].type).toBe('Compute');
    expect(payload.roster[1].type).toBe('System_DrawPrep');
    expect(payload.roster[2].type).toBe('Render');
  });
});
