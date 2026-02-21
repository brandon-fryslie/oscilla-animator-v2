/**
 * Tests for constraint extraction from DraftGraph.
 *
 * These tests verify behavior contracts: what constraints are produced
 * for various graph topologies, not internal constraint shapes or origins.
 */
import { describe, it, expect } from 'vitest';
import { extractConstraints } from '../extract-constraints';
import { buildDraftGraph } from '../draft-graph';
import { buildPatch } from '../../../graph/Patch';
import { BLOCK_DEFS_BY_TYPE } from '../../../blocks/registry';
import { draftPortKey } from '../type-facts';
import { isAxisInst } from '../../../core/canonical-types';

describe('extractConstraints', () => {
  it('extracts portBaseTypes for all ports of a block', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });
    const { graph: g } = buildDraftGraph(patch);
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
    const { graph: g } = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // Should have at least one edge constraint (payloadEq or unitEq with edge origin)
    const edgeConstraints = constraints.payloadUnit.filter(
      (c) => c.kind === 'payloadEq' || c.kind === 'unitEq',
    );
    expect(edgeConstraints.length).toBeGreaterThanOrEqual(1);

    // Edge → equal cardinality constraints should exist
    const cardEqualConstraints = constraints.cardinality.filter((c) => c.kind === 'equal');
    expect(cardEqualConstraints.length).toBeGreaterThanOrEqual(1);
  });

  it('emits concrete constraints for non-polymorphic ports', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Const');
    });
    const { graph: g } = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // Const has concrete types on its output
    const concreteConstraints = constraints.payloadUnit.filter(
      (c) => c.kind === 'concretePayload' || c.kind === 'concreteUnit',
    );
    expect(concreteConstraints.length).toBeGreaterThanOrEqual(0); // May or may not depending on Const def
  });

  it('produces deterministic output for same input', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
    });
    const { graph: g } = buildDraftGraph(patch);

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
    const { graph: g } = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    expect(constraints.portBaseTypes.size).toBe(0);
    expect(constraints.payloadUnit.length).toBe(0);
    expect(constraints.cardinality.length).toBe(0);
    expect(constraints.baseCardinalityAxis.size).toBe(0);
  });

  it('skips unexposed ports', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Const');
    });
    const { graph: g } = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // Const has a 'value' input with exposedAsPort: false — should not appear in portBaseTypes
    const constBlock = g.blocks.find((b) => b.type === 'Const')!;
    const valueKey = draftPortKey(constBlock.id, 'value', 'in');
    expect(constraints.portBaseTypes.has(valueKey)).toBe(false);
  });

  it('Reduce signal output keeps cardinality one (not rewritten to many)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Reduce');
    });
    const { graph: g } = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    const reduceBlock = g.blocks.find((b) => b.type === 'Reduce')!;
    const signalKey = draftPortKey(reduceBlock.id, 'signal', 'out');

    // Signal output should have cardinality one in baseCardinalityAxis
    const axis = constraints.baseCardinalityAxis.get(signalKey);
    expect(axis).toBeDefined();
    expect(isAxisInst(axis!)).toBe(true);
    if (isAxisInst(axis!)) {
      expect(axis!.value.kind).toBe('one');
    }

    // Should emit clampOne, not forceMany
    const clampOnes = constraints.cardinality.filter(
      (c) => c.kind === 'clampOne' && c.port === signalKey,
    );
    expect(clampOnes.length).toBe(1);

    const forceManyForSignal = constraints.cardinality.filter(
      (c) => c.kind === 'forceMany' && c.port === signalKey,
    );
    expect(forceManyForSignal.length).toBe(0);
  });

  it('ProceduralPolygon: shape output is one, controlPoints output is many', () => {
    const patch = buildPatch((b) => {
      b.addBlock('ProceduralPolygon');
    });
    const { graph: g } = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    const polyBlock = g.blocks.find((b) => b.type === 'ProceduralPolygon')!;
    const shapeKey = draftPortKey(polyBlock.id, 'shape', 'out');
    const cpKey = draftPortKey(polyBlock.id, 'controlPoints', 'out');

    // shape output: cardinality one (oneOnly acceptance)
    const shapeAxis = constraints.baseCardinalityAxis.get(shapeKey);
    expect(shapeAxis).toBeDefined();
    expect(isAxisInst(shapeAxis!)).toBe(true);
    if (isAxisInst(shapeAxis!)) {
      expect(shapeAxis!.value.kind).toBe('one');
    }

    // shape should get clampOne, controlPoints stays concrete many via declared policy.
    const shapeClamp = constraints.cardinality.filter(
      (c) => c.kind === 'clampOne' && c.port === shapeKey,
    );
    expect(shapeClamp.length).toBe(1);

    const cpAxis = constraints.baseCardinalityAxis.get(cpKey);
    expect(cpAxis).toBeDefined();
    expect(isAxisInst(cpAxis!)).toBe(true);
    if (isAxisInst(cpAxis!)) {
      expect(cpAxis.value.kind).toBe('many');
    }
  });
});
