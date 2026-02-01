/**
 * ValueExprEventEvaluator Tests
 *
 * Tests for event evaluation with ValueExpr table.
 * Covers all 5 event kinds: const, never, pulse, combine, wrap.
 */

import { describe, it, expect } from 'vitest';
import { evaluateValueExprEvent, CycleInEventEvalError } from '../ValueExprEventEvaluator';
import type { ValueExpr } from '../../compiler/ir/value-expr';
import type { RuntimeState } from '../RuntimeState';
import { createRuntimeState } from '../RuntimeState';
import { valueExprId } from '../../compiler/ir/Indices';
import { canonicalEvent, canonicalSignal } from '../../core/canonical-types';
import type { CompiledProgramIR } from '../../compiler/ir/program';

describe('ValueExprEventEvaluator', () => {
  describe('const event', () => {
    it('returns true when fired=true', () => {
      const nodes: ValueExpr[] = [
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'const',
          fired: true,
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 1);
      const program = {} as CompiledProgramIR;

      const result = evaluateValueExprEvent(valueExprId(0), { nodes }, state, program);
      expect(result).toBe(true);
    });

    it('returns false when fired=false', () => {
      const nodes: ValueExpr[] = [
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'const',
          fired: false,
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 1);
      const program = {} as CompiledProgramIR;

      const result = evaluateValueExprEvent(valueExprId(0), { nodes }, state, program);
      expect(result).toBe(false);
    });
  });

  describe('never event', () => {
    it('always returns false', () => {
      const nodes: ValueExpr[] = [
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'never',
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 1);
      const program = {} as CompiledProgramIR;

      const result = evaluateValueExprEvent(valueExprId(0), { nodes }, state, program);
      expect(result).toBe(false);
    });
  });

  describe('pulse event', () => {
    it('always returns true (fires every tick)', () => {
      const nodes: ValueExpr[] = [
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'pulse',
          source: 'timeRoot',
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 1);
      const program = {} as CompiledProgramIR;

      const result = evaluateValueExprEvent(valueExprId(0), { nodes }, state, program);
      expect(result).toBe(true);
    });
  });

  describe('combine event', () => {
    it('mode=any: returns true when any input fires', () => {
      const nodes: ValueExpr[] = [
        // 0: pulse (fires)
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'pulse',
          source: 'timeRoot',
        },
        // 1: never (does not fire)
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'never',
        },
        // 2: combine(any, [pulse, never])
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'combine',
          inputs: [valueExprId(0), valueExprId(1)],
          mode: 'any',
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 3);
      const program = {} as CompiledProgramIR;

      const result = evaluateValueExprEvent(valueExprId(2), { nodes }, state, program);
      expect(result).toBe(true);
    });

    it('mode=any: returns false when no inputs fire', () => {
      const nodes: ValueExpr[] = [
        // 0: never
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'never',
        },
        // 1: never
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'never',
        },
        // 2: combine(any, [never, never])
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'combine',
          inputs: [valueExprId(0), valueExprId(1)],
          mode: 'any',
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 3);
      const program = {} as CompiledProgramIR;

      const result = evaluateValueExprEvent(valueExprId(2), { nodes }, state, program);
      expect(result).toBe(false);
    });

    it('mode=all: returns true when all inputs fire', () => {
      const nodes: ValueExpr[] = [
        // 0: pulse
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'pulse',
          source: 'timeRoot',
        },
        // 1: pulse
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'pulse',
          source: 'timeRoot',
        },
        // 2: combine(all, [pulse, pulse])
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'combine',
          inputs: [valueExprId(0), valueExprId(1)],
          mode: 'all',
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 3);
      const program = {} as CompiledProgramIR;

      const result = evaluateValueExprEvent(valueExprId(2), { nodes }, state, program);
      expect(result).toBe(true);
    });

    it('mode=all: returns false when any input does not fire', () => {
      const nodes: ValueExpr[] = [
        // 0: pulse (fires)
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'pulse',
          source: 'timeRoot',
        },
        // 1: never (does not fire)
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'never',
        },
        // 2: combine(all, [pulse, never])
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'combine',
          inputs: [valueExprId(0), valueExprId(1)],
          mode: 'all',
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 3);
      const program = {} as CompiledProgramIR;

      const result = evaluateValueExprEvent(valueExprId(2), { nodes }, state, program);
      expect(result).toBe(false);
    });

    it('handles nested combine correctly', () => {
      const nodes: ValueExpr[] = [
        // 0: pulse
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'pulse',
          source: 'timeRoot',
        },
        // 1: never
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'never',
        },
        // 2: combine(any, [pulse, never]) → true
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'combine',
          inputs: [valueExprId(0), valueExprId(1)],
          mode: 'any',
        },
        // 3: const(true)
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'const',
          fired: true,
        },
        // 4: combine(all, [combine(any, [pulse, never]), const(true)]) → true
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'combine',
          inputs: [valueExprId(2), valueExprId(3)],
          mode: 'all',
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 5);
      const program = {} as CompiledProgramIR;

      const result = evaluateValueExprEvent(valueExprId(4), { nodes }, state, program);
      expect(result).toBe(true);
    });
  });

  describe('wrap event', () => {
    it('fires on rising edge (0.0 → 1.0)', () => {
      const nodes: ValueExpr[] = [
        // 0: const signal (value 1.0)
        {
          kind: 'const',
          type: canonicalSignal({ kind: 'float' }),
          value: { kind: 'float', value: 1.0 },
        },
        // 1: wrap(const 1.0)
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'wrap',
          input: valueExprId(0),
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 2);
      const program = {} as CompiledProgramIR;

      // Initialize time (required for signal evaluation)
      state.time = {
        tAbsMs: 0,
        tMs: 0,
        phaseA: 0,
        phaseB: 0,
        dt: 16,
        pulse: 0,
        palette: new Float32Array([0, 0, 0, 0]),
        energy: 0,
      };

      // First evaluation: rising edge (prevPredicate=0, current=1)
      const firstResult = evaluateValueExprEvent(valueExprId(1), { nodes }, state, program);
      expect(firstResult).toBe(true);

      // Second evaluation: no edge (prevPredicate=1, current=1)
      const secondResult = evaluateValueExprEvent(valueExprId(1), { nodes }, state, program);
      expect(secondResult).toBe(false);
    });

    it('does not fire when signal stays high', () => {
      const nodes: ValueExpr[] = [
        // 0: const signal (value 1.0)
        {
          kind: 'const',
          type: canonicalSignal({ kind: 'float' }),
          value: { kind: 'float', value: 1.0 },
        },
        // 1: wrap(const 1.0)
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'wrap',
          input: valueExprId(0),
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 2);
      const program = {} as CompiledProgramIR;

      // Initialize time
      state.time = {
        tAbsMs: 0,
        tMs: 0,
        phaseA: 0,
        phaseB: 0,
        dt: 16,
        pulse: 0,
        palette: new Float32Array([0, 0, 0, 0]),
        energy: 0,
      };

      // Set prevPredicate to 1 (already high)
      state.eventPrevPredicateValue[1] = 1;

      // Should not fire (no rising edge)
      const result = evaluateValueExprEvent(valueExprId(1), { nodes }, state, program);
      expect(result).toBe(false);
    });

    it('does not fire on NaN signal', () => {
      const nodes: ValueExpr[] = [
        // 0: const signal (value NaN)
        {
          kind: 'const',
          type: canonicalSignal({ kind: 'float' }),
          value: { kind: 'float', value: NaN },
        },
        // 1: wrap(const NaN)
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'wrap',
          input: valueExprId(0),
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 2);
      const program = {} as CompiledProgramIR;

      // Initialize time
      state.time = {
        tAbsMs: 0,
        tMs: 0,
        phaseA: 0,
        phaseB: 0,
        dt: 16,
        pulse: 0,
        palette: new Float32Array([0, 0, 0, 0]),
        energy: 0,
      };

      // NaN treated as false (predicate=0), no rising edge
      const result = evaluateValueExprEvent(valueExprId(1), { nodes }, state, program);
      expect(result).toBe(false);
    });

    it('uses exact threshold of 0.5', () => {
      const nodes: ValueExpr[] = [
        // 0: const signal (value 0.5)
        {
          kind: 'const',
          type: canonicalSignal({ kind: 'float' }),
          value: { kind: 'float', value: 0.5 },
        },
        // 1: wrap(const 0.5)
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'wrap',
          input: valueExprId(0),
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 2);
      const program = {} as CompiledProgramIR;

      // Initialize time
      state.time = {
        tAbsMs: 0,
        tMs: 0,
        phaseA: 0,
        phaseB: 0,
        dt: 16,
        pulse: 0,
        palette: new Float32Array([0, 0, 0, 0]),
        energy: 0,
      };

      // 0.5 >= 0.5 → predicate=1, rising edge fires
      const result = evaluateValueExprEvent(valueExprId(1), { nodes }, state, program);
      expect(result).toBe(true);
    });
  });

  describe('cycle detection', () => {
    it('throws CycleInEventEvalError on cyclic combine', () => {
      // This is a degenerate case that should never happen with valid IR,
      // but we test the safety mechanism.
      const nodes: ValueExpr[] = [
        // 0: combine(any, [1]) - references self indirectly
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'combine',
          inputs: [valueExprId(1)],
          mode: 'any',
        },
        // 1: combine(any, [0]) - creates cycle
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'combine',
          inputs: [valueExprId(0)],
          mode: 'any',
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 2);
      const program = {} as CompiledProgramIR;

      // Should throw cycle error
      expect(() => {
        evaluateValueExprEvent(valueExprId(0), { nodes }, state, program);
      }).toThrow(CycleInEventEvalError);
    });

    it('clears visiting flag after successful evaluation', () => {
      const nodes: ValueExpr[] = [
        // 0: pulse
        {
          kind: 'event',
          type: canonicalEvent(),
          eventKind: 'pulse',
          source: 'timeRoot',
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 1);
      const program = {} as CompiledProgramIR;

      // Evaluate once
      evaluateValueExprEvent(valueExprId(0), { nodes }, state, program);

      // Should be able to evaluate again (visiting flag cleared)
      const result = evaluateValueExprEvent(valueExprId(0), { nodes }, state, program);
      expect(result).toBe(true);
    });
  });

  describe('error handling', () => {
    it('throws when ValueExpr not found', () => {
      const nodes: ValueExpr[] = [];
      const state = createRuntimeState(0, 0, 0, 0, 1);
      const program = {} as CompiledProgramIR;

      expect(() => {
        evaluateValueExprEvent(valueExprId(0), { nodes }, state, program);
      }).toThrow('ValueExpr 0 not found');
    });

    it('throws when kind is not event', () => {
      const nodes: ValueExpr[] = [
        {
          kind: 'const',
          type: canonicalSignal({ kind: 'float' }),
          value: { kind: 'float', value: 42 },
        },
      ];
      const state = createRuntimeState(0, 0, 0, 0, 1);
      const program = {} as CompiledProgramIR;

      expect(() => {
        evaluateValueExprEvent(valueExprId(0), { nodes }, state, program);
      }).toThrow("Expected event-extent ValueExpr, got kind 'const'");
    });
  });
});
