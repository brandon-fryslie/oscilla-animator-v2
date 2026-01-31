/**
 * Intermediate Representation (IR) Types
 *
 * Expression types and execution step definitions used by the compiler IR.
 * These types are actively used by CompiledProgramIR in ./program.ts.
 *
 * Contents:
 * - SigExpr: Signal expressions (evaluated once per frame)
 * - FieldExpr: Field expressions (evaluated per-element at sinks)
 * - EventExpr: Event expressions (edge-triggered)
 * - Steps: Execution schedule step types
 * - PureFn: Pure function representations
 * - Instance System: Domain instances, layouts, and declarations
 * - Continuity System: Policies and gauges for anti-jank
 * - Time Model: infinite time representation
 * - Shape System: Unified shape model with topologies
 */

// Import canonical types as source of truth
import type { CanonicalType, ConstValue } from '../../core/canonical-types';

// Import ValueSlot and StateSlotId for use in this file
import type { ValueSlot as _ValueSlot, StateSlotId as _StateSlotId } from './Indices';
type ValueSlot = _ValueSlot;
type StateSlotId = _StateSlotId;

// Re-export branded indices
export type {
  NodeIndex,
  PortIndex,
  ValueSlot,
  StateSlotId,
  StepIndex,
  SigExprId,
  FieldExprId,
  EventExprId,
  ValueExprId,
  EventSlotId,
  TransformChainId,
  NodeId,
  StepId,
  ExprId,
  StateId,
  SlotId,
  InstanceId,
} from './Indices';

export {
  nodeIndex,
  portIndex,
  valueSlot,
  stateSlotId,
  stepIndex,
  sigExprId,
  fieldExprId,
  eventExprId,
  valueExprId,
  eventSlotId,
  nodeId,
  stepId,
  exprId,
  stateId,
  slotId,
  instanceId,
} from './Indices';

import type {
  SigExprId,
  FieldExprId,
  EventExprId,
  EventSlotId,
  SlotId,
} from './Indices';

// Import shape types
import type { TopologyId } from '../../shapes/types';

// Import time model types
import type { TimeModelIR } from './schedule';


// =============================================================================
// Signal Expressions
// =============================================================================

export type SigExpr =
  | SigExprConst
  | SigExprSlot
  | SigExprTime
  | SigExprExternal
  | SigExprMap
  | SigExprZip
  | SigExprStateRead
  | SigExprShapeRef
  | SigExprReduceField
  | SigExprEventRead;

export interface SigExprConst {
  readonly kind: 'const';
  readonly value: ConstValue;
  readonly type: CanonicalType;
}

export interface SigExprSlot {
  readonly kind: 'slot';
  readonly slot: ValueSlot;
  readonly type: CanonicalType;
}

export interface SigExprTime {
  readonly kind: 'time';
  readonly which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy';
  readonly type: CanonicalType;
}

export interface SigExprExternal {
  readonly kind: 'external';
  readonly which: string;
  readonly type: CanonicalType;
}

export interface SigExprMap {
  readonly kind: 'map';
  readonly input: SigExprId;
  readonly fn: PureFn;
  readonly type: CanonicalType;
}

export interface SigExprZip {
  readonly kind: 'zip';
  readonly inputs: readonly SigExprId[];
  readonly fn: PureFn;
  readonly type: CanonicalType;
}

/**
 * State read signal expression.
 * Reads a persistent state value from the state store.
 */
export interface SigExprStateRead {
  readonly kind: 'stateRead';
  readonly stateSlot: StateSlotId;
  readonly type: CanonicalType;
}

/**
 * Shape reference signal expression.
 * References a shape topology with runtime parameters.
 */
export interface SigExprShapeRef {
  readonly kind: 'shapeRef';
  readonly topologyId: TopologyId;
  readonly paramSignals: readonly SigExprId[]; // Signals for each topology param
  /** Optional control points for paths - carries stride like all field refs */
  readonly controlPointField?: { readonly id: FieldExprId; readonly stride: number };
  readonly type: CanonicalType; // Should be canonicalType(SHAPE)
}

/**
 * Reduce field to scalar signal expression.
 * Aggregates all elements of a field using a reduction operation.
 *
 * Semantics: Componentwise reduction (e.g., vec2 sum: (Σx, Σy))
 * Empty field behavior: Returns 0 for numeric types
 *
 * Spec: 04-compilation.md:394, 409
 */
export interface SigExprReduceField {
  readonly kind: 'reduceField';
  readonly field: FieldExprId;
  readonly op: 'min' | 'max' | 'sum' | 'avg';
  readonly type: CanonicalType;
}

/**
 * Event read signal expression.
 * Reads the fired/not-fired state of an event slot as a float (0.0 or 1.0).
 * This is the canonical event→signal bridge (spec §9.2).
 */
export interface SigExprEventRead {
  readonly kind: 'eventRead';
  readonly eventSlot: EventSlotId;
  readonly type: CanonicalType;
}

// =============================================================================
// Field Expressions
// =============================================================================

/**
 * Valid intrinsic property names (closed union).
 * These are per-element properties automatically available for any instance.
 */
export type IntrinsicPropertyName =
  | 'index'
  | 'normalizedIndex'
  | 'randomId';

/**
 * PlacementBasis field names (stable per-element coordinates).
 * These replace normalizedIndex in gauge-invariant layout blocks.
 */
export type PlacementFieldName = 'uv' | 'rank' | 'seed';

/**
 * Basis generation algorithm.
 * User-configurable per layout block.
 */
export type BasisKind =
  | 'halton2D'    // Low-discrepancy sequence (good general coverage)
  | 'random'      // Pure random (specified seed)
  | 'spiral'      // Spiral pattern (good for circles)
  | 'grid';       // Grid-aligned (good for grid layouts)

export type FieldExpr =
  | FieldExprConst
  | FieldExprIntrinsic
  | FieldExprBroadcast
  | FieldExprMap
  | FieldExprZip
  | FieldExprZipSig
  | FieldExprStateRead
  | FieldExprPathDerivative
  | FieldExprPlacement;

export interface FieldExprConst {
  readonly kind: 'const';
  readonly value: ConstValue;
  readonly type: CanonicalType;
}

/**
 * Intrinsic field expression - properly typed intrinsic access.
 * Provides per-element properties automatically available for any instance.
 */
export interface FieldExprIntrinsic {
  readonly kind: 'intrinsic';
  readonly instanceId: InstanceId;
  readonly intrinsic: IntrinsicPropertyName;
  readonly type: CanonicalType;
}

/**
 * Placement field expression - gauge-invariant per-element coordinates.
 * These replace normalizedIndex for layout blocks.
 */
export interface FieldExprPlacement {
  readonly kind: 'placement';
  readonly instanceId: InstanceId;
  readonly field: PlacementFieldName;
  readonly basisKind: BasisKind;
  readonly type: CanonicalType;
}

export interface FieldExprBroadcast {
  readonly kind: 'broadcast';
  readonly signal: SigExprId;
  readonly type: CanonicalType;
}

export interface FieldExprMap {
  readonly kind: 'map';
  readonly input: FieldExprId;
  readonly fn: PureFn;
  readonly type: CanonicalType;
  readonly instanceId: InstanceId | undefined;
}

export interface FieldExprZip {
  readonly kind: 'zip';
  readonly inputs: readonly FieldExprId[];
  readonly fn: PureFn;
  readonly type: CanonicalType;
  readonly instanceId: InstanceId | undefined;
}

export interface FieldExprZipSig {
  readonly kind: 'zipSig';
  readonly field: FieldExprId;
  readonly signals: readonly SigExprId[];
  readonly fn: PureFn;
  readonly type: CanonicalType;
  readonly instanceId: InstanceId | undefined;
}

/**
 * Per-lane state read for stateful cardinality-generic blocks.
 * Each lane reads its corresponding state slot value.
 */
export interface FieldExprStateRead {
  readonly kind: 'stateRead';
  readonly stateSlot: StateSlotId;
  readonly instanceId: InstanceId;
  readonly type: CanonicalType;
}

/**
 * Path derivative field expression.
 * Computes tangent or arc length from path control points.
 *
 * MVP Scope: Polygonal paths only (linear approximation).
 * - tangent: Central difference between adjacent points
 * - arcLength: Cumulative Euclidean distance
 *
 * Phase 2: Will add bezier curve support via topology access.
 */
export interface FieldExprPathDerivative {
  readonly kind: 'pathDerivative';
  readonly input: FieldExprId;
  readonly operation: 'tangent' | 'arcLength';
  readonly type: CanonicalType;
}

// =============================================================================
// Event Expressions
// =============================================================================

export type EventExpr =
  | EventExprConst
  | EventExprPulse
  | EventExprWrap
  | EventExprCombine
  | EventExprNever;

export interface EventExprConst {
  readonly kind: 'const';
  readonly type: CanonicalType;
  readonly fired: boolean;
}

export interface EventExprPulse {
  readonly kind: 'pulse';
  readonly type: CanonicalType;
  readonly source: 'timeRoot';
}

export interface EventExprWrap {
  readonly kind: 'wrap';
  readonly type: CanonicalType;
  readonly signal: SigExprId;
}

export interface EventExprCombine {
  readonly kind: 'combine';
  readonly type: CanonicalType;
  readonly events: readonly EventExprId[];
  readonly mode: 'any' | 'all';
}

export interface EventExprNever {
  readonly kind: 'never';
  readonly type: CanonicalType;
}

// =============================================================================
// Pure Functions
// =============================================================================

/**
 * PureFn - Pure function representation for map/zip operations
 *
 * Can be a primitive opcode, a kernel function, or an expression string.
 */
export type PureFn =
  | { readonly kind: 'opcode'; readonly opcode: OpCode }
  | { readonly kind: 'kernel'; readonly name: string }
  | { readonly kind: 'expr'; readonly expr: string }
  | { readonly kind: 'composed'; readonly ops: readonly OpCode[] };

/**
 * OpCode - Primitive operations available in the IR
 *
 * Used in map/zip functions to transform signals/fields.
 * All operations are pure (no side effects).
 */
export enum OpCode {
  // Arithmetic
  Add = 'add',
  Sub = 'sub',
  Mul = 'mul',
  Div = 'div',
  Mod = 'mod',
  Pow = 'pow',
  Neg = 'neg',
  Abs = 'abs',

  // Trigonometric
  Sin = 'sin',
  Cos = 'cos',
  Tan = 'tan',

  // Range
  Min = 'min',
  Max = 'max',
  Clamp = 'clamp',
  Lerp = 'lerp',

  // Comparison
  Eq = 'eq',
  Lt = 'lt',
  Gt = 'gt',

  // Phase
  Wrap01 = 'wrap01',

  // Hash
  Hash = 'hash',

  // Math functions (unary)
  Floor = 'floor',
  Ceil = 'ceil',
  Round = 'round',
  Fract = 'fract',
  Sqrt = 'sqrt',
  Exp = 'exp',
  Log = 'log',
  Sign = 'sign',
}

// =============================================================================
// Instance System
// =============================================================================

/**
 * Import new domain system types.
 */
import type { DomainTypeId, InstanceId } from './Indices';

/**
 * Instance declaration.
 * An instance is a specific instantiation of a domain type with count and lifecycle.
 * Layout is now handled entirely through field kernels (circleLayout, lineLayout, gridLayout).
 */
export interface InstanceDecl {
  readonly id: InstanceId;
  readonly domainType: DomainTypeId;
  readonly count: number | 'dynamic';
  readonly lifecycle: 'static' | 'dynamic' | 'pooled';
  // Continuity System: Identity specification
  readonly identityMode: 'stable' | 'none';
  readonly elementIdSeed?: number; // For deterministic ID generation
}

// =============================================================================
// Continuity System Types (spec: topics/11-continuity-system.md)
// =============================================================================

/**
 * Runtime domain instance with identity information (spec §3.1).
 * Used by continuity system for element mapping.
 */
export interface DomainInstance {
  /** Number of elements in this domain */
  readonly count: number;

  /** Stable element IDs - required when identityMode='stable' */
  readonly elementId: Uint32Array;

  /** Identity mode - 'stable' enables per-element continuity */
  readonly identityMode: 'stable' | 'none';

  /** Optional spatial hints for fallback position-based mapping */
  readonly posHintXY?: Float32Array;
}

/**
 * Gauge specification for continuity (spec §2.4).
 * A gauge is an operation that composes with the base value to produce the effective value.
 */
export type GaugeSpec =
  | { readonly kind: 'add' }           // scalar/vec/linear RGBA: x_eff = x_base + Δ
  | { readonly kind: 'mul' }           // scale continuity (rare): x_eff = x_base * Δ
  | { readonly kind: 'affine' }        // x_eff = a*x_base + b (for clamped values)
  | { readonly kind: 'phaseOffset01' }; // specialized for phase (wrap-aware)

/**
 * Continuity policy for a field target (spec §2.2).
 * Every target has exactly one declared policy. No "optional" behavior exists.
 */
export type ContinuityPolicy =
  | { readonly kind: 'none' }
  | { readonly kind: 'preserve'; readonly gauge: GaugeSpec }
  | { readonly kind: 'slew'; readonly gauge: GaugeSpec; readonly tauMs: number }
  | { readonly kind: 'crossfade'; readonly windowMs: number; readonly curve: 'linear' | 'smoothstep' | 'ease-in-out' }
  | { readonly kind: 'project'; readonly projector: 'byId' | 'byPosition'; readonly post: 'slew'; readonly tauMs: number };


// =============================================================================
// Time Model
// =============================================================================

export type TimeModel = TimeModelIR;

// =============================================================================
// Execution Steps
// =============================================================================

export type Step =
  | StepEvalSig
  | StepSlotWriteStrided
  | StepMaterialize
  | StepFieldState
  | StepEvalRenderOp
  | StepEvalEvent
  | StepStateWrite;

/**
 * Evaluate a signal expression and write to a slot.
 */
export interface StepEvalSig {
  readonly kind: 'evalSig';
  readonly value: SigExprId;
  readonly slot: ValueSlot;
}

/**
 * Write strided signal values to a field slot.
 * Used for composite values (vec2, vec3, color).
 */
export interface StepSlotWriteStrided {
  readonly kind: 'slotWriteStrided';
  readonly signalIds: readonly SigExprId[];
  readonly slot: ValueSlot;
}

/**
 * Materialize a field expression into buffers.
 */
export interface StepMaterialize {
  readonly kind: 'materialize';
  readonly value: FieldExprId;
  readonly slot: ValueSlot;
}

/**
 * State step kinds.
 * Field state writes use per-lane state storage.
 */
export type FieldStateKind = 'fieldStateWrite';

/**
 * Field state write step.
 * Writes field values to per-lane state storage.
 */
export interface StepFieldState {
  readonly kind: FieldStateKind;
  readonly value: FieldExprId;
  readonly stateSlot: StateSlotId;
}

/**
 * Evaluate a render operation.
 */
export interface StepEvalRenderOp {
  readonly kind: 'evalRenderOp';
  readonly renderOp: RenderOpIR;
}

/**
 * Evaluate an event expression and write to an event slot.
 */
export interface StepEvalEvent {
  readonly kind: 'evalEvent';
  readonly value: EventExprId;
  readonly slot: EventSlotId;
}

/**
 * State write step (signal-level state).
 */
export interface StepStateWrite {
  readonly kind: 'stateWrite';
  readonly value: SigExprId;
  readonly stateSlot: StateSlotId;
}

// =============================================================================
// Render Operations
// =============================================================================

/**
 * Render operation IR.
 * These are schedule steps that produce render side-effects.
 */
export interface RenderOpIR {
  readonly op: 'drawShape' | 'drawPath' | 'drawPaths' | 'fill' | 'clear';
  readonly shapeId?: SigExprId;
  readonly pathField?: FieldExprId;
  readonly fillColor?: SigExprId;
  readonly strokeColor?: SigExprId;
  readonly strokeWidth?: SigExprId;
}

// =============================================================================
// Schedule
// =============================================================================

/**
 * Schedule - Ordered list of steps to execute per frame.
 */
export interface Schedule {
  readonly steps: readonly Step[];
  readonly timeModel: TimeModel;
}
