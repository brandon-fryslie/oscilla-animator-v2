import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';

describe('GPU-IR DSL', () => {
  test('Gate: for-loop-gradient produces valid payload', () => {
    const payload = loadFixturePayload('for-loop-gradient');
    expect(payload.roster).toHaveLength(4);
  });
});
