/**
 * Pass2 Adapter Materialization Tests
 *
 * Verifies that pass2Adapters() correctly inserts adapter blocks
 * when unit mismatches are detected on edges.
 */

import { describe, it, expect } from 'vitest';
import { pass2Adapters } from '../../compiler/frontend/normalize-adapters';
import { buildPatch, type Patch } from '../Patch';
import {
  canonicalType,
  unitPhase01,
  unitRadians,
  unitScalar,
} from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../../core/canonical-types';
import { registerBlock } from '../../blocks/registry';

// Ensure adapter blocks are registered
// Import blocks to trigger registration
import '../../blocks/all';


// =============================================================================
// Test block registrations
// =============================================================================

// Source block that outputs phase01
registerBlock({
  type: 'TestAdapterPhaseSource',
  label: 'Phase Source',
  category: 'test',
  description: 'Test: outputs float:phase01',
  form: 'primitive',
  capability: 'pure',
  inputs: {},
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitPhase01()) },
  },
  lower: () => ({ outputsById: {} }),
});

// Sink block that expects radians
registerBlock({
  type: 'TestAdapterRadiansSink',
  label: 'Radians Sink',
  category: 'test',
  description: 'Test: expects float:radians',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitRadians()) },
  },
  outputs: {},
  lower: () => ({ outputsById: {} }),
});

// Sink block that expects phase01
registerBlock({
  type: 'TestAdapterPhaseSink',
  label: 'Phase Sink',
  category: 'test',
  description: 'Test: expects float:phase01',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitPhase01()) },
  },
  outputs: {},
  lower: () => ({ outputsById: {} }),
});

// Source block that outputs scalar
registerBlock({
  type: 'TestAdapterScalarSource',
  label: 'Scalar Source',
  category: 'test',
  description: 'Test: outputs float:scalar',
  form: 'primitive',
  capability: 'pure',
  inputs: {},
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitScalar()) },
  },
  lower: () => ({ outputsById: {} }),
});

// =============================================================================
// Tests
// =============================================================================

describe('pass2Adapters - Adapter Materialization', () => {
  describe('adapter insertion for unit mismatches', () => {
    it('inserts Adapter_PhaseToRadians when phase01→radians mismatch detected', () => {
      const patch = buildPatch((b) => {
        const src = b.addBlock('TestAdapterPhaseSource');
        const sink = b.addBlock('TestAdapterRadiansSink');
        b.wire(src, 'out', sink, 'in');
      });

      const result = pass2Adapters(patch);
      expect(result.kind).toBe('ok');

      const expanded = (result as { kind: 'ok'; patch: Patch }).patch;

      // Should have 3 blocks: source, adapter, sink
      expect(expanded.blocks.size).toBe(3);

      // Should have 2 edges (source→adapter, adapter→sink) instead of 1
      expect(expanded.edges.length).toBe(2);

      // Find the adapter block
      const adapterBlock = Array.from(expanded.blocks.values()).find(
        (block) => block.type === 'Adapter_PhaseToRadians'
      );
      expect(adapterBlock).toBeDefined();
      expect(adapterBlock!.role.kind).toBe('derived');
    });

    it('inserts Adapter_ScalarToPhase01 when scalar→phase01 mismatch detected', () => {
      const patch = buildPatch((b) => {
        const src = b.addBlock('TestAdapterScalarSource');
        const sink = b.addBlock('TestAdapterPhaseSink');
        b.wire(src, 'out', sink, 'in');
      });

      const result = pass2Adapters(patch);
      expect(result.kind).toBe('ok');

      const expanded = (result as { kind: 'ok'; patch: Patch }).patch;
      const adapterBlock = Array.from(expanded.blocks.values()).find(
        (block) => block.type === 'Adapter_ScalarToPhase01'
      );
      expect(adapterBlock).toBeDefined();
    });
  });

  describe('no adapter needed when types match', () => {
    it('returns patch unchanged when source and sink units match', () => {
      const patch = buildPatch((b) => {
        const src = b.addBlock('TestAdapterPhaseSource');
        const sink = b.addBlock('TestAdapterPhaseSink');
        b.wire(src, 'out', sink, 'in');
      });

      const result = pass2Adapters(patch);
      expect(result.kind).toBe('ok');

      const expanded = (result as { kind: 'ok'; patch: Patch }).patch;

      // No adapter inserted — same blocks and edges
      expect(expanded.blocks.size).toBe(2);
      expect(expanded.edges.length).toBe(1);
    });
  });

  describe('adapter block properties', () => {
    it('adapter block has deterministic ID based on edge ID', () => {
      const patch = buildPatch((b) => {
        const src = b.addBlock('TestAdapterPhaseSource');
        const sink = b.addBlock('TestAdapterRadiansSink');
        b.wire(src, 'out', sink, 'in');
      });

      const result1 = pass2Adapters(patch);
      const result2 = pass2Adapters(patch);

      expect(result1.kind).toBe('ok');
      expect(result2.kind).toBe('ok');

      const expanded1 = (result1 as { kind: 'ok'; patch: Patch }).patch;
      const expanded2 = (result2 as { kind: 'ok'; patch: Patch }).patch;

      const adapter1 = Array.from(expanded1.blocks.values()).find(
        (block) => block.type === 'Adapter_PhaseToRadians'
      );
      const adapter2 = Array.from(expanded2.blocks.values()).find(
        (block) => block.type === 'Adapter_PhaseToRadians'
      );

      // Same edge → same adapter ID (deterministic)
      expect(adapter1!.id).toBe(adapter2!.id);
    });

    it('adapter block has derived role with adapter meta', () => {
      const patch = buildPatch((b) => {
        const src = b.addBlock('TestAdapterPhaseSource');
        const sink = b.addBlock('TestAdapterRadiansSink');
        b.wire(src, 'out', sink, 'in');
      });

      const result = pass2Adapters(patch);
      const expanded = (result as { kind: 'ok'; patch: Patch }).patch;

      const adapterBlock = Array.from(expanded.blocks.values()).find(
        (block) => block.type === 'Adapter_PhaseToRadians'
      );

      expect(adapterBlock!.role).toEqual({
        kind: 'derived',
        meta: {
          kind: 'adapter',
          edgeId: expect.any(String),
          adapterType: 'Adapter_PhaseToRadians',
        },
      });
    });

    it('adapter block inherits domainId from target block', () => {
      const patch = buildPatch((b) => {
        const src = b.addBlock('TestAdapterPhaseSource');
        const sink = b.addBlock('TestAdapterRadiansSink', { domainId: 'my-domain' });
        b.wire(src, 'out', sink, 'in');
      });

      const result = pass2Adapters(patch);
      const expanded = (result as { kind: 'ok'; patch: Patch }).patch;

      const adapterBlock = Array.from(expanded.blocks.values()).find(
        (block) => block.type === 'Adapter_PhaseToRadians'
      );

      expect(adapterBlock!.domainId).toBe('my-domain');
    });
  });

  describe('edge splitting', () => {
    it('original edge is replaced by two edges through adapter', () => {
      const patch = buildPatch((b) => {
        const src = b.addBlock('TestAdapterPhaseSource');
        const sink = b.addBlock('TestAdapterRadiansSink');
        b.wire(src, 'out', sink, 'in');
      });

      const originalEdgeId = patch.edges[0].id;
      const result = pass2Adapters(patch);
      const expanded = (result as { kind: 'ok'; patch: Patch }).patch;

      // Original edge ID should not exist in output
      const originalEdge = expanded.edges.find((e) => e.id === originalEdgeId);
      expect(originalEdge).toBeUndefined();

      // Find edges connected to the adapter
      const adapterBlock = Array.from(expanded.blocks.values()).find(
        (block) => block.type === 'Adapter_PhaseToRadians'
      );
      const adapterId = adapterBlock!.id;

      const edgeToAdapter = expanded.edges.find((e) => e.to.blockId === adapterId);
      const edgeFromAdapter = expanded.edges.find((e) => e.from.blockId === adapterId);

      expect(edgeToAdapter).toBeDefined();
      expect(edgeFromAdapter).toBeDefined();

      // Edge to adapter connects source output → adapter input
      expect(edgeToAdapter!.from.slotId).toBe('out');
      expect(edgeToAdapter!.to.slotId).toBe('in');

      // Edge from adapter connects adapter output → sink input
      expect(edgeFromAdapter!.from.slotId).toBe('out');
      expect(edgeFromAdapter!.to.slotId).toBe('in');
    });

    it('disabled edges are not processed', () => {
      const patch = buildPatch((b) => {
        const src = b.addBlock('TestAdapterPhaseSource');
        const sink = b.addBlock('TestAdapterRadiansSink');
        b.wire(src, 'out', sink, 'in', { enabled: false });
      });

      const result = pass2Adapters(patch);
      expect(result.kind).toBe('ok');

      const expanded = (result as { kind: 'ok'; patch: Patch }).patch;

      // No adapter inserted for disabled edges
      expect(expanded.blocks.size).toBe(2);
      expect(expanded.edges.length).toBe(1);
    });
  });

  describe('multiple edges', () => {
    it('inserts adapters for each mismatched edge independently', () => {
      const patch = buildPatch((b) => {
        const src1 = b.addBlock('TestAdapterPhaseSource');
        const src2 = b.addBlock('TestAdapterScalarSource');
        const sink1 = b.addBlock('TestAdapterRadiansSink');
        const sink2 = b.addBlock('TestAdapterPhaseSink');
        b.wire(src1, 'out', sink1, 'in'); // phase→radians
        b.wire(src2, 'out', sink2, 'in'); // scalar→phase
      });

      const result = pass2Adapters(patch);
      expect(result.kind).toBe('ok');

      const expanded = (result as { kind: 'ok'; patch: Patch }).patch;

      // 4 original + 2 adapters = 6 blocks
      expect(expanded.blocks.size).toBe(6);

      // 2 edges replaced by 2 pairs = 4 edges
      expect(expanded.edges.length).toBe(4);

      // Both adapter types present
      const adapterTypes = Array.from(expanded.blocks.values())
        .filter((b) => b.role.kind === 'derived')
        .map((b) => b.type)
        .sort();

      expect(adapterTypes).toEqual(['Adapter_PhaseToRadians', 'Adapter_ScalarToPhase01']);
    });
  });
});
