import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';

describe('GPU-IR DSL', () => {
  test('Gate: spirograph-trace produces valid payload', () => {
    const payload = loadFixturePayload('spirograph-trace');
    expect(payload.roster).toHaveLength(3);
  });
});
