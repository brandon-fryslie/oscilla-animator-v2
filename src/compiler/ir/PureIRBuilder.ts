/**
 * PureIRBuilder Interface
 *
 * A compile-time subset of IRBuilder that exposes ONLY pure expression-building methods.
 * Used by LowerSandbox to enforce purity constraints on macro-expanded blocks.
 *
 * Pure blocks can:
 * - Build value expressions (constant, kernelMap, kernelZip, etc.)
 * - Transform cardinality (broadcast, reduce)
 * - Construct/extract composite types
 * - Read time rails
 * - Create event expressions
 *
 * Pure blocks CANNOT:
 * - Allocate slots (allocSlot, allocTypedSlot, allocStateSlot, allocEventSlot)
 * - Register slot mappings (registerSlotType, registerSigSlot, registerFieldSlot)
 * - Emit execution steps (stepSlotWriteStrided, stepStateWrite, stepEvalSig, etc.)
 * - Add render globals (addRenderGlobal)
 *
 * The orchestrator (lower-blocks.ts) allocates slots on behalf of pure blocks
 * after lowering completes.
 */

import type { CanonicalType, ConstValue } from '../../core/canonical-types';
import type {
  ValueExprId,
  InstanceId,
  DomainTypeId,
} from './Indices';
import type {
  PureFn,
  OpCode,
  IntrinsicPropertyName,
  PlacementFieldName,
  BasisKind,
} from './types';

/**
 * PureIRBuilder - subset of IRBuilder for pure expression construction.
 *
 * This interface is implemented by delegating to an IRBuilder instance,
 * but it restricts the API surface to only pure operations.
 */
export interface PureIRBuilder {
  // =========================================================================
  // Canonical Value Expression Methods (pure subset)
  // =========================================================================

  /** Create a constant expression. Works for signal, field, or event extent. */
  constant(value: ConstValue, type: CanonicalType): ValueExprId;

  /** Create a time-derived expression. */
  time(which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy', type: CanonicalType): ValueExprId;

  /** Map a function over an expression (unary kernel). */
  kernelMap(input: ValueExprId, fn: PureFn, type: CanonicalType): ValueExprId;

  /** Zip multiple expressions with a function (n-ary kernel). */
  kernelZip(inputs: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId;

  /**
   * Zip a field expression with signal expressions.
   * The field provides per-lane values, signals provide uniform values.
   */
  kernelZipSig(field: ValueExprId, signals: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId;

  /** Broadcast a signal to a field (cardinality one → many). */
  broadcast(signal: ValueExprId, type: CanonicalType, signalComponents?: readonly ValueExprId[]): ValueExprId;

  /** Reduce a field to a signal (cardinality many → one). */
  reduce(field: ValueExprId, op: 'min' | 'max' | 'sum' | 'avg', type: CanonicalType): ValueExprId;

  /** Combine multiple expressions (sum, average, max, min, last, product). */
  combine(
    inputs: readonly ValueExprId[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last' | 'product',
    type: CanonicalType
  ): ValueExprId;

  /** Create an intrinsic field expression (index, randomId, normalizedIndex). */
  intrinsic(intrinsic: IntrinsicPropertyName, type: CanonicalType): ValueExprId;

  /** Create a placement field expression (uv, rank, seed). */
  placement(field: PlacementFieldName, basisKind: BasisKind, type: CanonicalType): ValueExprId;

  // =========================================================================
  // Structural Operations (Extract/Construct)
  // =========================================================================

  /** Extract a component from a composite payload (extractX, extractY, extractZ). */
  extract(input: ValueExprId, componentIndex: number, type: CanonicalType): ValueExprId;

  /** Construct a composite from components (makeVec2, makeVec3). */
  construct(components: readonly ValueExprId[], type: CanonicalType): ValueExprId;

  /** Convert color from HSL to RGB (alpha passthrough). */
  hslToRgb(input: ValueExprId, type: CanonicalType): ValueExprId;

  // =========================================================================
  // Event Expression Methods
  // =========================================================================

  /** Create a pulse event (fires every tick from time root). */
  eventPulse(source: 'InfiniteTimeRoot'): ValueExprId;

  /** Create a "never fires" event. */
  eventNever(): ValueExprId;

  // =========================================================================
  // Utility
  // =========================================================================

  kernel(name: string): PureFn;
  opcode(op: OpCode): PureFn;
  expr(expression: string): PureFn;

  /**
   * Access the instance context.
   * Pure blocks may read instance context but not create new instances.
   */
  createInstance(
    domainType: DomainTypeId,
    count: number,
    shapeField?: ValueExprId,
    lifecycle?: 'static' | 'dynamic' | 'pooled'
  ): InstanceId;
}
