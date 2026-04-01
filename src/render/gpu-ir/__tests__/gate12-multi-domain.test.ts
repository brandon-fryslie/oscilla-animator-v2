import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';
import type { ComputePassSpec, RenderPassSpec } from '../../rust/boundary-contract';

describe('GPU-IR DSL', () => {
  test('Gate 12: multi-domain with cross-domain reads and multiple draw calls', () => {
    const payload = loadFixturePayload('multi-domain');
    expect(payload.roster).toHaveLength(5); // 2 compute + 2 drawPrep + 1 render

    // Verify cross-domain read: particle compute reads emitter fields
    const particleCompute = payload.roster[1] as ComputePassSpec;
    expect(particleCompute.dependencies.domains).toHaveProperty('emitters');
    expect(particleCompute.dependencies.domains).toHaveProperty('particles');

    // Verify multiple draw calls in one render pass
    const renderPass = payload.roster[4] as RenderPassSpec;
    expect(renderPass.drawCalls).toHaveLength(2);
    expect(renderPass.drawCalls[0].intentId).toBe('emitter_fill');
    expect(renderPass.drawCalls[1].intentId).toBe('particle_fill');
  });
});
