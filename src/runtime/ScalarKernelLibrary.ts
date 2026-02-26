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
import type { KernelRegistry } from './KernelRegistry';

export interface PureFnExecutionContext {
  readonly kernelRegistry: KernelRegistry;
}

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
 */
export function applyPureFn(
  fn: PureFn,
  values: number[],
  context?: PureFnExecutionContext
): number {
  switch (fn.kind) {
    case 'opcode':
      return applyOpcode(fn.opcode, values);

    case 'kernel':
      return applyScalarKernel(fn.name, values);

    case 'kernelResolved': {
      // [LAW:no-shared-mutable-globals] Kernel handles are program-local.
      // Runtime dispatch must use the active program's registry, never a global.
      if (!context) {
        throw new Error(
          'kernelResolved evaluation requires PureFnExecutionContext'
        );
      }
      if (fn.abi !== 'scalar') {
        throw new Error(
          'kernelResolved lane ABI is not scalar-evaluable (handle=' + fn.handle + ', abi=' + fn.abi + ')'
        );
      }
      return context.kernelRegistry.callScalar(fn.handle, values);
    }

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
