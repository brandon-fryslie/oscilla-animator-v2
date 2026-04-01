import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';

describe('GPU-IR DSL', () => {
  test('Gate: texture-readwrite produces valid payload', () => {
    const payload = loadFixturePayload('texture-readwrite');
    expect(payload.roster).toHaveLength(4);
  });
});
