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
import { signalType, signalTypeSignal } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';

describe('VarargInputDef', () => {
  describe('isVarargInput type guard', () => {
    it('returns true for vararg inputs', () => {
      const def: InputDef = {
        type: signalTypeSignal('float', { kind: 'norm01' }),
        isVararg: true,
        varargConstraint: {
          payloadType: 'float',
          cardinalityConstraint: 'any',
        },
      };
      expect(isVarargInput(def)).toBe(true);
    });

    it('returns false for normal inputs', () => {
      const def: InputDef = {
        type: signalTypeSignal('float', { kind: 'norm01' }),
      };
      expect(isVarargInput(def)).toBe(false);
    });

    it('returns false for inputs with isVararg: false', () => {
      const def: InputDef = {
        type: signalTypeSignal('float', { kind: 'norm01' }),
        isVararg: false,
      };
      expect(isVarargInput(def)).toBe(false);
    });
  });

  describe('VarargConstraint', () => {
    it('defines payload type constraint', () => {
      const constraint: VarargConstraint = {
        payloadType: 'float',
        cardinalityConstraint: 'any',
      };
      expect(constraint.payloadType).toBe('float');
    });

    it('defines cardinality constraint', () => {
      const constraint: VarargConstraint = {
        payloadType: 'float',
        cardinalityConstraint: 'field',
      };
      expect(constraint.cardinalityConstraint).toBe('field');
    });

    it('allows minConnections constraint', () => {
      const constraint: VarargConstraint = {
        payloadType: 'float',
        cardinalityConstraint: 'any',
        minConnections: 1,
      };
      expect(constraint.minConnections).toBe(1);
    });

    it('allows maxConnections constraint', () => {
      const constraint: VarargConstraint = {
        payloadType: 'float',
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
            type: signalTypeSignal('float', { kind: 'norm01' }),
            isVararg: true,
            varargConstraint: {
              payloadType: 'float',
              cardinalityConstraint: 'any',
            },
          },
        },
        outputs: {
          result: {
            type: signalTypeSignal('float', { kind: 'norm01' }),
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
            type: signalTypeSignal('float', { kind: 'norm01' }),
            isVararg: true,
            // Missing varargConstraint
          },
        },
        outputs: {
          result: {
            type: signalTypeSignal('float', { kind: 'norm01' }),
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
            type: signalTypeSignal('float', { kind: 'norm01' }),
            isVararg: true,
            varargConstraint: {
              payloadType: 'float',
              cardinalityConstraint: 'any',
            },
            defaultSource: defaultSourceConst(0),
          },
        },
        outputs: {
          result: {
            type: signalTypeSignal('float', { kind: 'norm01' }),
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
            type: signalTypeSignal('float', { kind: 'norm01' }),
            defaultSource: defaultSourceConst(1),
          },
          varargInput: {
            type: signalTypeSignal('float', { kind: 'norm01' }),
            isVararg: true,
            varargConstraint: {
              payloadType: 'float',
              cardinalityConstraint: 'any',
            },
          },
        },
        outputs: {
          result: {
            type: signalTypeSignal('float', { kind: 'norm01' }),
          },
        },
        lower: () => ({ outputsById: {} }),
      };

      expect(() => registerBlock(blockDef)).not.toThrow();
    });
  });
});
