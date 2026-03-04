/**
 * Shared utilities for block lowering functions.
 */

import type { ValueExprId } from '../compiler/ir/Indices';
import type { PureFn } from '../compiler/ir/types';
import type { StableStateId } from '../compiler/ir/types';
import type { CanonicalType } from '../core/canonical-types';
import { payloadStride, requireInst } from '../core/canonical-types';
import type { BlockIRBuilder } from '../compiler/ir/BlockIRBuilder';
import type { LowerCtx } from './registry';
import type { StateDecl } from '../compiler/ir/lowerTypes';

export function withoutContract(type: CanonicalType): CanonicalType {
  const { contract: _contract, ...rest } = type as CanonicalType & { contract?: unknown };
  return rest;
}

/**
 * Cardinality-aware zip: delegates to b.zipAuto() — the builder owns the
 * broadcast/zipPromote logic.
 */
export function zipAuto(
  inputs: readonly ValueExprId[],
  fn: PureFn,
  outType: CanonicalType,
  b: BlockIRBuilder,
): ValueExprId {
  return b.zipAuto(inputs, fn, outType);
}

/**
 * Cardinality-aware map: broadcasts input to field extent if needed.
 * Delegates to b.mapAuto() — the builder owns the broadcast+map logic.
 */
export function mapAuto(
  input: ValueExprId,
  fn: PureFn,
  outType: CanonicalType,
  b: BlockIRBuilder,
): ValueExprId {
  return b.mapAuto(input, fn, outType);
}

/**
 * Resolve an input to a compile-time constant value.
 * For inputs that must lower to a const (Array.count, ProceduralPolygon.sides, etc.).
 *
 * Throws if the input doesn't lower to a const expression or if bounds are violated.
 */
export function resolveInputConstant(
  ctx: import('./registry').LowerCtx,
  input: import('../compiler/ir/lowerTypes').ValueRefExpr,
  portId: string,
  opts?: { min?: number; max?: number }
): number {
  const maybe = tryResolveInputConstant(ctx, input, portId, opts);
  if (maybe !== null) {
    return maybe;
  }
  const expr = ctx.b.getValueExpr(input.id);
  throw new Error(
    `Input '${portId}' must lower to a const expression, got ${expr?.kind ?? 'undefined'}`
  );
}

/**
 * Resolve an input to a compile-time constant value when possible.
 *
 * Returns:
 * - number: validated integer const value
 * - null: input is not a const expression
 *
 * Throws on invalid const values (non-finite, non-integer, or out-of-bounds).
 */
export function tryResolveInputConstant(
  ctx: import('./registry').LowerCtx,
  input: import('../compiler/ir/lowerTypes').ValueRefExpr,
  portId: string,
  opts?: { min?: number; max?: number }
): number | null {
  const expr = ctx.b.getValueExpr(input.id);
  if (!expr || expr.kind !== 'const') {
    return null;
  }
  const val = expr.value.value as number;
  if (!Number.isFinite(val)) {
    throw new Error(`Input '${portId}' const value is not finite: ${val}`);
  }
  if (!Number.isInteger(val)) {
    throw new Error(`Input '${portId}' must be an integer, got ${val}`);
  }
  if (opts?.min !== undefined && val < opts.min) {
    throw new Error(`Input '${portId}' must be >= ${opts.min}, got ${val}`);
  }
  if (opts?.max !== undefined && val > opts.max) {
    throw new Error(`Input '${portId}' must be <= ${opts.max}, got ${val}`);
  }
  return val;
}

export interface StatefulStoragePlan {
  readonly stateDecl: StateDecl;
  readonly writeKind: 'stateWrite' | 'fieldStateWrite';
}

/**
 * Derive state declaration/write kind from resolved output type cardinality.
 * // [LAW:one-source-of-truth] State storage shape comes from CT cardinality, never block-local modes.
 */
export function planStatefulStorage(
  ctx: LowerCtx,
  stateKey: StableStateId,
  stateType: CanonicalType,
  initialValue: number,
): StatefulStoragePlan {
  const stride = payloadStride(stateType.payload);
  const cardinality = requireInst(stateType.extent.cardinality, 'cardinality');
  if (cardinality.kind !== 'many') {
    return {
      stateDecl: { key: stateKey, initialValue, stride },
      writeKind: 'stateWrite',
    };
  }

  const instanceId = cardinality.instance.instanceId;
  const instanceDecl = ctx.instances.get(instanceId);
  if (!instanceDecl) {
    throw new Error(`Stateful lowering: missing instance declaration for ${instanceId}`);
  }
  // [LAW:one-source-of-truth] Stateful lane capacity follows canonical
  // instance declaration capacity (dynamic instances use maxCount).
  const laneCount = instanceDecl.count === 'dynamic'
    ? instanceDecl.maxCount
    : instanceDecl.count;

  return {
    stateDecl: {
      key: stateKey,
      initialValue,
      stride,
      instanceId,
      laneCount,
    },
    writeKind: 'fieldStateWrite',
  };
}
