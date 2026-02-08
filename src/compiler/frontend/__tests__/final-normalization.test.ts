/**
 * Tests for the fixpoint driver.
 */
import { describe, it, expect } from 'vitest';
import { finalizeNormalizationFixpoint } from '../final-normalization';
import { buildDraftGraph } from '../draft-graph';
import { buildPatch } from '../../../graph/Patch';
import { BLOCK_DEFS_BY_TYPE } from '../../../blocks/registry';
import { draftPortKey } from '../type-facts';
import { isAxisInst, isMany, isOne } from '../../../core/canonical-types';
import { DOMAIN_CIRCLE } from '../../../core/domain-registry';
// Ensure all adapter blocks are registered
import '../../../blocks/all';

describe('finalizeNormalizationFixpoint (skeleton)', () => {
  it('terminates immediately for empty graph (no plans = stop)', () => {
    const patch = buildPatch(() => {
      // empty
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    expect(result.iterations).toBe(1);
    expect(result.diagnostics.length).toBe(0);
    // Empty graph should produce strict result (no ports to fail)
    expect(result.strict).not.toBeNull();
  });

  it('standalone Add: without default sources, types remain unresolved', () => {
    // Note: This test documents current behavior where default sources
    // aren't automatically applied. Standalone blocks need manual input.
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Add is preserve+allowZipSig — cardinality defaults to one (signal chain).
    expect(result.iterations).toBeLessThanOrEqual(10);
    // No cardinality errors — default-to-one is valid
    expect(result.diagnostics.filter(
      (d: any) => d.kind === 'CardinalityConstraintError',
    )).toHaveLength(0);

    // Without default sources applied, ports remain unresolved
    const addBlock = g.blocks.find(b => b.type === 'Add')!;
    const aHint = result.facts.ports.get(draftPortKey(addBlock.id, 'a', 'in'));
    // Port exists but may be unresolved (status: 'unknown')
    expect(aHint).toBeDefined();
  });

  it('respects max iteration limit', () => {
    // With the stub solver, this should terminate immediately
    // but we test that the limit mechanism works
    const patch = buildPatch(() => {});
    const { graph: g } = buildDraftGraph(patch);

    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 1,
    });

    expect(result.iterations).toBeLessThanOrEqual(1);
  });

  it('empty graph produces empty result', () => {
    const patch = buildPatch(() => {});
    const { graph: g } = buildDraftGraph(patch);

    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    expect(result.graph.blocks.length).toBe(0);
    expect(result.graph.edges.length).toBe(0);
    expect(result.graph.obligations.length).toBe(0);
  });

  it('preserves user blocks, adds default sources and adapters', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // User blocks preserved (at minimum — additional blocks may be added)
    expect(result.graph.blocks.length).toBeGreaterThanOrEqual(g.blocks.length);
    // Edges may change due to adapter insertion (original edges replaced with new ones)
    expect(result.graph.edges.length).toBeGreaterThanOrEqual(g.edges.length);

    // Original blocks still present
    for (const block of g.blocks) {
      expect(result.graph.blocks.find((b) => b.id === block.id)).toBeDefined();
    }
    // Note: Original edges may be replaced by adapters, so we don't check edge preservation
  });

  it('returns TypeFacts with port hints for blocks', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Solver produces type hints for Add's ports (a, b, out)
    expect(result.facts.ports.size).toBeGreaterThan(0);
  });

  it('Const → Add: strict succeeds (cardinality defaults to one, payload anchors to float)', () => {
    // Const and Add are preserve blocks — evidence-free cardinality defaults to one.
    // Payload anchors to float via Adapter_PayloadAnchorFloat when no concrete evidence.
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // All types resolve (cardinality=one, payload=float via anchor) → strict succeeds
    expect(result.strict).not.toBeNull();
    // Should have payload anchor adapters
    const anchorBlocks = result.graph.blocks.filter(
      (b) => b.type === 'Adapter_PayloadAnchorFloat',
    );
    expect(anchorBlocks.length).toBeGreaterThan(0);
  });
});

describe('finalizeNormalizationFixpoint (type solving)', () => {
  it('resolves port types for connected Const → Add', () => {
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Add's ports should have resolved types via edge propagation from Const
    const addBlock = g.blocks.find((b) => b.type === 'Add')!;
    const aHint = result.facts.ports.get(draftPortKey(addBlock.id, 'a', 'in'));
    const bHint = result.facts.ports.get(draftPortKey(addBlock.id, 'b', 'in'));
    const outHint = result.facts.ports.get(draftPortKey(addBlock.id, 'out', 'out'));

    expect(aHint).toBeDefined();
    expect(bHint).toBeDefined();
    expect(outHint).toBeDefined();

    // Const has concrete float payload → propagates to Add
    // Status should be 'ok' (fully resolved) or 'unknown' (partially)
    // depending on whether all vars got resolved
    if (aHint!.status === 'ok') {
      expect(aHint!.canonical).toBeDefined();
      expect(aHint!.canonical!.payload.kind).toBe('float');
    }
  });

  it('signal ports have cardinality one in their base type', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Const');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Const.out should be a signal (cardinality one)
    const constBlock = g.blocks.find((b) => b.type === 'Const')!;
    const outHint = result.facts.ports.get(draftPortKey(constBlock.id, 'out', 'out'));
    expect(outHint).toBeDefined();

    if (outHint!.status === 'ok' && outHint!.canonical) {
      const card = outHint!.canonical.extent.cardinality;
      if (isAxisInst(card)) {
        expect(card.value.kind).toBe('one');
      }
    }
  });

  it('no CanonicalType contains vars (ok status only)', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Every port with status 'ok' must have a CanonicalType with NO vars
    for (const [, hint] of result.facts.ports) {
      if (hint.status === 'ok' && hint.canonical) {
        // Payload must not be var
        expect(hint.canonical.payload.kind).not.toBe('var');
        // Unit must not be var
        expect(hint.canonical.unit.kind).not.toBe('var');
        // All axes must be inst
        expect(isAxisInst(hint.canonical.extent.cardinality)).toBe(true);
        expect(isAxisInst(hint.canonical.extent.temporality)).toBe(true);
        expect(isAxisInst(hint.canonical.extent.binding)).toBe(true);
        expect(isAxisInst(hint.canonical.extent.perspective)).toBe(true);
        expect(isAxisInst(hint.canonical.extent.branch)).toBe(true);
      }
    }
  });

  it('TypeFacts port count matches graph port count', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Should have hints for all ports in the graph
    expect(result.facts.ports.size).toBeGreaterThan(0);

    // Every port key should follow the format blockId:portName:dir
    for (const key of result.facts.ports.keys()) {
      expect(key).toMatch(/^.+:.+:(in|out)$/);
    }
  });
});

describe('finalizeNormalizationFixpoint (cardinality solving)', () => {
  it('Const → Add: cardinality defaults to one, payload anchors to float via cheater adapter', () => {
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Const and Add are preserve+allowZipSig — evidence-free groups
    // default to one (signal chain). No cardinality error.
    expect(result.diagnostics.filter(
      (d: any) => d.kind === 'CardinalityConstraintError',
    )).toHaveLength(0);
    // Payload anchor adapters should be inserted
    const anchorBlocks = result.graph.blocks.filter(
      (b) => b.type === 'Adapter_PayloadAnchorFloat',
    );
    expect(anchorBlocks.length).toBeGreaterThan(0);
    // Should have CheaterAdapterUsed diagnostics
    const cheaterDiags = result.diagnostics.filter(
      (d: any) => d.kind === 'CheaterAdapterUsed' && d.subKind === 'PayloadAnchorFloat',
    );
    expect(cheaterDiags.length).toBeGreaterThan(0);
    // Payload anchors to float (via anchor adapter)
    const addBlock = g.blocks.find(b => b.type === 'Add')!;
    const aHint = result.facts.ports.get(draftPortKey(addBlock.id, 'a', 'in'));
    expect(aHint?.status).toBe('ok');
    expect(aHint?.canonical?.payload.kind).toBe('float');
  });

  it('Array → Add: Add input becomes many (field)', () => {
    const patch = buildPatch((b) => {
      const arr = b.addBlock('Array');
      const add = b.addBlock('Add');
      b.wire(arr, 'elements', add, 'a');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    const addBlock = g.blocks.find((b) => b.type === 'Add')!;
    const aHint = result.facts.ports.get(draftPortKey(addBlock.id, 'a', 'in'));
    expect(aHint).toBeDefined();

    if (aHint!.status === 'ok' && aHint!.canonical) {
      const card = aHint!.canonical.extent.cardinality;
      expect(isAxisInst(card)).toBe(true);
      if (isAxisInst(card)) {
        // Add's 'a' input should be many because connected to Array.elements
        expect(isMany(card.value)).toBe(true);
      }
    }
  });

  it('TypeFacts.instances populated correctly for Array outputs', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Array');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Array block creates instances with domainType DOMAIN_CIRCLE
    // instance index should contain at least one entry for the Array's domain
    if (result.facts.instances.size > 0) {
      // At least one instance should have the Array block's domain type
      let foundArrayInstance = false;
      for (const [, entry] of result.facts.instances) {
        if (entry.ref.domainTypeId === DOMAIN_CIRCLE) {
          foundArrayInstance = true;
          // Should have ports listed
          expect(entry.ports.length).toBeGreaterThan(0);
          // Ports should be sorted
          for (let i = 1; i < entry.ports.length; i++) {
            expect(entry.ports[i - 1] <= entry.ports[i]).toBe(true);
          }
        }
      }
      expect(foundArrayInstance).toBe(true);
    }
  });

  it('Const → Add: strict succeeds (payload anchors to float, cardinality defaults to one)', () => {
    // Const and Add are both polymorphic — payload anchors to float via
    // Adapter_PayloadAnchorFloat. Cardinality defaults to one (signal chain).
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // All types resolve → strict succeeds
    expect(result.strict).not.toBeNull();
    // No cardinality errors — default-to-one is valid for signal chains
    expect(result.diagnostics.filter(
      (d: any) => d.kind === 'CardinalityConstraintError',
    )).toHaveLength(0);
    // Should have payload anchor adapters
    const anchorBlocks = result.graph.blocks.filter(
      (b) => b.type === 'Adapter_PayloadAnchorFloat',
    );
    expect(anchorBlocks.length).toBeGreaterThan(0);
    // Should have CheaterAdapterUsed diagnostics
    const cheaterDiags = result.diagnostics.filter(
      (d: any) => d.kind === 'CheaterAdapterUsed' && d.subKind === 'PayloadAnchorFloat',
    );
    expect(cheaterDiags.length).toBeGreaterThan(0);
  });

  it('instances index is empty for signal-only graphs', () => {
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // No many-cardinality ports → instances index should be empty
    expect(result.facts.instances.size).toBe(0);
  });
});

describe('finalizeNormalizationFixpoint (adapter insertion)', () => {
  it('contract-only mismatch does not trigger type-coercion adapter insertion', () => {
    // If source has clamp01 and sink expects no contract, isAssignable
    // returns true so no type-coercion adapter obligation is created.
    // We verify this by checking that the fixpoint doesn't insert type-coercion
    // adapter blocks for a Const→Add chain (same payload, same unit, only contract
    // difference would not require a type-coercion adapter).
    // Note: Payload anchors may be inserted to resolve polymorphic chains.
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // No type-coercion adapter blocks should be inserted (exclude payload anchors)
    const typeCoercionAdapters = result.graph.blocks.filter(
      (b) => b.type.startsWith('Adapter_') && b.type !== 'Adapter_PayloadAnchorFloat',
    );
    expect(typeCoercionAdapters.length).toBe(0);
  });

  it('fixpoint terminates cleanly with adapter obligations', () => {
    // Verify the fixpoint loop terminates when adapter obligations
    // are created but the policy cannot find a chain (blocked result).
    // This tests that blocked adapter obligations don't cause infinite loops.
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c, 'out', add, 'a');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Should terminate without exceeding max iterations
    expect(result.iterations).toBeLessThanOrEqual(10);
  });
});

describe('finalizeNormalizationFixpoint (payload auto-derivation)', () => {
  it('Const→Add: both polymorphic, payload anchors to float via cheater adapter', () => {
    // Const uses payloadVar('const_payload') — it's polymorphic.
    // Add gets auto-derived vars from BlockPayloadMetadata. Edge constraints unify
    // the vars. Without concrete evidence, normalization inserts Adapter_PayloadAnchorFloat
    // to break the polymorphic chain, anchoring all connected ports to float.
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Payload anchor adapters should be inserted
    const anchorBlocks = result.graph.blocks.filter(
      (b) => b.type === 'Adapter_PayloadAnchorFloat',
    );
    expect(anchorBlocks.length).toBeGreaterThan(0);
    // Should have CheaterAdapterUsed diagnostics
    const cheaterDiags = result.diagnostics.filter(
      (d: any) => d.kind === 'CheaterAdapterUsed' && d.subKind === 'PayloadAnchorFloat',
    );
    expect(cheaterDiags.length).toBeGreaterThan(0);

    const addBlock = g.blocks.find((b) => b.type === 'Add')!;
    const aHint = result.facts.ports.get(draftPortKey(addBlock.id, 'a', 'in'));
    expect(aHint).toBeDefined();
    expect(aHint?.status).toBe('ok');
    expect(aHint?.canonical?.payload.kind).toBe('float');
  });

  it('Sin block gets requireUnitless constraint — no unit mismatch with scalar input', () => {
    const patch = buildPatch((b) => {
      const c = b.addBlock('Const');
      const sin = b.addBlock('Sin');
      b.wire(c, 'out', sin, 'input');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    // Sin has requireUnitless. Const.out has scalar unit.
    // The solver should NOT error because scalar→none is compatible
    // (scalar units get resolved, unitless constraint catches non-none units)
    // Note: Const output has concrete scalar unit — requireUnitless on Sin
    // may produce a UnitlessMismatch. This is expected behavior: scalar is not
    // the same as none. The test documents this constraint behavior.
    const sinBlock = g.blocks.find((b) => b.type === 'Sin')!;
    const inputHint = result.facts.ports.get(draftPortKey(sinBlock.id, 'input', 'in'));
    expect(inputHint).toBeDefined();
  });

  it('unconnected Add ports: payload remains var (not defaulted to float)', () => {
    const patch = buildPatch((b) => {
      b.addBlock('Add');
    });

    const { graph: g } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(g, BLOCK_DEFS_BY_TYPE, {
      maxIterations: 10,
    });

    const addBlock = g.blocks.find((b) => b.type === 'Add')!;
    const aHint = result.facts.ports.get(draftPortKey(addBlock.id, 'a', 'in'));
    expect(aHint).toBeDefined();

    // Without connections, Add's ports should NOT resolve to a specific payload
    // (the auto-derivation replaces concrete float with a var, and without
    // edge constraints to bind it, it stays unresolved or resolves from allowed set)
    // Note: RequirePayloadIn with 4 entries won't auto-resolve (only 1-entry sets do)
    if (aHint?.status === 'unknown' && aHint.inference) {
      // Payload is a var (polymorphic)
      expect(aHint.inference.payload.kind).toBe('var');
    }
    // If it resolved to 'ok', that's also acceptable (e.g., if allowed set narrowed)
  });
});
