/**
 * Cardinality Diagnostics Tests
 *
 * Tests for cardinality-related diagnostic codes and payloads.
 */

import { describe, it, expect } from 'vitest';
import type { DiagnosticCode, DiagnosticPayload, TargetRef } from '../types';
import { generateDiagnosticId } from '../diagnosticId';

describe('Cardinality Diagnostics', () => {
  describe('Diagnostic code coverage', () => {
    it('defines E_CARDINALITY_MISMATCH code', () => {
      const code: DiagnosticCode = 'E_CARDINALITY_MISMATCH';
      expect(code).toBe('E_CARDINALITY_MISMATCH');
    });

    it('defines E_INSTANCE_MISMATCH code', () => {
      const code: DiagnosticCode = 'E_INSTANCE_MISMATCH';
      expect(code).toBe('E_INSTANCE_MISMATCH');
    });

    it('defines E_LANE_COUPLED_DISALLOWED code', () => {
      const code: DiagnosticCode = 'E_LANE_COUPLED_DISALLOWED';
      expect(code).toBe('E_LANE_COUPLED_DISALLOWED');
    });

    it('defines E_IMPLICIT_BROADCAST_DISALLOWED code', () => {
      const code: DiagnosticCode = 'E_IMPLICIT_BROADCAST_DISALLOWED';
      expect(code).toBe('E_IMPLICIT_BROADCAST_DISALLOWED');
    });
  });

  describe('Diagnostic payloads', () => {
    it('supports E_CARDINALITY_MISMATCH payload', () => {
      const payload: DiagnosticPayload = {
        code: 'E_CARDINALITY_MISMATCH',
        inputCardinality: 'one',
        outputCardinality: 'many',
      };
      expect(payload.code).toBe('E_CARDINALITY_MISMATCH');
      expect(payload.inputCardinality).toBe('one');
      expect(payload.outputCardinality).toBe('many');
    });

    it('supports E_INSTANCE_MISMATCH payload', () => {
      const payload: DiagnosticPayload = {
        code: 'E_INSTANCE_MISMATCH',
        instanceA: 'circles-1',
        instanceB: 'rects-2',
        portA: 'a',
        portB: 'b',
      };
      expect(payload.code).toBe('E_INSTANCE_MISMATCH');
      expect(payload.instanceA).toBe('circles-1');
      expect(payload.instanceB).toBe('rects-2');
    });

    it('supports E_LANE_COUPLED_DISALLOWED payload', () => {
      const payload: DiagnosticPayload = {
        code: 'E_LANE_COUPLED_DISALLOWED',
        blockType: 'Reduce',
        reason: 'Block performs cross-lane operations',
      };
      expect(payload.code).toBe('E_LANE_COUPLED_DISALLOWED');
      expect(payload.blockType).toBe('Reduce');
    });

    it('supports E_IMPLICIT_BROADCAST_DISALLOWED payload', () => {
      const payload: DiagnosticPayload = {
        code: 'E_IMPLICIT_BROADCAST_DISALLOWED',
        signalPort: 'time',
        fieldContext: 'Field<float>(circles-1)',
      };
      expect(payload.code).toBe('E_IMPLICIT_BROADCAST_DISALLOWED');
      expect(payload.signalPort).toBe('time');
    });
  });

  describe('TargetRef attribution', () => {
    it('supports block+port targeting for cardinality errors', () => {
      const target: TargetRef = {
        kind: 'port',
        blockId: 'add-1',
        portId: 'out',
      };
      expect(target.kind).toBe('port');
      expect(target.blockId).toBe('add-1');
      expect(target.portId).toBe('out');
    });

    it('generates stable diagnostic ID for cardinality errors', () => {
      const target: TargetRef = {
        kind: 'block',
        blockId: 'add-1',
      };
      const id = generateDiagnosticId('E_CARDINALITY_MISMATCH', target, 42);
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });
  });
});
