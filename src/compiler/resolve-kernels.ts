/**
 * ══════════════════════════════════════════════════════════════════════
 * KERNEL RESOLUTION PASS
 * ══════════════════════════════════════════════════════════════════════
 *
 * Post-lowering validation pass that resolves kernel names to handles.
 *
 * This pass runs after Pass 7 (schedule construction) as a final validation
 * step before creating CompiledProgramIR.
 *
 * Responsibilities:
 * 1. Walk all ValueExpr nodes
 * 2. For each PureFn with { kind: 'kernel', name }, resolve to { kind: 'kernelResolved', handle, abi }
 * 3. Validate kernel exists in registry
 * 4. Validate arity (argCount matches input count)
 * 5. For lane kernels: validate outStride === payloadStride(output.payload)
 *
 * Failures:
 * - Missing kernel → KernelNotImplemented error (fail at load time, not runtime)
 * - Arity mismatch → KernelArityMismatch error
 * - Stride mismatch → KernelStrideMismatch error
 *
 * ══════════════════════════════════════════════════════════════════════
 */

import type { ValueExpr } from './ir/value-expr';
import type { PureFn } from './ir/types';
import type { KernelRegistry, KernelHandle, KernelABI } from '../runtime/KernelRegistry';
import { kernelId } from '../runtime/KernelRegistry';
import { payloadStride } from '../core/canonical-types';

// =============================================================================
// Error Types
// =============================================================================

export interface KernelResolutionError {
  readonly kind: 'KernelNotImplemented' | 'KernelArityMismatch' | 'KernelStrideMismatch';
  readonly message: string;
  readonly kernelName: string;
  readonly valueExprIndex?: number;
}

// =============================================================================
// Kernel Resolution
// =============================================================================

/**
 * Resolve all kernel references in a ValueExpr table.
 *
 * Walks the table and replaces { kind: 'kernel', name } with { kind: 'kernelResolved', handle, abi }.
 *
 * @param valueExprs - Mutable array of ValueExpr nodes
 * @param registry - Kernel registry
 * @returns Array of errors (empty if successful)
 */
export function resolveKernels(
  valueExprs: ValueExpr[],
  registry: KernelRegistry
): KernelResolutionError[] {
  const errors: KernelResolutionError[] = [];

  for (let i = 0; i < valueExprs.length; i++) {
    const expr = valueExprs[i];

    // Only process kernel expressions
    if (expr.kind !== 'kernel') {
      continue;
    }

    // Check each fn field (map, zip, zipSig have PureFn)
    if (expr.kernelKind === 'map') {
      const result = resolvePureFn(expr.fn, expr.type, registry, i, 1);
      if (result.error) {
        errors.push(result.error);
      } else if (result.fn) {
        // Mutate in place (this is the only mutation in the compiler)
        valueExprs[i] = { ...expr, fn: result.fn };
      }
    } else if (expr.kernelKind === 'zip') {
      const result = resolvePureFn(expr.fn, expr.type, registry, i, expr.inputs.length);
      if (result.error) {
        errors.push(result.error);
      } else if (result.fn) {
        valueExprs[i] = { ...expr, fn: result.fn };
      }
    } else if (expr.kernelKind === 'zipSig') {
      // zipSig: field + signals, so argCount = 1 (field) + signals.length
      const expectedArgCount = 1 + expr.signals.length;
      const result = resolvePureFn(expr.fn, expr.type, registry, i, expectedArgCount);
      if (result.error) {
        errors.push(result.error);
      } else if (result.fn) {
        valueExprs[i] = { ...expr, fn: result.fn };
      }
    }
    // broadcast, reduce, pathDerivative don't have PureFn, skip them
  }

  return errors;
}

/**
 * Resolve a single PureFn reference.
 *
 * @param fn - PureFn to resolve
 * @param outputType - Output type of the expression (for stride validation)
 * @param registry - Kernel registry
 * @param exprIndex - ValueExpr index (for error reporting)
 * @param expectedArgCount - Expected number of arguments
 * @returns Resolved fn or error
 */
function resolvePureFn(
  fn: PureFn,
  outputType: import('../core/canonical-types').CanonicalType,
  registry: KernelRegistry,
  exprIndex: number,
  expectedArgCount: number
): { fn?: PureFn; error?: KernelResolutionError } {
  // Only resolve kernel references (not opcode, expr, composed, or kernelResolved)
  if (fn.kind !== 'kernel') {
    return {}; // Already resolved or not a kernel
  }

  const name = fn.name;
  const kid = kernelId(name);

  // Resolve kernel ID to handle + ABI.
  // Unresolved kernels are left as-is — they will throw at runtime
  // via applySignalKernel in SignalKernelLibrary.ts, surfacing stale references.
  let resolved: { handle: KernelHandle; abi: KernelABI; meta: any };
  try {
    resolved = registry.resolve(kid);
  } catch (_e) {
    // Kernel not in registry — leave as unresolved (throws at runtime)
    return {};
  }

  const { handle, abi, meta } = resolved;

  // Validate arity
  if (meta.argCount !== expectedArgCount) {
    return {
      error: {
        kind: 'KernelArityMismatch',
        message: `Kernel ${name} expects ${meta.argCount} arguments, got ${expectedArgCount}`,
        kernelName: name,
        valueExprIndex: exprIndex,
      },
    };
  }

  // Validate stride for lane kernels
  if (abi === 'lane') {
    const expectedStride = payloadStride(outputType.payload);
    if (meta.outStride !== expectedStride) {
      return {
        error: {
          kind: 'KernelStrideMismatch',
          message: `Kernel ${name} has outStride ${meta.outStride}, but output type has stride ${expectedStride}`,
          kernelName: name,
          valueExprIndex: exprIndex,
        },
      };
    }
  }

  // Success: return resolved PureFn
  return {
    fn: {
      kind: 'kernelResolved',
      handle,
      abi,
    },
  };
}
