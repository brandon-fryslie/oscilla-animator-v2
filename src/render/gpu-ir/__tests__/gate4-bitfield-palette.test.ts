import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';

describe('GPU-IR DSL', () => {
  test('Gate: bitfield-palette produces valid payload', () => {
    const payload = loadFixturePayload('bitfield-palette');
    expect(payload.roster).toHaveLength(3);
  });
});
