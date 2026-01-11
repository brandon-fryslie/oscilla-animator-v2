import { describe, it, expect } from 'vitest';
import { generateDiagnosticId, serializeTargetRef } from '../diagnosticId';
import type { TargetRef } from '../types';

describe('diagnosticId', () => {
  describe('serializeTargetRef', () => {
    it('should serialize block target', () => {
      const target: TargetRef = { kind: 'block', blockId: 'b1' };
      expect(serializeTargetRef(target)).toBe('block-b1');
    });

    it('should serialize port target', () => {
      const target: TargetRef = { kind: 'port', blockId: 'b1', portId: 'p1' };
      expect(serializeTargetRef(target)).toBe('port-b1:p1');
    });

    it('should serialize bus target', () => {
      const target: TargetRef = { kind: 'bus', busId: 'bus1' };
      expect(serializeTargetRef(target)).toBe('bus-bus1');
    });

    it('should serialize binding target', () => {
      const target: TargetRef = {
        kind: 'binding',
        bindingId: 'bind1',
        busId: 'bus1',
        blockId: 'b1',
        direction: 'publish',
      };
      expect(serializeTargetRef(target)).toBe('binding-bind1:bus1:b1:publish');
    });

    it('should serialize timeRoot target', () => {
      const target: TargetRef = { kind: 'timeRoot', blockId: 'b1' };
      expect(serializeTargetRef(target)).toBe('timeRoot-b1');
    });

    it('should serialize graphSpan target without blockIds', () => {
      const target: TargetRef = { kind: 'graphSpan', blockIds: [] };
      expect(serializeTargetRef(target)).toBe('graphSpan-[]');
    });

    it('should serialize graphSpan target with blockIds', () => {
      const target: TargetRef = {
        kind: 'graphSpan',
        blockIds: ['b1', 'b2', 'b3'],
        spanKind: 'cycle',
      };
      // Note: blockIds are sorted, so expect sorted output
      expect(serializeTargetRef(target)).toBe('graphSpan-[b1,b2,b3]:cycle');
    });

    it('should serialize graphSpan target without spanKind', () => {
      const target: TargetRef = {
        kind: 'graphSpan',
        blockIds: ['b1', 'b2'],
      };
      expect(serializeTargetRef(target)).toBe('graphSpan-[b1,b2]');
    });

    it('should serialize composite target without instanceId', () => {
      const target: TargetRef = { kind: 'composite', compositeDefId: 'comp1' };
      expect(serializeTargetRef(target)).toBe('composite-comp1');
    });

    it('should serialize composite target with instanceId', () => {
      const target: TargetRef = {
        kind: 'composite',
        compositeDefId: 'comp1',
        instanceId: 'inst1',
      };
      expect(serializeTargetRef(target)).toBe('composite-comp1:inst1');
    });

    it('should sort blockIds in graphSpan for determinism', () => {
      const target1: TargetRef = {
        kind: 'graphSpan',
        blockIds: ['b3', 'b1', 'b2'],
        spanKind: 'cycle',
      };
      const target2: TargetRef = {
        kind: 'graphSpan',
        blockIds: ['b1', 'b2', 'b3'],
        spanKind: 'cycle',
      };
      // Should produce same serialization regardless of input order
      expect(serializeTargetRef(target1)).toBe(serializeTargetRef(target2));
    });
  });

  describe('generateDiagnosticId', () => {
    const target: TargetRef = { kind: 'block', blockId: 'b1' };

    it('should generate ID with code, target, and revision', () => {
      const id = generateDiagnosticId('E_TYPE_MISMATCH', target, 5);
      expect(id).toBe('E_TYPE_MISMATCH:block-b1:rev5');
    });

    it('should generate ID with optional signature', () => {
      const id = generateDiagnosticId('E_TYPE_MISMATCH', target, 5, 'port:p1');
      expect(id).toBe('E_TYPE_MISMATCH:block-b1:rev5:port:p1');
    });

    it('should be deterministic - same inputs produce same ID', () => {
      const id1 = generateDiagnosticId('E_TYPE_MISMATCH', target, 5);
      const id2 = generateDiagnosticId('E_TYPE_MISMATCH', target, 5);
      expect(id1).toBe(id2);
    });

    it('should produce different IDs for different codes', () => {
      const id1 = generateDiagnosticId('E_TYPE_MISMATCH', target, 5);
      const id2 = generateDiagnosticId('E_CYCLE_DETECTED', target, 5);
      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different targets', () => {
      const target1: TargetRef = { kind: 'block', blockId: 'b1' };
      const target2: TargetRef = { kind: 'block', blockId: 'b2' };

      const id1 = generateDiagnosticId('E_TYPE_MISMATCH', target1, 5);
      const id2 = generateDiagnosticId('E_TYPE_MISMATCH', target2, 5);
      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different revisions', () => {
      const id1 = generateDiagnosticId('E_TYPE_MISMATCH', target, 5);
      const id2 = generateDiagnosticId('E_TYPE_MISMATCH', target, 6);
      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different signatures', () => {
      const id1 = generateDiagnosticId('E_TYPE_MISMATCH', target, 5, 'sig1');
      const id2 = generateDiagnosticId('E_TYPE_MISMATCH', target, 5, 'sig2');
      expect(id1).not.toBe(id2);
    });

    it('should handle complex targets correctly', () => {
      const portTarget: TargetRef = { kind: 'port', blockId: 'b1', portId: 'p1' };
      const id = generateDiagnosticId('E_TYPE_MISMATCH', portTarget, 10);
      expect(id).toBe('E_TYPE_MISMATCH:port-b1:p1:rev10');
    });

    it('should handle graphSpan targets', () => {
      const spanTarget: TargetRef = {
        kind: 'graphSpan',
        blockIds: ['b1', 'b2'],
        spanKind: 'cycle',
      };
      const id = generateDiagnosticId('E_CYCLE_DETECTED', spanTarget, 3);
      expect(id).toBe('E_CYCLE_DETECTED:graphSpan-[b1,b2]:cycle:rev3');
    });

    it('should handle binding targets', () => {
      const bindingTarget: TargetRef = {
        kind: 'binding',
        bindingId: 'bind1',
        busId: 'bus1',
        blockId: 'b1',
        direction: 'subscribe',
      };
      const id = generateDiagnosticId('E_MISSING_INPUT', bindingTarget, 7);
      expect(id).toBe('E_MISSING_INPUT:binding-bind1:bus1:b1:subscribe:rev7');
    });

    it('should be stable across multiple calls', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateDiagnosticId('E_TYPE_MISMATCH', target, 5));
      }
      expect(ids.size).toBe(1); // All IDs should be identical
    });
  });

  describe('ID format stability (snapshot)', () => {
    it('should maintain stable format for block target', () => {
      const target: TargetRef = { kind: 'block', blockId: 'oscillator-1' };
      const id = generateDiagnosticId('E_TYPE_MISMATCH', target, 42);
      expect(id).toMatchSnapshot();
    });

    it('should maintain stable format for port target', () => {
      const target: TargetRef = { kind: 'port', blockId: 'osc-1', portId: 'frequency' };
      const id = generateDiagnosticId('E_MISSING_INPUT', target, 15, 'float-expected');
      expect(id).toMatchSnapshot();
    });

    it('should maintain stable format for cycle detection', () => {
      const target: TargetRef = {
        kind: 'graphSpan',
        blockIds: ['osc-1', 'filter-2', 'osc-1'],
        spanKind: 'cycle',
      };
      const id = generateDiagnosticId('E_CYCLE_DETECTED', target, 8);
      expect(id).toMatchSnapshot();
    });

    it('should maintain stable format for TimeRoot diagnostics', () => {
      const target: TargetRef = { kind: 'graphSpan', blockIds: [] };
      const id = generateDiagnosticId('E_TIME_ROOT_MISSING', target, 0);
      expect(id).toMatchSnapshot();
    });
  });
});
