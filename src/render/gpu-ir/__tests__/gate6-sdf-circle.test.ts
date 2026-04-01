import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';

describe('GPU-IR DSL', () => {
  test('Gate: sdf-circle produces valid payload', () => {
    const payload = loadFixturePayload('sdf-circle');
    expect(payload.roster).toHaveLength(3);
  });
});
