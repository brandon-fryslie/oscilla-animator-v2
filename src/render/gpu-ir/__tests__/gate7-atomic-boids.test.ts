import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';

describe('GPU-IR DSL', () => {
  test('Gate: atomic-boids produces valid payload', () => {
    const payload = loadFixturePayload('atomic-boids');
    expect(payload.roster).toHaveLength(3);
  });
});
