import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';
import type { ComputePassSpec } from '../../rust/boundary-contract';

describe('GPU-IR DSL', () => {
  test('Gate: texture-blur uses Texture dispatch mode', () => {
    const payload = loadFixturePayload('texture-blur');
    expect(payload.roster).toHaveLength(6); // 3 compute + drawPrep + camera + render
    const blurPass = payload.roster[1] as ComputePassSpec;
    expect(blurPass.dispatch).toStrictEqual({ mode: 'Texture', textureId: 'tex_dst' });
  });
});
