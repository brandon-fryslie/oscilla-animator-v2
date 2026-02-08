/**
 * Tests for cardinality adapter obligation creation and fixpoint integration.
 *
 * Verifies that ZipBroadcast clampOne conflicts are resolved structurally
 * via Broadcast adapter insertion at signal/field boundaries.
 */
import { describe, it, expect } from 'vitest';
import { createCardinalityAdapterObligations } from '../create-cardinality-obligations';
import type { CardinalitySolveError } from '../cardinality/solve';
import type { DraftGraph, DraftEdge, DraftBlock } from '../draft-graph';
import { buildDraftGraph } from '../draft-graph';
import { buildPatch } from '../../../graph/Patch';
import { BLOCK_DEFS_BY_TYPE } from '../../../blocks/registry';
import { finalizeNormalizationFixpoint } from '../final-normalization';
import type { ConstraintOrigin } from '../payload-unit/solve';
import type { DraftPortKey } from '../type-facts';

const pk = (s: string) => s as DraftPortKey;

// =============================================================================
// Unit tests: createCardinalityAdapterObligations
// =============================================================================

describe('createCardinalityAdapterObligations', () => {
  function makeGraph(blocks: DraftBlock[], edges: DraftEdge[]): DraftGraph {
    return {
      blocks,
      edges,
      obligations: [],
      meta: { revision: 0, provenance: 'test' },
    };
  }

  const clampOrigin: ConstraintOrigin = { kind: 'blockRule', blockId: 'sig', blockType: 'Sig', rule: 'signalOnly.clampOne' };
  const manyOrigin: ConstraintOrigin = { kind: 'blockRule', blockId: 'arr', blockType: 'Array', rule: 'transform.forceMany' };
  const zipOrigin: ConstraintOrigin = { kind: 'blockRule', blockId: 'add', blockType: 'Add', rule: 'preserve.allowZipSig.zipBroadcast' };

  it('returns empty for no conflicts', () => {
    const g = makeGraph([], []);
    const result = createCardinalityAdapterObligations(g, []);
    expect(result).toHaveLength(0);
  });

  it('returns empty for non-ZipBroadcast errors', () => {
    const g = makeGraph([], []);
    const errors: CardinalitySolveError[] = [
      { kind: 'ClampManyConflict', ports: [pk('a:x:in')], message: 'test' },
      { kind: 'InstanceConflict', ports: [pk('a:x:in')], message: 'test' },
    ];
    const result = createCardinalityAdapterObligations(g, errors);
    expect(result).toHaveLength(0);
  });

  it('identifies boundary edge where to port is in clampOne AND zipPorts', () => {
    // When edge equality merges both endpoints into clampOne group,
    // the boundary edge has both from AND to in clampOneMembers,
    // but to is also in zipPorts (it's part of the conflicting zipBroadcast).
    const g = makeGraph(
      [
        { id: 'sig', type: 'Sig', params: {}, origin: 'user', displayName: 'Sig', domainId: null, role: { kind: 'user', meta: {} } },
        { id: 'phasor', type: 'Phasor', params: {}, origin: 'user', displayName: 'Phasor', domainId: null, role: { kind: 'user', meta: {} } },
      ],
      [
        {
          id: 'e1',
          from: { blockId: 'sig', port: 'time', dir: 'out' },
          to: { blockId: 'phasor', port: 'time', dir: 'in' },
          role: 'userWire',
          origin: 'user',
        },
      ],
    );

    const conflicts: CardinalitySolveError[] = [
      {
        kind: 'ZipBroadcastClampOneConflict',
        // zipPorts includes phasor:time:in (the port that's in both clampOne and zip)
        zipPorts: [pk('phasor:time:in'), pk('phasor:phase:out')],
        // clampOneMembers includes BOTH endpoints (unified by edge equality)
        clampOneMembers: [pk('sig:time:out'), pk('phasor:time:in')],
        manyMembers: [pk('phasor:phase:out')],
        zipOrigin,
        clampOneOrigins: [clampOrigin],
        manyEvidenceOrigins: [manyOrigin],
        message: 'test conflict',
      },
    ];

    const result = createCardinalityAdapterObligations(g, conflicts);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('needsCardinalityAdapter');
    expect(result[0].anchor.edgeId).toBe('e1');
  });

  it('skips edges with elaboration origin', () => {
    const g = makeGraph(
      [
        { id: 'sig', type: 'Sig', params: {}, origin: 'user', displayName: 'Sig', domainId: null, role: { kind: 'user', meta: {} } },
        { id: 'phasor', type: 'Phasor', params: {}, origin: 'user', displayName: 'Phasor', domainId: null, role: { kind: 'user', meta: {} } },
      ],
      [
        {
          id: 'e1',
          from: { blockId: 'sig', port: 'time', dir: 'out' },
          to: { blockId: 'phasor', port: 'time', dir: 'in' },
          role: 'implicitCoerce',
          origin: { kind: 'elaboration', obligationId: 'ob1' as any, role: 'adapter' },
        },
      ],
    );

    const conflicts: CardinalitySolveError[] = [
      {
        kind: 'ZipBroadcastClampOneConflict',
        zipPorts: [pk('phasor:time:in')],
        clampOneMembers: [pk('sig:time:out'), pk('phasor:time:in')],
        manyMembers: [],
        zipOrigin,
        clampOneOrigins: [clampOrigin],
        manyEvidenceOrigins: [],
        message: 'test',
      },
    ];

    const result = createCardinalityAdapterObligations(g, conflicts);
    expect(result).toHaveLength(0);
  });

  it('selects smallest semantic key when multiple candidates exist', () => {
    const g = makeGraph(
      [
        { id: 'sig', type: 'Sig', params: {}, origin: 'user', displayName: 'Sig', domainId: null, role: { kind: 'user', meta: {} } },
        { id: 'a', type: 'A', params: {}, origin: 'user', displayName: 'A', domainId: null, role: { kind: 'user', meta: {} } },
        { id: 'b', type: 'B', params: {}, origin: 'user', displayName: 'B', domainId: null, role: { kind: 'user', meta: {} } },
      ],
      [
        {
          id: 'e2',
          from: { blockId: 'sig', port: 'z', dir: 'out' },
          to: { blockId: 'b', port: 'x', dir: 'in' },
          role: 'userWire',
          origin: 'user',
        },
        {
          id: 'e1',
          from: { blockId: 'sig', port: 'a', dir: 'out' },
          to: { blockId: 'a', port: 'x', dir: 'in' },
          role: 'userWire',
          origin: 'user',
        },
      ],
    );

    const conflicts: CardinalitySolveError[] = [
      {
        kind: 'ZipBroadcastClampOneConflict',
        // Both to-ports are in zipPorts and clampOneMembers (boundary detection)
        zipPorts: [pk('a:x:in'), pk('b:x:in')],
        clampOneMembers: [pk('sig:a:out'), pk('sig:z:out'), pk('a:x:in'), pk('b:x:in')],
        manyMembers: [],
        zipOrigin,
        clampOneOrigins: [clampOrigin],
        manyEvidenceOrigins: [],
        message: 'test',
      },
    ];

    const result = createCardinalityAdapterObligations(g, conflicts);
    expect(result).toHaveLength(1);
    // 'sig:a:out->a:x:in' < 'sig:z:out->b:x:in' lexicographically
    expect(result[0].anchor.edgeId).toBe('e1');
  });
});

// =============================================================================
// Integration tests: fixpoint with Broadcast insertion
// =============================================================================

describe('cardinality adapter fixpoint integration', () => {
  it('InfiniteTimeRoot → Phasor → Add ← Array: no ZipBroadcast errors (transform zip filtered by axisVar)', () => {
    // The root fix is in extract-constraints: transform zipBroadcast only includes
    // axisVar ports, not concrete output ports. This prevents many evidence from
    // propagating through the zipBroadcast to clampOne groups.
    const patch = buildPatch((b) => {
      const timeRoot = b.addBlock('InfiniteTimeRoot');
      const phasor = b.addBlock('Phasor');
      const add = b.addBlock('Add');
      const arr = b.addBlock('Array');

      // Signal chain: InfiniteTimeRoot → Phasor (time input)
      b.wire(timeRoot, 'time', phasor, 'time');
      // Phasor output → Add input a
      b.wire(phasor, 'phase', add, 'a');
      // Array (transform, creates field) → Add input b
      b.wire(arr, 'elements', add, 'b');
    });

    const { graph: dg } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(dg, BLOCK_DEFS_BY_TYPE, { maxIterations: 20 });

    // Should not have ZipBroadcast conflict errors
    const zbErrors = result.diagnostics.filter(
      (d: any) => d.kind === 'CardinalityConstraintError' && d.subKind === 'ZipBroadcastClampOneConflict',
    );
    expect(zbErrors).toHaveLength(0);

    // Should converge
    expect(result.iterations).toBeLessThan(20);
  });

  it('mixed cardinality: clampOne ports stay at one in zipBroadcast group with many evidence', () => {
    // InfiniteTimeRoot → Phasor → Add ← Array
    // InfiniteTimeRoot:time is clampOne (signalOnly)
    // Array:elements is forceMany (transform)
    // Add is preserve+allowZipSig → zipBroadcast over all ports
    // Result: Add:a (from Phasor) stays at one, Add:b (from Array) resolves to many
    // Runtime uses kernelZipSig for mixed cardinality — no Broadcast adapter needed
    const patch = buildPatch((b) => {
      const timeRoot = b.addBlock('InfiniteTimeRoot');
      const phasor = b.addBlock('Phasor');
      const add = b.addBlock('Add');
      const arr = b.addBlock('Array');

      b.wire(timeRoot, 'time', phasor, 'time');
      b.wire(phasor, 'phase', add, 'a');
      b.wire(arr, 'elements', add, 'b');
    });

    const { graph: dg } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(dg, BLOCK_DEFS_BY_TYPE, { maxIterations: 20 });

    // Should converge with no errors
    expect(result.iterations).toBeLessThan(20);
    expect(result.diagnostics.filter((d: any) => d.kind === 'CardinalityConstraintError')).toHaveLength(0);

    // No Broadcast adapter inserted — mixed cardinality handled by runtime
    const broadcastAdapters = result.graph.blocks.filter(
      (b) => b.type === 'Broadcast' && typeof b.origin === 'object' && b.origin.role === 'adapter',
    );
    expect(broadcastAdapters).toHaveLength(0);
  });

  it('no conflict without signal→field boundary: pure signal chain has no Broadcast insertion', () => {
    const patch = buildPatch((b) => {
      const timeRoot = b.addBlock('InfiniteTimeRoot');
      const phasor = b.addBlock('Phasor');
      const add = b.addBlock('Add');

      b.wire(timeRoot, 'time', phasor, 'time');
      b.wire(phasor, 'phase', add, 'a');
    });

    const { graph: dg } = buildDraftGraph(patch);
    const result = finalizeNormalizationFixpoint(dg, BLOCK_DEFS_BY_TYPE, { maxIterations: 20 });

    // No Broadcast blocks inserted (no transform → no field cardinality)
    const broadcastBlocks = result.graph.blocks.filter(
      (b) => b.type === 'Broadcast' && typeof b.origin === 'object' && b.origin.role === 'adapter',
    );
    expect(broadcastBlocks).toHaveLength(0);
  });
});
