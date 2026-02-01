/**
 * ══════════════════════════════════════════════════════════════════════
 * SIGNAL KERNEL LIBRARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * Shared implementation of signal kernel functions used by both legacy
 * SignalEvaluator and ValueExprSignalEvaluator.
 *
 * These kernels are PURE functions: they take primitive inputs (numbers)
 * and return a number, with no side effects or evaluator-specific state.
 *
 * Named signal kernels have been removed in favor of opcode-based dispatch.
 * The applySignalKernel function now only handles unknown kernel errors.
 * All oscillator, easing, shaping, combine, extraction, and construction
 * kernels have been deleted — they will be replaced by composite blocks
 * or opcode-based dispatch in a future task.
 */

import type { PureFn } from '@/compiler/ir/types';
import { applyOpcode } from './OpcodeInterpreter';

// ═══════════════════════════════════════════════════════════════════════════
// SIGNAL KERNEL IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply kernel function at signal level.
 *
 * All named signal kernels have been removed. Any remaining kernel name
 * references will throw at runtime, surfacing stale call sites.
 */
export function applySignalKernel(name: string, _values: number[]): number {
  throw new Error(`Unknown signal kernel: ${name}`);
}

/**
 * Apply a pure function to values
 *
 * Handles opcodes, kernels, and composed operations.
 */
export function applyPureFn(
  fn: PureFn,
  values: number[]
): number {
  switch (fn.kind) {
    case 'opcode':
      return applyOpcode(fn.opcode, values);

    case 'kernel':
      return applySignalKernel(fn.name, values);

    case 'expr':
      throw new Error(`PureFn kind 'expr' not yet implemented`);

    case 'composed': {
      // Apply each opcode in sequence
      let result = values[0];
      for (const op of fn.ops) {
        result = applyOpcode(op, [result]);
      }
      return result;
    }

    default: {
      const _exhaustive: never = fn;
      throw new Error(`Unknown PureFn kind: ${(_exhaustive as PureFn).kind}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST HELPER - Exported only for unit testing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Test helper to directly invoke applySignalKernel.
 * ONLY use in tests - not for production code.
 */
export function testApplySignalKernel(name: string, values: number[]): number {
  return applySignalKernel(name, values);
}
