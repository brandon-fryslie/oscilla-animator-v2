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
import type { BlockId } from '../../../types';

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

/**
 * Helper that tries fixpoint and returns { strict, expandedPatch } or null if strict is null.
 */
function tryFixpointStrict(patchFn: (b: import('../../../graph/Patch').PatchBuilder) => void) {
  const patch = buildPatch(patchFn);
  const draftGraph = buildDraftGraph(patch);
  const result = finalizeNormalizationFixpoint(draftGraph, BLOCK_DEFS_BY_TYPE, { maxIterations: 20 });
  if (!result.strict) return null;
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

  it('connected Const → Add: correct Block reconstruction with ports', () => {
    // Use fully-connected graph so all types resolve
    const { strict, expandedPatch } = fixpointStrict((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const { normalizedPatch, typeResolved } = bridgeToNormalizedPatch(
      strict,
      expandedPatch,
      BLOCK_DEFS_BY_TYPE,
    );

    // Should have at least the 3 user blocks plus any default sources
    expect(normalizedPatch.blocks.length).toBeGreaterThanOrEqual(3);

    // Find the Add block — it has concrete input/output ports
    const addBlock = normalizedPatch.blocks.find((b) => b.type === 'Add');
    expect(addBlock).toBeDefined();
    expect(addBlock!.inputPorts.has('a')).toBe(true);
    expect(addBlock!.inputPorts.has('b')).toBe(true);
    expect(addBlock!.outputPorts.has('out')).toBe(true);

    // Port types should be populated
    expect(typeResolved.portTypes.size).toBeGreaterThan(0);
  });

  it('port key translation: DraftPortKey→PortKey uses numeric index', () => {
    const { strict, expandedPatch } = fixpointStrict((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const { typeResolved, normalizedPatch } = bridgeToNormalizedPatch(
      strict,
      expandedPatch,
      BLOCK_DEFS_BY_TYPE,
    );

    // All PortKeys should use numeric BlockIndex prefix (not string blockId)
    for (const portKey of typeResolved.portTypes.keys()) {
      const firstColon = portKey.indexOf(':');
      const indexStr = portKey.slice(0, firstColon);
      const parsed = parseInt(indexStr, 10);
      expect(Number.isFinite(parsed)).toBe(true);
      expect(parsed).toBeGreaterThanOrEqual(0);
      expect(parsed).toBeLessThan(normalizedPatch.blocks.length);
    }
  });

  it('edge normalization: correct BlockIndex mapping', () => {
    const { strict, expandedPatch } = fixpointStrict((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const { normalizedPatch } = bridgeToNormalizedPatch(
      strict,
      expandedPatch,
      BLOCK_DEFS_BY_TYPE,
    );

    // Should have at least two edges (Const→Add.a, Const→Add.b)
    expect(normalizedPatch.edges.length).toBeGreaterThanOrEqual(2);

    // All edge block indices should be valid
    for (const edge of normalizedPatch.edges) {
      expect(edge.fromBlock).toBeGreaterThanOrEqual(0);
      expect(edge.fromBlock).toBeLessThan(normalizedPatch.blocks.length);
      expect(edge.toBlock).toBeGreaterThanOrEqual(0);
      expect(edge.toBlock).toBeLessThan(normalizedPatch.blocks.length);
    }
  });

  it('edges sorted by (toBlock, toPort, fromBlock, fromPort)', () => {
    const { strict, expandedPatch } = fixpointStrict((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const { normalizedPatch } = bridgeToNormalizedPatch(
      strict,
      expandedPatch,
      BLOCK_DEFS_BY_TYPE,
    );

    // Verify sort order
    for (let i = 1; i < normalizedPatch.edges.length; i++) {
      const prev = normalizedPatch.edges[i - 1];
      const curr = normalizedPatch.edges[i];
      const cmp =
        prev.toBlock !== curr.toBlock
          ? prev.toBlock - curr.toBlock
          : String(prev.toPort).localeCompare(String(curr.toPort)) !== 0
            ? String(prev.toPort).localeCompare(String(curr.toPort))
            : prev.fromBlock !== curr.fromBlock
              ? prev.fromBlock - curr.fromBlock
              : String(prev.fromPort).localeCompare(String(curr.fromPort));
      expect(cmp).toBeLessThanOrEqual(0);
    }
  });

  it('user block port overrides preserved (combineMode)', () => {
    const { strict, expandedPatch } = fixpointStrict((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const { normalizedPatch } = bridgeToNormalizedPatch(
      strict,
      expandedPatch,
      BLOCK_DEFS_BY_TYPE,
    );

    const addBlock = normalizedPatch.blocks.find((bl) => bl.type === 'Add');
    expect(addBlock).toBeDefined();

    // Port overrides from expandedPatch should be preserved
    const origBlock = expandedPatch.blocks.get(addBlock!.id);
    expect(origBlock).toBeDefined();

    const portA = addBlock!.inputPorts.get('a');
    const origPortA = origBlock!.inputPorts.get('a');
    expect(portA).toBeDefined();
    expect(origPortA).toBeDefined();
    expect(portA!.combineMode).toBe(origPortA!.combineMode);
  });

  it('elaborated blocks get ports from BlockDef', () => {
    // Add block has unconnected input 'b' → fixpoint adds default source.
    // That default source block is elaborated (not in expandedPatch).
    const { strict, expandedPatch } = fixpointStrict((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
      // 'b' is unconnected → fixpoint will add a DefaultSource/Const for it
    });

    const { normalizedPatch } = bridgeToNormalizedPatch(
      strict,
      expandedPatch,
      BLOCK_DEFS_BY_TYPE,
    );

    // Find elaborated blocks (not in original Patch)
    const elaboratedBlocks = normalizedPatch.blocks.filter(
      (bl) => !expandedPatch.blocks.has(bl.id as BlockId),
    );

    // At least one elaborated block should exist (default source for 'b')
    expect(elaboratedBlocks.length).toBeGreaterThan(0);

    // Each elaborated block should have ports built from its BlockDef
    for (const block of elaboratedBlocks) {
      const def = BLOCK_DEFS_BY_TYPE.get(block.type);
      if (def) {
        for (const [portId, inputDef] of Object.entries(def.inputs)) {
          if (inputDef.exposedAsPort === false) continue;
          expect(block.inputPorts.has(portId)).toBe(true);
        }
        for (const portId of Object.keys(def.outputs)) {
          expect(block.outputPorts.has(portId)).toBe(true);
        }
      }
    }
  });

  it('synthetic patch has valid structure', () => {
    const { strict, expandedPatch } = fixpointStrict((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const { normalizedPatch } = bridgeToNormalizedPatch(
      strict,
      expandedPatch,
      BLOCK_DEFS_BY_TYPE,
    );

    // The synthetic patch should be a valid Patch
    const synth = normalizedPatch.patch;
    expect(synth.blocks).toBeInstanceOf(Map);
    expect(Array.isArray(synth.edges)).toBe(true);

    // All blocks should be in the synthetic patch
    expect(synth.blocks.size).toBe(normalizedPatch.blocks.length);

    // All edges should reference valid blocks
    for (const edge of synth.edges) {
      expect(synth.blocks.has(edge.from.blockId as BlockId)).toBe(true);
      expect(synth.blocks.has(edge.to.blockId as BlockId)).toBe(true);
    }
  });
});
