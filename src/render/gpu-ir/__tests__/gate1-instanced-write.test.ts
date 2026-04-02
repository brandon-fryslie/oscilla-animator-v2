/**
 * Gate 1: instanced-write — Intrinsic, Cast, domain dispatch, varyings.
 */
import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';

describe('GPU-IR DSL', () => {
  test('Gate 1: instanced-write produces valid payload', () => {
    const payload = loadFixturePayload('instanced-write');
    expect(payload.manifest).toBeDefined();
    expect(payload.roster).toHaveLength(4);
    expect(payload.roster[0].type).toBe('System_CameraUpdate');
    expect(payload.roster[1].type).toBe('Compute');
  });
});
