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
export type { ValueExprId } from './Indices';
export { valueExprId } from './Indices';

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
 * External input channel.
 *
 * Maps to external data sources (mouse, keyboard, OSC, etc.).
 */
export interface ValueExprExternal {
  readonly kind: 'external';
  readonly type: CanonicalType;
  readonly channel: string;
}

/**
 * Intrinsic field expression.
 *
 * Discriminated by intrinsicKind:
 * - 'property': Instance properties (index, randomId, position)
 * - 'placement': Geometric placements (uv, normal, etc.) from a basis
 */
export type ValueExprIntrinsic =
  | {
      readonly kind: 'intrinsic';
      readonly type: CanonicalType;
      readonly intrinsicKind: 'property';
      readonly intrinsic: IntrinsicPropertyName;
    }
  | {
      readonly kind: 'intrinsic';
      readonly type: CanonicalType;
      readonly intrinsicKind: 'placement';
      readonly field: PlacementFieldName;
      readonly basisKind: BasisKind;
    };

/**
 * Kernel operation.
 *
 * Unified kernel kind:
 * - map: Unary pure function (per-lane)
 * - zip: Binary pure function (per-lane)
 * - broadcast: Cardinality one → many
 * - reduce: Cardinality many → one
 * - zipSig: Binary zip for signals only (strict signal typing)
 * - pathDerivative: Path → tangent/normal (field operation)
 */
export interface ValueExprKernel {
  readonly kind: 'kernel';
  readonly type: CanonicalType;
  readonly kernelKind: KernelId;
  readonly args: ValueExpr[];
  readonly fn?: PureFn; // Only for map/zip — pure function to apply
}

/**
 * State slot read.
 *
 * Reads persistent state from stateful blocks (unitDelay, lag, phasor, etc.).
 */
export interface ValueExprState {
  readonly kind: 'state';
  readonly type: CanonicalType;
  readonly stateSlot: StateSlotId;
}

/**
 * Time read.
 *
 * Reads global time value (tMs, phaseA, etc.).
 */
export interface ValueExprTime {
  readonly kind: 'time';
  readonly type: CanonicalType;
  readonly which: 'tMs' | 'phaseA';
}

/**
 * Shape topology reference.
 *
 * References a specific shape topology (circle, grid, etc.).
 */
export interface ValueExprShapeRef {
  readonly kind: 'shapeRef';
  readonly type: CanonicalType;
  readonly topologyId: TopologyId;
  readonly paramArgs: ValueExpr[];
}

/**
 * Event→signal bridge.
 *
 * Reads event state as a boolean signal (persistent across frames).
 */
export interface ValueExprEventRead {
  readonly kind: 'eventRead';
  readonly type: CanonicalType;
  readonly eventSlot: EventSlotId;
}

/**
 * Event operation.
 *
 * Event-specific operations:
 * - pulse: Single-frame pulse at time T
 * - wrap: Signal→event (rising edge)
 * - combine: Merge multiple events (OR semantics)
 * - never: Empty event (never triggers)
 * - const: Constant event (always true or always false)
 */
export type ValueExprEvent =
  | {
      readonly kind: 'event';
      readonly type: CanonicalType;
      readonly eventKind: 'pulse';
      readonly pulseTimeMs: number;
    }
  | {
      readonly kind: 'event';
      readonly type: CanonicalType;
      readonly eventKind: 'wrap';
      readonly input: ValueExpr;
    }
  | {
      readonly kind: 'event';
      readonly type: CanonicalType;
      readonly eventKind: 'combine';
      readonly inputs: ValueExpr[];
    }
  | {
      readonly kind: 'event';
      readonly type: CanonicalType;
      readonly eventKind: 'never';
    }
  | {
      readonly kind: 'event';
      readonly type: CanonicalType;
      readonly eventKind: 'const';
      readonly value: boolean;
    };
