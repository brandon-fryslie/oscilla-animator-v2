import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';

describe('GPU-IR DSL', () => {
  test('Gate: varying-gradient produces valid payload', () => {
    const payload = loadFixturePayload('varying-gradient');
    expect(payload.roster).toHaveLength(3);
  });
});
