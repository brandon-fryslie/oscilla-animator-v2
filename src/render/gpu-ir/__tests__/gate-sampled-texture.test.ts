import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';
import type { RenderPassSpec, DrawCallSpec } from '../../rust/boundary-contract';

describe('GPU-IR DSL', () => {
  test('Gate: sampled-texture uses TextureSample with sampler', () => {
    const payload = loadFixturePayload('sampled-texture');
    expect(payload.manifest.samplers).toHaveProperty('linear_sampler');
    const renderPass = payload.roster.find(e => e.type === 'Render') as RenderPassSpec;
    const dc = renderPass.drawCalls[0] as DrawCallSpec;
    const astJson = JSON.stringify(dc.fragmentAst);
    expect(astJson).toContain('"TextureSample"');
    expect(astJson).toContain('linear_sampler');
  });
});
