import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';

describe('GPU-IR DSL', () => {
  test('Gate: hash-color produces valid payload', () => {
    const payload = loadFixturePayload('hash-color');
    expect(payload.roster).toHaveLength(4);
  });
});
