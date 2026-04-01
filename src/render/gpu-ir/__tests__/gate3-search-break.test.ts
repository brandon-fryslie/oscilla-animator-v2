import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';

describe('GPU-IR DSL', () => {
  test('Gate: search-break produces valid payload', () => {
    const payload = loadFixturePayload('search-break');
    expect(payload.roster).toHaveLength(4);
  });
});
