/**
 * Tests for draft-graph-bridge.ts
 *
 * Validates that bridgeToNormalizedPatch correctly converts
 * StrictTypedGraph → NormalizedPatch + TypeResolvedPatch.
 */
import { describe, it, expect } from 'vitest';
import { bridgeToNormalizedPatch } from '../draft-graph-bridge';
import { buildDraftGraph } from '../draft-graph';
import { finalizeNormalizationFixpoint } from '../final-normalization';
import { buildPatch } from '../../../graph/Patch';
import { BLOCK_DEFS_BY_TYPE } from '../../../blocks/registry';

/**
 * Helper: run fixpoint on a patch and return the strict result + expanded patch.
 * Throws if strict is null (test setup error).
 */
function fixpointStrict(patchFn: (b: import('../../../graph/Patch').PatchBuilder) => void) {
  const patch = buildPatch(patchFn);
  const draftGraph = buildDraftGraph(patch);
  const result = finalizeNormalizationFixpoint(draftGraph, BLOCK_DEFS_BY_TYPE, { maxIterations: 20 });
  if (!result.strict) {
    throw new Error(
      `fixpointStrict failed: strict is null.\n` +
      `  blocks: ${result.graph.blocks.length}\n` +
      `  openObligations: ${result.graph.obligations.filter(o => o.status.kind === 'open').length}\n` +
      `  factPorts: ${result.facts.ports.size}\n` +
      `  diagnostics: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return { strict: result.strict, expandedPatch: patch };
}

describe('bridgeToNormalizedPatch', () => {
  it('empty graph → empty NormalizedPatch', () => {
    const { strict, expandedPatch } = fixpointStrict(() => {});

    const { normalizedPatch, typeResolved } = bridgeToNormalizedPatch(
      strict,
      expandedPatch,
      BLOCK_DEFS_BY_TYPE,
    );

    expect(normalizedPatch.blocks).toHaveLength(0);
    expect(normalizedPatch.edges).toHaveLength(0);
    expect(typeResolved.portTypes.size).toBe(0);
    expect(normalizedPatch.blockIndex.size).toBe(0);
  });
});
