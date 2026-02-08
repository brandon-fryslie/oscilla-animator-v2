/**
 * Intermediate Representation (IR) Types
 *
 * Expression types and execution step definitions used by the compiler IR.
 * These types are actively used by CompiledProgramIR in ./program.ts.
 *
 * Contents:
 * - ValueExpr: Unified expression type (in value-expr.ts)
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
import type { ValueSlot as _ValueSlot, StateSlotId as _StateSlotId, ValueExprId, EventSlotId } from './Indices';
type ValueSlot = _ValueSlot;
type StateSlotId = _StateSlotId;

// Re-export branded indices
export type {
  NodeIndex,
  PortIndex,
  ValueSlot,
  StateSlotId,
  StepIndex,
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
  valueExprId,
  eventSlotId,
  nodeId,
  stepId,
  exprId,
  stateId,
  slotId,
  instanceId,
} from './Indices';

// Import shape types
import type { TopologyId } from '../../shapes/types';

// Import time model types
import type { TimeModelIR } from './schedule';

// Import kernel types (for resolved kernel references)
import type { KernelHandle, KernelABI } from '../../runtime/KernelRegistry';

// =============================================================================
// Valid intrinsic property names (closed union)
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

// =============================================================================
// Pure Functions
// =============================================================================

/**
 * PureFn - Pure function representation for map/zip operations
 *
 * Can be a primitive opcode, a kernel function, or an expression string.
 *
 * Kernel lifecycle:
 * - Pre-resolution: { kind: 'kernel', name: 'noise3' } (emitted by lowering)
 * - Post-resolution: { kind: 'kernelResolved', handle: 42, abi: 'scalar' } (after kernel resolution pass)
 *
 * Runtime evaluators only see kernelResolved variant (kernel pass runs at program load).
 */
export type PureFn =
  | { readonly kind: 'opcode'; readonly opcode: OpCode }
  | { readonly kind: 'kernel'; readonly name: string }
  | { readonly kind: 'kernelResolved'; readonly handle: KernelHandle; readonly abi: KernelABI }
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

  // Control flow
  Select = 'select',

  // Cast
  F64ToI32Trunc = 'f64_to_i32_trunc',
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
/**
 * Instance declaration - metadata for a set of elements created by transform blocks.
 *
 * SHAPE FIELD REFERENCE (2026-02-04):
 * Instances store a reference to their shape field/signal via shapeField.
 * This enables automatic shape lookup during rendering without requiring
 * separate wiring of shape data.
 *
 * Design rationale:
 * - ONE SOURCE OF TRUTH: Shape data lives in the field, InstanceDecl just points to it
 * - SIMPLIFIED WIRING: RenderInstances2D only needs position input (shape looked up via instance)
 * - PRESERVES CAPABILITY: Supports both uniform (Signal<shape>) and per-element (Field<shape>) shapes
 *
 * Example:
 *   Ellipse.shape → Array.element (creates instance with shapeField = elements field)
 *   Array.elements → GridLayout.elements → GridLayout.position → RenderInstances2D.pos
 *   RenderInstances2D extracts instanceId from position field → looks up shapeField from instance
 */
export interface InstanceDecl {
  readonly id: InstanceId;
  readonly domainType: DomainTypeId;
  readonly count: number | 'dynamic';
  readonly lifecycle: 'static' | 'dynamic' | 'pooled';

  /**
   * Maximum element capacity for fast-path instance count patching.
   * Count patching cannot exceed this value — changes beyond maxCount
   * fall back to full recompile.
   */
  readonly maxCount: number;

  // Continuity System: Identity specification
  readonly identityMode: 'stable' | 'none';
  readonly elementIdSeed?: number; // For deterministic ID generation

  /**
   * Shape field reference - points to the ValueExpr containing shape data.
   *
   * Set by instance-creating blocks (Array, etc.) when they create instances
   * intended for rendering. Contains either:
   * - Signal<shape>: All elements share the same shape (common case)
   * - Field<shape>: Each element can have different shape (heterogeneous, rare)
   *
   * Optional because some instances are not meant for rendering (e.g., control
   * point instances in ProceduralStar are internal data structures, not visual elements).
   *
   * Used by RenderInstances2D to automatically look up shape without requiring
   * a separate shape input port.
   */
  readonly shapeField?: ValueExprId;
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

/**
 * Evaluation strategy for value expressions.
 * Pre-resolved at compile time to avoid runtime type inspection.
 *
 * const enum inlines to integer constants for zero-overhead dispatch.
 */
export const enum EvalStrategy {
  ContinuousScalar = 0,  // Continuous temporality, cardinality one (scalar signal)
  ContinuousField  = 1,  // Continuous temporality, cardinality many (field)
  DiscreteScalar   = 2,  // Discrete temporality, cardinality one (scalar event)
  DiscreteField    = 3,  // Discrete temporality, cardinality many (field event, future)
}

/**
 * Evaluation target discriminated union.
 * Keeps ValueSlot and EventSlotId separate for type safety at storage backend boundary.
 */
export type EvalTarget =
  | { readonly storage: 'value'; readonly slot: ValueSlot }
  | { readonly storage: 'event'; readonly slot: EventSlotId };

/**
 * Unified value evaluation step.
 * Replaces StepEvalSig and StepEvalEvent with strategy-based dispatch.
 *
 * Sprint 3: Step Format Unification
 * - Strategy is pre-resolved from CanonicalType during schedule construction
 * - No runtime type inspection in hot loop
 * - Executor dispatches on step.strategy (integer enum)
 */
export interface StepEvalValue {
  readonly kind: 'evalValue';
  readonly expr: ValueExprId;
  readonly target: EvalTarget;
  readonly strategy: EvalStrategy;
}

export type Step =
  | StepEvalValue
  | StepSlotWriteStrided
  | StepMaterialize
  | StepRender
  | StepStateWrite
  | StepFieldStateWrite
  | StepContinuityMapBuild
  | StepContinuityApply;

/**
 * Strided slot write step - writes multiple scalar signal components to contiguous slots.
 *
 * This is the canonical way to materialize multi-component signal values (vec2, vec3, color)
 * into value slots without requiring array-returning evaluators or side-effect kernels.
 *
 * Contract:
 * - inputs.length must equal the stride of slotBase (from slotMeta)
 * - Each input is evaluated as a scalar signal
 * - Results are written sequentially: values.f64[slotBase + i] = evaluateSignal(inputs[i])
 *
 * Example: vec2 output
 *   slotBase = allocSlot(stride=2)
 *   inputs = [sigExprX, sigExprY]
 *   → writes values.f64[slotBase+0] = eval(sigExprX), values.f64[slotBase+1] = eval(sigExprY)
 */
export interface StepSlotWriteStrided {
  readonly kind: 'slotWriteStrided';
  readonly slotBase: ValueSlot;
  readonly inputs: readonly ValueExprId[];
}

export interface StepMaterialize {
  readonly kind: 'materialize';
  readonly field: ValueExprId;
  readonly instanceId: InstanceId;
  readonly target: ValueSlot;
}

export interface StepRender {
  readonly kind: 'render';
  readonly instanceId: InstanceId;
  /** Slot containing position buffer (after continuity applied) */
  readonly positionSlot: ValueSlot;
  /** Slot containing color buffer (after continuity applied) */
  readonly colorSlot: ValueSlot;
  /** Scale multiplier for shape dimensions (uniform signal, default 1.0) */
  readonly scale?: { readonly k: 'sig'; readonly id: ValueExprId };
  /** Shape - topology + param signals (REQUIRED at runtime, types now enforce this) */
  readonly shape:
    | { readonly k: 'sig'; readonly topologyId: TopologyId; readonly paramSignals: readonly ValueExprId[] }
    | { readonly k: 'slot'; readonly slot: ValueSlot };
  /** Optional control points for path rendering - P5c: Add control points field */
  readonly controlPoints?: { readonly k: 'slot'; readonly slot: ValueSlot };
  /** C-13: Per-instance rotation (radians) - slot containing Float32Array */
  readonly rotationSlot?: ValueSlot;
  /** C-13: Per-instance anisotropic scale (x,y pairs) - slot containing Float32Array */
  readonly scale2Slot?: ValueSlot;
}

export interface StepStateWrite {
  readonly kind: 'stateWrite';
  readonly stateSlot: StateSlotId;
  readonly value: ValueExprId;
}

/**
 * Per-lane state write for stateful cardinality-generic blocks.
 * Each lane writes its corresponding value to state.
 */
export interface StepFieldStateWrite {
  readonly kind: 'fieldStateWrite';
  readonly stateSlot: StateSlotId;
  readonly value: ValueExprId;
}

/**
 * Continuity map build step (spec §5.1).
 * Detects domain changes and builds element mappings.
 */
export interface StepContinuityMapBuild {
  readonly kind: 'continuityMapBuild';
  readonly instanceId: InstanceId;
  readonly outputMapping: string; // Mapping identifier
}

/**
 * Continuity apply step (spec §5.1).
 * Applies continuity policy to a field target.
 */
export interface StepContinuityApply {
  readonly kind: 'continuityApply';
  readonly targetKey: string; // Unique identifier for this target
  readonly instanceId: InstanceId;
  readonly policy: ContinuityPolicy;
  readonly baseSlot: ValueSlot; // Input buffer (base values)
  readonly outputSlot: ValueSlot; // Output buffer (continuity-applied values)
  readonly semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom';
  readonly stride: number; // Components per element (from payload type, not semantic)
}

// =============================================================================
// Stable State Identity (for hot-swap migration)
// =============================================================================

/**
 * Stable state ID - semantic identity that survives recompilation.
 *
 * Format: "blockId:stateKind" (e.g., "b3:delay", "b7:slew")
 *
 * The lane index is NOT part of StableStateId - lanes are remapped using
 * the continuity mapping service during hot-swap.
 */
export type StableStateId = string & { readonly __brand: 'StableStateId' };

/**
 * Create a stable state ID from block ID and state kind.
 *
 * @param blockId - The block's stable ID (survives recompilation)
 * @param stateKind - Type of state (e.g., 'delay', 'slew', 'phase')
 */
export function stableStateId(blockId: string, stateKind: string): StableStateId {
  return `${blockId}:${stateKind}` as StableStateId;
}

/**
 * State mapping for scalar (signal cardinality) state.
 *
 * Used for stateful primitives operating on a single value per frame.
 */
export interface StateMappingScalar {
  readonly kind: 'scalar';
  /** Stable semantic identity */
  readonly stateId: StableStateId;
  /** Positional slot index (changes each compile) */
  readonly slotIndex: number;
  /** Floats per state element (usually 1) */
  readonly stride: number;
  /** Initial values (length = stride) */
  readonly initial: readonly number[];
}

/**
 * Spec-aligned type alias for scalar state slot declarations.
 *
 * This is the name used in the specification (04-compilation.md §I9).
 * The implementation uses `StateMappingScalar` as the canonical name
 * because it clarifies the "mapping" between semantic state IDs and
 * positional slots.
 *
 * @see StateMappingScalar
 * @see design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md §I9
 */
export type ScalarSlotDecl = StateMappingScalar;

/**
 * State mapping for field (many cardinality) state.
 *
 * Used for stateful primitives operating on per-lane state arrays.
 * Lane remapping during hot-swap uses the continuity mapping service.
 */
export interface StateMappingField {
  readonly kind: 'field';
  /** Stable semantic identity */
  readonly stateId: StableStateId;
  /** Instance this state tracks (for lane mapping) */
  readonly instanceId: InstanceId;
  /** Start offset in state array (positional, changes each compile) */
  readonly slotStart: number;
  /** Number of lanes at compile time */
  readonly laneCount: number;
  /** Floats per lane (>=1) */
  readonly stride: number;
  /** Per-lane initial values template (length = stride) */
  readonly initial: readonly number[];
}

/**
 * Spec-aligned type alias for field state slot declarations.
 *
 * This is the name used in the specification (04-compilation.md §I9).
 * The implementation uses `StateMappingField` as the canonical name
 * because it clarifies the "mapping" between semantic state IDs and
 * positional slots, with lane remapping for hot-swap.
 *
 * @see StateMappingField
 * @see design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md §I9
 */
export type FieldSlotDecl = StateMappingField;

/**
 * Union of scalar and field state mappings.
 */
export type StateMapping = StateMappingScalar | StateMappingField;
