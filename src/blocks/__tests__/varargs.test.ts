/**
 * Tests for varargs input support in block registry
 */

import { describe, it, expect } from 'vitest';
import {
  registerBlock,
  isVarargInput,
  type BlockDef,
  type InputDef,
  type VarargConstraint,
} from '../registry';
import { canonicalType, canonicalSignal } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';

describe('VarargInputDef', () => {
  describe('isVarargInput type guard', () => {
    it('returns true for vararg inputs', () => {
      const def: InputDef = {
        type: canonicalSignal(FLOAT, { kind: 'scalar' }),
        isVararg: true,
        varargConstraint: {
          payloadType: FLOAT,
          cardinalityConstraint: 'any',
        },
      };
      expect(isVarargInput(def)).toBe(true);
    });

    it('returns false for normal inputs', () => {
      const def: InputDef = {
        type: canonicalSignal(FLOAT, { kind: 'scalar' }),
      };
      expect(isVarargInput(def)).toBe(false);
    });

    it('returns false for inputs with isVararg: false', () => {
      const def: InputDef = {
        type: canonicalSignal(FLOAT, { kind: 'scalar' }),
        isVararg: false,
      };
      expect(isVarargInput(def)).toBe(false);
    });
  });

  describe('VarargConstraint', () => {
    it('defines payload type constraint', () => {
      const constraint: VarargConstraint = {
        payloadType: FLOAT,
        cardinalityConstraint: 'any',
      };
      expect(constraint.payloadType).toBe(FLOAT);
    });

    it('defines cardinality constraint', () => {
      const constraint: VarargConstraint = {
        payloadType: FLOAT,
        cardinalityConstraint: 'field',
      };
      expect(constraint.cardinalityConstraint).toBe('field');
    });

    it('allows minConnections constraint', () => {
      const constraint: VarargConstraint = {
        payloadType: FLOAT,
        cardinalityConstraint: 'any',
        minConnections: 1,
      };
      expect(constraint.minConnections).toBe(1);
    });

    it('allows maxConnections constraint', () => {
      const constraint: VarargConstraint = {
        payloadType: FLOAT,
        cardinalityConstraint: 'any',
        maxConnections: 10,
      };
      expect(constraint.maxConnections).toBe(10);
    });
  });

  describe('registerBlock validation', () => {
    it('accepts block with vararg input and valid constraint', () => {
      const blockDef: BlockDef = {
        type: 'test.vararg.valid',
        label: 'Test Vararg Block',
        category: 'test',
        form: 'primitive',
        capability: 'pure',
        inputs: {
          values: {
            type: canonicalSignal(FLOAT, { kind: 'scalar' }),
            isVararg: true,
            varargConstraint: {
              payloadType: FLOAT,
              cardinalityConstraint: 'any',
            },
          },
        },
        outputs: {
          result: {
            type: canonicalSignal(FLOAT, { kind: 'scalar' }),
          },
        },
        lower: () => ({ outputsById: {} }),
      };

      expect(() => registerBlock(blockDef)).not.toThrow();
    });

    it('rejects vararg input without constraint', () => {
      const blockDef: BlockDef = {
        type: 'test.vararg.no-constraint',
        label: 'Test Vararg No Constraint',
        category: 'test',
        form: 'primitive',
        capability: 'pure',
        inputs: {
          values: {
            type: canonicalSignal(FLOAT, { kind: 'scalar' }),
            isVararg: true,
            // Missing varargConstraint
          },
        },
        outputs: {
          result: {
            type: canonicalSignal(FLOAT, { kind: 'scalar' }),
          },
        },
        lower: () => ({ outputsById: {} }),
      };

      expect(() => registerBlock(blockDef)).toThrow(
        'Vararg input "values" in block test.vararg.no-constraint must have varargConstraint'
      );
    });

    it('rejects vararg input with defaultSource', () => {
      const blockDef: BlockDef = {
        type: 'test.vararg.with-default',
        label: 'Test Vararg With Default',
        category: 'test',
        form: 'primitive',
        capability: 'pure',
        inputs: {
          values: {
            type: canonicalSignal(FLOAT, { kind: 'scalar' }),
            isVararg: true,
            varargConstraint: {
              payloadType: FLOAT,
              cardinalityConstraint: 'any',
            },
            defaultSource: defaultSourceConst(0),
          },
        },
        outputs: {
          result: {
            type: canonicalSignal(FLOAT, { kind: 'scalar' }),
          },
        },
        lower: () => ({ outputsById: {} }),
      };

      expect(() => registerBlock(blockDef)).toThrow(
        'Vararg input "values" in block test.vararg.with-default cannot have defaultSource'
      );
    });

    it('accepts normal input alongside vararg input', () => {
      const blockDef: BlockDef = {
        type: 'test.vararg.mixed',
        label: 'Test Mixed Inputs',
        category: 'test',
        form: 'primitive',
        capability: 'pure',
        inputs: {
          normalInput: {
            type: canonicalSignal(FLOAT, { kind: 'scalar' }),
            defaultSource: defaultSourceConst(1),
          },
          varargInput: {
            type: canonicalSignal(FLOAT, { kind: 'scalar' }),
            isVararg: true,
            varargConstraint: {
              payloadType: FLOAT,
              cardinalityConstraint: 'any',
            },
          },
        },
        outputs: {
          result: {
            type: canonicalSignal(FLOAT, { kind: 'scalar' }),
          },
        },
        lower: () => ({ outputsById: {} }),
      };

      expect(() => registerBlock(blockDef)).not.toThrow();
    });
  });
});
