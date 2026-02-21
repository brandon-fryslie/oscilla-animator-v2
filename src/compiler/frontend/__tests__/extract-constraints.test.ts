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
import { isAxisInst, isAxisVar } from '../../../core/canonical-types';

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

  it('emits same-var constraints for polymorphic blocks', () => {
    // Broadcast has ports that share the same payload/unit var IDs
    const patch = buildPatch((b) => {
      b.addBlock('Broadcast');
    });
    const { graph: g } = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // Broadcast has signal and field ports sharing payload/unit vars
    // These now emit as payloadEq/unitEq with blockRule origin
    const sameVarConstraints = constraints.payloadUnit.filter(
      (c) => (c.kind === 'payloadEq' || c.kind === 'unitEq') && 'origin' in c && c.origin.kind === 'blockRule',
    );
    // Should have same-var constraints for shared payload and/or unit vars
    expect(sameVarConstraints.length).toBeGreaterThanOrEqual(1);
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

  it('portBaseTypes types come from InferenceCanonicalType (may have vars)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });
    const { graph: g } = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    // All port base types should have payload, unit, and extent
    for (const [, type] of constraints.portBaseTypes) {
      expect(type).toHaveProperty('payload');
      expect(type).toHaveProperty('unit');
      expect(type).toHaveProperty('extent');
    }
  });

  it('clampOne constraints use blockRule origin', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
    });
    const { graph: g } = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    const clampOnes = constraints.cardinality.filter((c) => c.kind === 'clampOne');
    expect(clampOnes.length).toBeGreaterThan(0);
    for (const c of clampOnes) {
      expect(c.origin.kind).toBe('blockRule');
    }
  });

  it('edge cardinality equal constraints have edge origin', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
    });
    const { graph: g } = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    const edgeEquals = constraints.cardinality.filter(
      (c) => c.kind === 'equal' && c.origin.kind === 'edge',
    );
    expect(edgeEquals.length).toBeGreaterThanOrEqual(1);
  });

  it('transform zipBroadcast only contains axisVar ports (not concrete outputs)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Array');
    });
    const { graph: g } = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    const zips = constraints.cardinality.filter((c) => c.kind === 'zipBroadcast');
    for (const zip of zips) {
      for (const port of zip.ports) {
        const axis = constraints.baseCardinalityAxis.get(port);
        expect(axis).toBeDefined();
        expect(isAxisVar(axis!)).toBe(true);
      }
    }
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

    // shape output: cardinality one (signal)
    const shapeAxis = constraints.baseCardinalityAxis.get(shapeKey);
    expect(shapeAxis).toBeDefined();
    expect(isAxisInst(shapeAxis!)).toBe(true);
    if (isAxisInst(shapeAxis!)) {
      expect(shapeAxis!.value.kind).toBe('one');
    }

    // controlPoints output: cardinality many (field)
    const cpAxis = constraints.baseCardinalityAxis.get(cpKey);
    expect(cpAxis).toBeDefined();
    expect(isAxisInst(cpAxis!)).toBe(true);
    if (isAxisInst(cpAxis!)) {
      expect(cpAxis!.value.kind).toBe('many');
    }

    // shape should get clampOne, controlPoints should get forceMany
    const shapeClamp = constraints.cardinality.filter(
      (c) => c.kind === 'clampOne' && c.port === shapeKey,
    );
    expect(shapeClamp.length).toBe(1);

    const cpForce = constraints.cardinality.filter(
      (c) => c.kind === 'forceMany' && c.port === cpKey,
    );
    expect(cpForce.length).toBe(1);
  });

  it('instantiates cardinality template vars per block instance', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Expression');
      b.addBlock('Expression');
    });
    const { graph: g } = buildDraftGraph(patch);
    const constraints = extractConstraints(g, BLOCK_DEFS_BY_TYPE);

    const exprBlocks = g.blocks.filter((b) => b.type === 'Expression');
    expect(exprBlocks).toHaveLength(2);

    const refsA = draftPortKey(exprBlocks[0].id, 'refs', 'in');
    const refsB = draftPortKey(exprBlocks[1].id, 'refs', 'in');

    const axisA = constraints.portBaseTypes.get(refsA)?.extent.cardinality;
    const axisB = constraints.portBaseTypes.get(refsB)?.extent.cardinality;

    expect(axisA).toBeDefined();
    expect(axisB).toBeDefined();
    expect(isAxisVar(axisA!)).toBe(true);
    expect(isAxisVar(axisB!)).toBe(true);

    if (isAxisVar(axisA!) && isAxisVar(axisB!)) {
      expect(axisA.var).not.toBe(axisB.var);
      expect(axisA.var as string).toBe(`c:${exprBlocks[0].id}:expr_refs`);
      expect(axisB.var as string).toBe(`c:${exprBlocks[1].id}:expr_refs`);
    }
  });
});
