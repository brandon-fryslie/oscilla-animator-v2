import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';

describe('GPU-IR DSL', () => {
  test('Gate: conditional-ring produces valid payload', () => {
    const payload = loadFixturePayload('conditional-ring');
    expect(payload.roster).toHaveLength(3);
  });
});
