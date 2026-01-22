/**
 * Payload Diagnostics Tests
 *
 * Tests for payload-related diagnostic codes and payloads.
 */

import { describe, it, expect } from 'vitest';
import type { DiagnosticCode, DiagnosticPayload, TargetRef } from '../types';
import { generateDiagnosticId } from '../diagnosticId';

describe('Payload Diagnostics', () => {
  describe('Diagnostic code coverage', () => {
    it('defines E_PAYLOAD_NOT_ALLOWED code', () => {
      const code: DiagnosticCode = 'E_PAYLOAD_NOT_ALLOWED';
      expect(code).toBe('E_PAYLOAD_NOT_ALLOWED');
    });

    it('defines E_PAYLOAD_COMBINATION_NOT_ALLOWED code', () => {
      const code: DiagnosticCode = 'E_PAYLOAD_COMBINATION_NOT_ALLOWED';
      expect(code).toBe('E_PAYLOAD_COMBINATION_NOT_ALLOWED');
    });

    it('defines E_UNIT_MISMATCH code', () => {
      const code: DiagnosticCode = 'E_UNIT_MISMATCH';
      expect(code).toBe('E_UNIT_MISMATCH');
    });

    it('defines E_IMPLICIT_CAST_DISALLOWED code', () => {
      const code: DiagnosticCode = 'E_IMPLICIT_CAST_DISALLOWED';
      expect(code).toBe('E_IMPLICIT_CAST_DISALLOWED');
    });
  });

  describe('Diagnostic payloads', () => {
    it('supports E_PAYLOAD_NOT_ALLOWED payload', () => {
      const payload: DiagnosticPayload = {
        code: 'E_PAYLOAD_NOT_ALLOWED',
        port: 'input',
        payload: 'color',
        allowedPayloads: ['float', 'vec2'],
      };
      expect(payload.code).toBe('E_PAYLOAD_NOT_ALLOWED');
      expect(payload.port).toBe('input');
      expect(payload.payload).toBe('color');
      expect(payload.allowedPayloads).toEqual(['float', 'vec2']);
    });

    it('supports E_PAYLOAD_COMBINATION_NOT_ALLOWED payload', () => {
      const payload: DiagnosticPayload = {
        code: 'E_PAYLOAD_COMBINATION_NOT_ALLOWED',
        inputPayloads: ['color', 'float'],
        blockType: 'Add',
      };
      expect(payload.code).toBe('E_PAYLOAD_COMBINATION_NOT_ALLOWED');
      expect(payload.inputPayloads).toEqual(['color', 'float']);
      expect(payload.blockType).toBe('Add');
    });

    it('supports E_UNIT_MISMATCH payload', () => {
      const payload: DiagnosticPayload = {
        code: 'E_UNIT_MISMATCH',
        port: 'angle',
        expectedUnit: 'radians',
        actualUnit: 'degrees',
      };
      expect(payload.code).toBe('E_UNIT_MISMATCH');
      expect(payload.expectedUnit).toBe('radians');
      expect(payload.actualUnit).toBe('degrees');
    });

    it('supports E_IMPLICIT_CAST_DISALLOWED payload', () => {
      const payload: DiagnosticPayload = {
        code: 'E_IMPLICIT_CAST_DISALLOWED',
        fromPayload: 'int',
        toPayload: 'float',
        port: 'a',
      };
      expect(payload.code).toBe('E_IMPLICIT_CAST_DISALLOWED');
      expect(payload.fromPayload).toBe('int');
      expect(payload.toPayload).toBe('float');
    });
  });

  describe('TargetRef attribution', () => {
    it('supports block+port targeting for payload errors', () => {
      const target: TargetRef = {
        kind: 'port',
        blockId: 'add-1',
        portId: 'a',
      };
      expect(target.kind).toBe('port');
      expect(target.blockId).toBe('add-1');
      expect(target.portId).toBe('a');
    });

    it('generates stable diagnostic ID for payload errors', () => {
      const target: TargetRef = {
        kind: 'port',
        blockId: 'sin-1',
        portId: 'input',
      };
      const id = generateDiagnosticId('E_PAYLOAD_NOT_ALLOWED', target, 42);
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });
  });
});
