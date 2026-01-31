/**
 * Canonical ValueExpr Type System
 *
 * This module defines the unified ValueExpr type that replaces the legacy
 * SigExpr/FieldExpr/EventExpr split with a single canonical table.
 *
 * Design Principles:
 * - Small top-level kind discriminant (9 values)
 * - Every variant carries CanonicalType (payload + unit + extent)
 * - No instanceId stored — derive from requireManyInstance(type)
 * - No op discriminant — only kind at top level
 * - No sig/field/event family tags — derive from extent via deriveKind()
 *
 * This is the TARGET type for migration. Legacy SigExpr/FieldExpr/EventExpr
 * remain functional during migration.
 *
 * Spec Reference: TYPE-SYSTEM-INVARIANTS.md
 */

import type { CanonicalType, ConstValue } from '../../core/canonical-types';
import type { StateSlotId, EventSlotId } from './Indices';
import type { TopologyId } from '../../shapes/types';
import type {
  IntrinsicPropertyName,
  PlacementFieldName,
  BasisKind,
  PureFn,
} from './types';

// =============================================================================
// ValueExprId - Branded Index Type
// =============================================================================

/** Dense index for unified value expressions. */
export type ValueExprId = number & { readonly __brand: 'ValueExprId' };

export function valueExprId(n: number): ValueExprId {
  return n as ValueExprId;
}

// =============================================================================
// KernelId - Kernel Operation Discriminant
// =============================================================================

/**
 * Kernel operation identifier.
 * All pure compute operations (map, zip, broadcast, reduce, etc.) are unified under 'kernel'.
 */
export type KernelId =
  | 'map'
  | 'zip'
  | 'broadcast'
  | 'reduce'
  | 'zipSig'
  | 'pathDerivative';

// =============================================================================
// ValueExpr - Canonical Expression Union (9 kinds)
// =============================================================================

/**
 * Canonical value expression type.
 *
 * Replaces legacy SigExpr/FieldExpr/EventExpr with a unified table.
 * CanonicalType.extent determines signal/field/event semantics.
 *
 * Top-level kinds (9):
 * - const: Constant values (zero/one/many cardinality)
 * - external: External input channels (mouse, keyboard, etc.)
 * - intrinsic: Instance-bound data (index, randomId, placement)
 * - kernel: Pure compute operations (map, zip, broadcast, reduce, etc.)
 * - state: State reads (stateful blocks)
 * - time: Time reads (tMs, phaseA, etc.)
 * - shapeRef: Shape topology references
 * - eventRead: Event→signal bridge
 * - event: Event-specific operations (pulse, wrap, combine, never)
 */
export type ValueExpr =
  | ValueExprConst
  | ValueExprExternal
  | ValueExprIntrinsic
  | ValueExprKernel
  | ValueExprState
  | ValueExprTime
  | ValueExprShapeRef
  | ValueExprEventRead
  | ValueExprEvent;

// =============================================================================
// ValueExpr Variants
// =============================================================================

/**
 * Constant value expression.
 *
 * CanonicalType distinguishes zero/one/many cardinality:
 * - cardinalityZero(): Universal donor (used by all lanes)
 * - cardinalityOne(): Single value
 * - cardinalityMany(instanceId): Per-element constants
 */
export interface ValueExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;
  readonly value: ConstValue;
}

/**
 * External input channel expression.
 * Sources input from external channels (mouse position, keyboard, etc.).
 */
export interface ValueExprExternal {
  readonly kind: 'external';
  readonly type: CanonicalType;
  readonly channel: string;
}

/**
 * Intrinsic field expression.
 * Instance-bound data (index, randomId, placement coordinates).
 *
 * Two sub-kinds:
 * - intrinsicKind: 'property' → intrinsic: IntrinsicPropertyName (index, normalizedIndex, randomId)
 * - intrinsicKind: 'placement' → field: PlacementFieldName, basisKind: BasisKind (uv, rank, seed)
 */
export interface ValueExprIntrinsic {
  readonly kind: 'intrinsic';
  readonly type: CanonicalType;
  readonly intrinsicKind: 'property' | 'placement';
  // Property fields (when intrinsicKind === 'property')
  readonly intrinsic?: IntrinsicPropertyName;
  // Placement fields (when intrinsicKind === 'placement')
  readonly field?: PlacementFieldName;
  readonly basisKind?: BasisKind;
}

/**
 * Kernel expression (all pure compute).
 * Subsumes legacy map, zip, broadcast, reduce, zipSig, pathDerivative.
 *
 * Kernel-specific data:
 * - map/zip: fn + args
 * - broadcast: args[0] is signal to broadcast
 * - reduce: args[0] is field, op determines reduction (encoded in fn or separate field)
 * - zipSig: field + signals (encoded in args)
 * - pathDerivative: operation + input (encoded in args or separate field)
 */
export interface ValueExprKernel {
  readonly kind: 'kernel';
  readonly type: CanonicalType;
  readonly kernelKind: KernelId;
  readonly args: readonly ValueExprId[];
  readonly fn?: PureFn; // For map/zip operations
  // Additional fields for specific kernels
  readonly reduceOp?: 'min' | 'max' | 'sum' | 'avg'; // For reduce
  readonly pathOp?: 'tangent' | 'arcLength'; // For pathDerivative
}

/**
 * State read expression.
 * Reads persistent state from state slots (cross-frame storage).
 */
export interface ValueExprState {
  readonly kind: 'state';
  readonly type: CanonicalType;
  readonly stateSlot: StateSlotId;
}

/**
 * Time read expression.
 * Reads time-related values (tMs, phaseA, phaseB, dt, progress, palette, energy).
 */
export interface ValueExprTime {
  readonly kind: 'time';
  readonly type: CanonicalType;
  readonly which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy';
}

/**
 * Shape reference expression.
 * References a shape topology with runtime parameters.
 */
export interface ValueExprShapeRef {
  readonly kind: 'shapeRef';
  readonly type: CanonicalType;
  readonly topologyId: TopologyId;
  readonly paramArgs: readonly ValueExprId[]; // Runtime parameters
  readonly controlPointArg?: ValueExprId; // Optional control points for paths
}

/**
 * Event read expression (event→signal bridge).
 * Reads the fired/not-fired state of an event slot as a float (0.0 or 1.0).
 */
export interface ValueExprEventRead {
  readonly kind: 'eventRead';
  readonly type: CanonicalType;
  readonly eventSlot: EventSlotId;
}

/**
 * Event expression.
 * Event-specific operations (pulse, wrap, combine, never).
 *
 * Event sub-kinds:
 * - pulse: Time-root pulse events
 * - wrap: Signal wrap events
 * - combine: Event combination (any/all)
 * - never: Never fires
 * - const: Constant event (always fired or never fired)
 */
export interface ValueExprEvent {
  readonly kind: 'event';
  readonly type: CanonicalType;
  readonly eventKind: 'pulse' | 'wrap' | 'combine' | 'never' | 'const';
  // Pulse fields
  readonly pulseSource?: 'timeRoot';
  // Wrap fields
  readonly wrapSignal?: ValueExprId;
  // Combine fields
  readonly combineEvents?: readonly ValueExprId[];
  readonly combineMode?: 'any' | 'all';
  // Const fields
  readonly constFired?: boolean;
}

// =============================================================================
// Legacy Mapping Documentation
// =============================================================================

/**
 * Complete mapping from legacy 24 variants to ValueExpr kinds.
 *
 * This documents how each legacy expression type maps to the new canonical table.
 *
 * Legacy SigExpr (10 variants) → ValueExpr:
 * - SigExprConst → const (cardinality: one or zero)
 * - SigExprSlot → NOT A VALUEEXPR (slots are materialization detail, not expressions)
 * - SigExprTime → time
 * - SigExprExternal → external
 * - SigExprMap → kernel (kernelKind: 'map')
 * - SigExprZip → kernel (kernelKind: 'zip')
 * - SigExprStateRead → state
 * - SigExprShapeRef → shapeRef
 * - SigExprReduceField → kernel (kernelKind: 'reduce')
 * - SigExprEventRead → eventRead
 *
 * Legacy FieldExpr (9 variants) → ValueExpr:
 * - FieldExprConst → const (cardinality: many)
 * - FieldExprIntrinsic → intrinsic (intrinsicKind: 'property')
 * - FieldExprPlacement → intrinsic (intrinsicKind: 'placement')
 * - FieldExprBroadcast → kernel (kernelKind: 'broadcast')
 * - FieldExprMap → kernel (kernelKind: 'map')
 * - FieldExprZip → kernel (kernelKind: 'zip')
 * - FieldExprZipSig → kernel (kernelKind: 'zipSig')
 * - FieldExprStateRead → state (cardinality: many)
 * - FieldExprPathDerivative → kernel (kernelKind: 'pathDerivative')
 *
 * Legacy EventExpr (5 variants) → ValueExpr:
 * - EventExprConst → event (eventKind: 'const')
 * - EventExprPulse → event (eventKind: 'pulse')
 * - EventExprWrap → event (eventKind: 'wrap')
 * - EventExprCombine → event (eventKind: 'combine')
 * - EventExprNever → event (eventKind: 'never')
 *
 * Total: 24 legacy variants → 9 ValueExpr kinds
 *
 * Note: SigExprSlot is NOT a ValueExpr concept. Slots are a runtime materialization
 * detail (where values are stored), not a value expression (how values are computed).
 * Slots appear in Schedule steps, not in the expression graph.
 */
export const LEGACY_MAPPING = {
  // Signal expressions (10)
  SigExprConst: { kind: 'const', cardinality: 'one or zero' },
  SigExprSlot: { kind: 'N/A', note: 'Not a ValueExpr - materialization detail' },
  SigExprTime: { kind: 'time' },
  SigExprExternal: { kind: 'external' },
  SigExprMap: { kind: 'kernel', kernelKind: 'map' },
  SigExprZip: { kind: 'kernel', kernelKind: 'zip' },
  SigExprStateRead: { kind: 'state' },
  SigExprShapeRef: { kind: 'shapeRef' },
  SigExprReduceField: { kind: 'kernel', kernelKind: 'reduce' },
  SigExprEventRead: { kind: 'eventRead' },

  // Field expressions (9)
  FieldExprConst: { kind: 'const', cardinality: 'many' },
  FieldExprIntrinsic: { kind: 'intrinsic', intrinsicKind: 'property' },
  FieldExprPlacement: { kind: 'intrinsic', intrinsicKind: 'placement' },
  FieldExprBroadcast: { kind: 'kernel', kernelKind: 'broadcast' },
  FieldExprMap: { kind: 'kernel', kernelKind: 'map' },
  FieldExprZip: { kind: 'kernel', kernelKind: 'zip' },
  FieldExprZipSig: { kind: 'kernel', kernelKind: 'zipSig' },
  FieldExprStateRead: { kind: 'state', cardinality: 'many' },
  FieldExprPathDerivative: { kind: 'kernel', kernelKind: 'pathDerivative' },

  // Event expressions (5)
  EventExprConst: { kind: 'event', eventKind: 'const' },
  EventExprPulse: { kind: 'event', eventKind: 'pulse' },
  EventExprWrap: { kind: 'event', eventKind: 'wrap' },
  EventExprCombine: { kind: 'event', eventKind: 'combine' },
  EventExprNever: { kind: 'event', eventKind: 'never' },
} as const;
