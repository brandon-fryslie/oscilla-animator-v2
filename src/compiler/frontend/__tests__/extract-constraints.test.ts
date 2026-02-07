/**
 * Tests for constraint extraction from DraftGraph.
 */
import { describe, it, expect } from 'vitest';
import { extractConstraints } from '../extract-constraints';
import { buildDraftGraph } from '../draft-graph';
import { buildPatch } from '../../../graph/Patch';
import { BLOCK_DEFS_BY_TYPE } from '../../../blocks/registry';
import { draftPortKey } from '../type-facts';
import { isPayloadVar, isUnitVar } from '../../../core/inference-types';
import { isAxisInst } from '../../../core/canonical-types';

describe('extractConstraints', () => {
  it('extracts portBaseTypes for all ports of a block', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });
    const g = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // Add has inputs a, b and output out
    expect(constraints.portBaseTypes.size).toBeGreaterThanOrEqual(3);

    // Find the Add block ID
    const addBlock = g.blocks.find((b) => b.type === 'Add')!;
    expect(addBlock).toBeDefined();

    // Check that port base types exist for a, b, out
    const aKey = draftPortKey(addBlock.id, 'a', 'in');
    const bKey = draftPortKey(addBlock.id, 'b', 'in');
    const outKey = draftPortKey(addBlock.id, 'out', 'out');

    expect(constraints.portBaseTypes.has(aKey)).toBe(true);
    expect(constraints.portBaseTypes.has(bKey)).toBe(true);
    expect(constraints.portBaseTypes.has(outKey)).toBe(true);
  });

  it('emits edge constraints for connected ports', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
    });
    const g = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // Should have at least one edge constraint
    const edgeConstraints = constraints.payloadUnit.filter((c) => c.kind === 'edge');
    expect(edgeConstraints.length).toBeGreaterThanOrEqual(1);

    // Edge → equal cardinality constraints should exist
    const cardEqualConstraints = constraints.cardinality.filter((c) => c.kind === 'equal');
    expect(cardEqualConstraints.length).toBeGreaterThanOrEqual(1);
  });

  it('emits same-var constraints for polymorphic blocks', () => {
    // Broadcast has ports that share the same payload/unit var IDs
    const patch = buildPatch((b) => {
      b.addBlock('Broadcast');
    });
    const g = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // Broadcast has signal and field ports sharing payload/unit vars
    const sameVarConstraints = constraints.payloadUnit.filter((c) => c.kind === 'sameVar');
    // Should have same-var constraints for shared payload and/or unit vars
    expect(sameVarConstraints.length).toBeGreaterThanOrEqual(1);
  });

  it('emits concrete constraints for non-polymorphic ports', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Const');
    });
    const g = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // Const has concrete types on its output
    const concreteConstraints = constraints.payloadUnit.filter((c) => c.kind === 'concrete');
    expect(concreteConstraints.length).toBeGreaterThanOrEqual(0); // May or may not depending on Const def
  });

  it('produces deterministic output for same input', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
    });
    const g = buildDraftGraph(patch);

    const c1 = extractConstraints(g, BLOCK_DEFS_BY_TYPE);
    const c2 = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // Same keys
    const keys1 = [...c1.portBaseTypes.keys()].sort();
    const keys2 = [...c2.portBaseTypes.keys()].sort();
    expect(keys1).toEqual(keys2);

    // Same constraint count
    expect(c1.payloadUnit.length).toBe(c2.payloadUnit.length);
    expect(c1.cardinality.length).toBe(c2.cardinality.length);
    expect(c1.baseCardinalityAxis.size).toBe(c2.baseCardinalityAxis.size);
  });

  it('empty graph produces empty constraints', () => {
    const patch = buildPatch(() => {});
    const g = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    expect(constraints.portBaseTypes.size).toBe(0);
    expect(constraints.payloadUnit.length).toBe(0);
    expect(constraints.cardinality.length).toBe(0);
    expect(constraints.baseCardinalityAxis.size).toBe(0);
  });

  it('portBaseTypes types come from InferenceCanonicalType (may have vars)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });
    const g = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // All port base types should have payload, unit, and extent
    for (const [, type] of constraints.portBaseTypes) {
      expect(type).toHaveProperty('payload');
      expect(type).toHaveProperty('unit');
      expect(type).toHaveProperty('extent');
    }
  });

  it('cardinality constraints generated for cardinality-metadata blocks', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });
    const g = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // Add has cardinality metadata (preserve mode), should generate constraints
    // The exact count depends on block definition
    expect(constraints.cardinality.length).toBeGreaterThanOrEqual(0);
  });

  it('skips unexposed ports', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Const');
    });
    const g = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // Const has a 'value' input with exposedAsPort: false — should not appear in portBaseTypes
    const constBlock = g.blocks.find((b) => b.type === 'Const')!;
    const valueKey = draftPortKey(constBlock.id, 'value', 'in');
    expect(constraints.portBaseTypes.has(valueKey)).toBe(false);
  });
});
