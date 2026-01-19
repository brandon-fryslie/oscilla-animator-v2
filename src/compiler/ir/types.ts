/**
 * Intermediate Representation (IR) Types
 *
 * The IR is a low-level representation of the animation program.
 * It consists of:
 * - SigExpr: Signal expressions (evaluated once per frame)
 * - FieldExpr: Field expressions (evaluated per-element at sinks)
 * - EventExpr: Event expressions (edge-triggered)
 * - Steps: Execution schedule
 *
 * @deprecated This file contains legacy IR types.
 * The authoritative IR schema is in ./program.ts (CompiledProgramIR).
 * This file will be removed once runtime migration is complete.
 */

// Import canonical types as source of truth
import type { SignalType } from '../../core/canonical-types';

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
  TransformChainId,
  NodeId,
  StepId,
  ExprId,
  StateId,
  DomainId,
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
  nodeId,
  stepId,
  exprId,
  stateId,
  domainId,
  slotId,
  instanceId,
} from './Indices';

import type {
  SigExprId,
  FieldExprId,
  EventExprId,
  DomainId,
  SlotId,
} from './Indices';

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
  | SigExprStateRead;

export interface SigExprConst {
  readonly kind: 'const';
  readonly value: number | string | boolean;
  readonly type: SignalType;
}

export interface SigExprSlot {
  readonly kind: 'slot';
  readonly slot: ValueSlot;
  readonly type: SignalType;
}

export interface SigExprTime {
  readonly kind: 'time';
  readonly which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'pulse' | 'progress';
  readonly type: SignalType;
}

export interface SigExprExternal {
  readonly kind: 'external';
  readonly which: 'mouseX' | 'mouseY' | 'mouseOver';
  readonly type: SignalType;
}

export interface SigExprMap {
  readonly kind: 'map';
  readonly input: SigExprId;
  readonly fn: PureFn;
  readonly type: SignalType;
}

export interface SigExprZip {
  readonly kind: 'zip';
  readonly inputs: readonly SigExprId[];
  readonly fn: PureFn;
  readonly type: SignalType;
}

export interface SigExprStateRead {
  readonly kind: 'stateRead';
  readonly stateSlot: StateSlotId;
  readonly type: SignalType;
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
  | 'randomId'
  | 'position'
  | 'radius';

export type FieldExpr =
  | FieldExprConst
  | FieldExprSource
  | FieldExprIntrinsic
  | FieldExprBroadcast
  | FieldExprMap
  | FieldExprZip
  | FieldExprZipSig
  | FieldExprMapIndexed
  | FieldExprArray
  | FieldExprLayout;

export interface FieldExprConst {
  readonly kind: 'const';
  readonly value: number | string;
  readonly type: SignalType;
}

export interface FieldExprSource {
  readonly kind: 'source';
  readonly domain: DomainId;
  readonly sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex';
  readonly type: SignalType;
  // NEW: Instance-based model (Sprint 2)
  readonly instanceId?: string; // InstanceId
  readonly intrinsic?: string;  // Intrinsic property name
}

/**
 * Intrinsic field expression - properly typed intrinsic access.
 * Replaces the hacky use of FieldExprSource with 'as any' casts.
 */
export interface FieldExprIntrinsic {
  readonly kind: 'intrinsic';
  readonly instanceId: InstanceId;
  readonly intrinsic: IntrinsicPropertyName;
  readonly type: SignalType;
}

export interface FieldExprBroadcast {
  readonly kind: 'broadcast';
  readonly signal: SigExprId;
  readonly type: SignalType;
}

export interface FieldExprMap {
  readonly kind: 'map';
  readonly input: FieldExprId;
  readonly fn: PureFn;
  readonly type: SignalType;
  readonly domain?: DomainId; // Propagated from input
}

export interface FieldExprZip {
  readonly kind: 'zip';
  readonly inputs: readonly FieldExprId[];
  readonly fn: PureFn;
  readonly type: SignalType;
  readonly domain?: DomainId; // Unified from inputs
}

export interface FieldExprZipSig {
  readonly kind: 'zipSig';
  readonly field: FieldExprId;
  readonly signals: readonly SigExprId[];
  readonly fn: PureFn;
  readonly type: SignalType;
  readonly domain?: DomainId; // From field input
}

export interface FieldExprMapIndexed {
  readonly kind: 'mapIndexed';
  readonly domain: DomainId;
  readonly fn: PureFn;
  readonly signals?: readonly SigExprId[];
  readonly type: SignalType;
}

/**
 * Array field expression - represents Signal<T> → Field<T> transform.
 * Created by Array block (Stage 2 of three-stage architecture).
 */
export interface FieldExprArray {
  readonly kind: 'array';
  readonly instanceId: InstanceId;
  readonly type: SignalType;
}

/**
 * Layout field expression - represents field operation that outputs positions.
 * Created by layout blocks (Stage 3 of three-stage architecture).
 */
export interface FieldExprLayout {
  readonly kind: 'layout';
  readonly input: FieldExprId;
  readonly layoutSpec: LayoutSpec;
  readonly instanceId: InstanceId;
  readonly type: SignalType;
}

// =============================================================================
// Event Expressions
// =============================================================================

export type EventExpr =
  | EventExprPulse
  | EventExprWrap
  | EventExprCombine
  | EventExprNever;

export interface EventExprPulse {
  readonly kind: 'pulse';
  readonly source: 'timeRoot';
}

export interface EventExprWrap {
  readonly kind: 'wrap';
  readonly signal: SigExprId;
}

export interface EventExprCombine {
  readonly kind: 'combine';
  readonly events: readonly EventExprId[];
  readonly mode: 'any' | 'all';
}

export interface EventExprNever {
  readonly kind: 'never';
}

// =============================================================================
// Pure Functions
// =============================================================================

export type PureFn =
  | { kind: 'opcode'; opcode: OpCode }
  | { kind: 'expr'; expr: string }
  | { kind: 'kernel'; name: string };

export enum OpCode {
  // Arithmetic
  Add = 'add',
  Sub = 'sub',
  Mul = 'mul',
  Div = 'div',
  Mod = 'mod',
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
}

// =============================================================================
// Instance System
// =============================================================================

/**
 * Import new domain system types.
 */
import type { DomainTypeId, InstanceId } from './Indices';

/**
 * Layout specification for an instance.
 * Layout determines spatial arrangement (orthogonal to domain type).
 */
export type LayoutSpec =
  | { readonly kind: 'unordered' }
  | { readonly kind: 'grid'; readonly rows: number; readonly cols: number }
  | { readonly kind: 'circular'; readonly radius: number }
  | { readonly kind: 'linear'; readonly spacing: number }
  | { readonly kind: 'random'; readonly bounds: { x: number; y: number; w: number; h: number }; readonly seed: number }
  | { readonly kind: 'along-path'; readonly pathInstanceId: string }
  | { readonly kind: 'custom'; readonly positionField: FieldExprId };

/**
 * Instance declaration.
 * An instance is a specific instantiation of a domain type with count, layout, and lifecycle.
 */
export interface InstanceDecl {
  readonly id: string; // InstanceId
  readonly domainType: string; // DomainTypeId
  readonly count: number | 'dynamic';
  readonly layout: LayoutSpec;
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

export type TimeModel =
  | { kind: 'finite'; durationMs: number; periodAMs?: number; periodBMs?: number }
  | { kind: 'infinite'; windowMs?: number; periodAMs?: number; periodBMs?: number };

// =============================================================================
// Schedule Steps
// =============================================================================

export type Step =
  | StepEvalSig
  | StepMaterialize
  | StepRender
  | StepStateWrite
  | StepContinuityMapBuild
  | StepContinuityApply;

export interface StepEvalSig {
  readonly kind: 'evalSig';
  readonly expr: SigExprId;
  readonly target: ValueSlot;
}

export interface StepMaterialize {
  readonly kind: 'materialize';
  readonly field: FieldExprId;
  readonly instanceId: string; // InstanceId - UPDATED for Sprint 6
  readonly target: ValueSlot;
}

export interface StepRender {
  readonly kind: 'render';
  readonly instanceId: string; // InstanceId - UPDATED for Sprint 6
  readonly position: FieldExprId;
  readonly color: FieldExprId;
  readonly size?:
    | { readonly k: 'sig'; readonly id: SigExprId }
    | { readonly k: 'field'; readonly id: FieldExprId };
  readonly shape?:
    | { readonly k: 'sig'; readonly id: SigExprId }
    | { readonly k: 'field'; readonly id: FieldExprId };
}

export interface StepStateWrite {
  readonly kind: 'stateWrite';
  readonly stateSlot: StateSlotId;
  readonly value: SigExprId;
}

/**
 * Step to build element mapping when domain changes (spec §5.1).
 * Executed rarely (only at hot-swap boundaries).
 */
export interface StepContinuityMapBuild {
  readonly kind: 'continuityMapBuild';
  readonly instanceId: string; // InstanceId
  readonly outputMapping: string; // Key to store mapping result
}

/**
 * Step to apply continuity policy to a field target (spec §5.1).
 * Executed per-frame for targets with policy != none.
 */
export interface StepContinuityApply {
  readonly kind: 'continuityApply';
  readonly targetKey: string; // StableTargetId
  readonly instanceId: string; // InstanceId
  readonly policy: ContinuityPolicy;
  readonly baseSlot: ValueSlot;
  readonly outputSlot: ValueSlot;
  readonly semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom';
}

// =============================================================================
// Complete IR Program (LEGACY - Use CompiledProgramIR instead)
// =============================================================================

/**
 * @deprecated Use CompiledProgramIR from ./program.ts instead.
 * This type will be removed once runtime migration is complete.
 *
 * Key differences in CompiledProgramIR:
 * - Dense arrays instead of ReadonlyMap
 * - Required slotMeta with offsets
 * - Axes exposed on every slot type
 * - Outputs contract for frame extraction
 * - Debug index for provenance
 */
export interface IRProgram {
  readonly timeModel: TimeModel;
  readonly signals: ReadonlyMap<SigExprId, SigExpr>;
  readonly fields: ReadonlyMap<FieldExprId, FieldExpr>;
  readonly events: ReadonlyMap<EventExprId, EventExpr>;
  readonly instances: ReadonlyMap<string, InstanceDecl>; // UPDATED for Sprint 6 (was domains)
  readonly steps: readonly Step[];
  readonly slotCount: number;
  readonly stateSlotCount?: number;
}
