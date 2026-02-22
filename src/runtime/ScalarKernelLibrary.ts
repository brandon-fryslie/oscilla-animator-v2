/**
 * ══════════════════════════════════════════════════════════════════════
 * SCALAR KERNEL LIBRARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * Scalar kernel dispatch used by ValueExprScalarEvaluator.
 *
 * applyPureFn is the single entry point for evaluating PureFn nodes.
 * It dispatches to opcodes (primary path), registry-resolved kernels,
 * composed pipelines, or throws for unresolved kernel names.
 *
 * applyScalarKernel exists as a runtime safety net — any unresolved
 * kernel name that reaches runtime will throw, surfacing stale references.
 */

import type { PureFn } from '@/compiler/ir/types';
import { applyOpcode } from './OpcodeInterpreter';
import { singleArgBuf as _singleArgBuf } from './executor-init';

// ═══════════════════════════════════════════════════════════════════════════
// SCALAR KERNEL IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply kernel function at scalar level.
 *
 * All named scalar kernels have been removed. Any remaining kernel name
 * references will throw at runtime, surfacing stale call sites.
 */
export function applyScalarKernel(name: string, _values: number[]): number {
  throw new Error('Unknown scalar kernel: ' + name);
}

/**
 * Apply a pure function to values
 *
 * Handles opcodes, kernels, and composed operations.
 *
 * Note: kernelResolved case will be implemented in Phase D (Migration).
 * For now, it throws to catch any premature usage.
 */
export function applyPureFn(
  fn: PureFn,
  values: number[]
): number {
  switch (fn.kind) {
    case 'opcode':
      return applyOpcode(fn.opcode, values);

    case 'kernel':
      return applyScalarKernel(fn.name, values);

    case 'kernelResolved':
      // Phase D: This will call registry.callScalar(fn.handle, values)
      throw new Error(
        'kernelResolved not yet implemented (Phase D pending). Handle: ' + fn.handle + ', ABI: ' + fn.abi
      );

    case 'expr':
      throw new Error('PureFn kind \'expr\' not yet implemented');

    case 'composed': {
      // Apply each opcode in sequence
      let result = values[0];
      for (const op of fn.ops) {
        _singleArgBuf[0] = result;
        result = applyOpcode(op, _singleArgBuf);
      }
      return result;
    }

    default: {
      const _exhaustive: never = fn;
      throw new Error('Unknown PureFn kind: ' + (_exhaustive as PureFn).kind);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST HELPER - Exported only for unit testing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Test helper to directly invoke applyScalarKernel.
 * ONLY use in tests - not for production code.
 */
export function testApplyScalarKernel(name: string, values: number[]): number {
  return applyScalarKernel(name, values);
}
