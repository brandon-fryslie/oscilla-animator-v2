/**
 * Schedule IR - Time Model and Execution Steps
 *
 * This module defines the time model and schedule types that drive the IR runtime.
 * The schedule is an explicit, ordered list of steps that must be executed
 * deterministically.
 */

import type { ValueSlot, StateId, SigExprId } from "./types";

// ============================================================================
// Time Model IR
// ============================================================================

/**
 * Time Model - Authoritative Time Topology
 *
 * The time model defines how absolute time (tAbsMs) is mapped to model time
 * and what derived time signals are available.
 *
 * No "player looping" hacks - the time model is the single source of truth.
 */
export type TimeModelIR =
  | TimeModelFinite
  | TimeModelCyclic
  | TimeModelInfinite;

/** Finite time model with fixed duration */
export interface TimeModelFinite {
  kind: "finite";
  /** Duration in milliseconds */
  durationMs: number;
  /** Optional cue points for scrubbing/snapping */
  cuePoints?: CuePointIR[];
}

/** Cyclic time model with repeating period */
export interface TimeModelCyclic {
  kind: "cyclic";
  /** Period in milliseconds */
  periodMs: number;
  /** Loop mode: standard loop or ping-pong */
  mode: "loop" | "pingpong";
  /** Phase domain (always 0..1 for Oscilla) */
  phaseDomain: "0..1";
}

/** Infinite time model with windowing hints */
export interface TimeModelInfinite {
  kind: "infinite";
  /** Window size for exports/sampling */
  windowMs: number;
  /** Suggested window for UI timeline */
  suggestedUIWindowMs?: number;
}

/** Cue point for timeline navigation */
export interface CuePointIR {
  id: string;
  label: string;
  /** Time in milliseconds */
  tMs: number;
  /** Behavior when seeking to this cue point */
  behavior?: "snap" | "event";
}

// ============================================================================
// Schedule IR
// ============================================================================

/**
 * Schedule - Ordered Execution Plan
 *
 * The schedule contains all steps that must be executed per frame,
 * in deterministic order.
 */
export interface ScheduleIR {
  /** Ordered array of execution steps */
  steps: StepIR[];

  /** Mapping from StepId to index in steps array */
  stepIdToIndex: Record<string, number>;

  /** Dependency information for hot-swap and invalidation */
  deps: DependencyIndexIR;

  /** Determinism contract enforcement */
  determinism: DeterminismIR;

  /** Caching policies per step */
  caching: CachingIR;

  /**
   * Initial slot values to populate at runtime initialization.
   * Used for batch descriptor lists and other compile-time-known objects.
   */
  initialSlotValues?: Record<ValueSlot, unknown>;
}

// ============================================================================
// Step IR - Discriminated Union
// ============================================================================

/**
 * StepIR - Execution Step Discriminated Union
 *
 * Each step kind represents a specific operation that must be executed
 * as part of the frame evaluation.
 */
export type StepIR =
  | StepTimeDerive
  | StepSignalEval
  | StepNodeEval
  | StepMaterialize
  | StepRenderAssemble
  | StepDebugProbe;

/** Base properties shared by all step types */
export interface StepBase {
  /** Stable identifier for this step */
  id: string;

  /** Discriminator for step kind */
  kind: string;

  /** Steps that must run before this one */
  deps: string[];

  /** Optional cache key specification for buffer reuse */
  cacheKey?: CacheKeySpec;

  /** Optional debug label for UI/logs */
  label?: string;
}

// ============================================================================
// Step: Time Derivation
// ============================================================================

/**
 * Time Derive Step
 *
 * Computes derived time signals from absolute time and the time model.
 * This is always the first step in every frame.
 */
export interface StepTimeDerive extends StepBase {
  kind: "timeDerive";

  /** Slot containing absolute time in milliseconds */
  tAbsMsSlot: ValueSlot;

  /** Time model used to derive time signals */
  timeModel: TimeModelIR;

  /** Derived time signal slots */
  out: {
    /** Model time in milliseconds */
    tModelMs: ValueSlot;
    /** Phase 0..1 (cyclic models only) */
    phase01?: ValueSlot;
    /** Wrap event trigger (cyclic models only) */
    wrapEvent?: ValueSlot;
    /** Progress 0..1 (finite models only) */
    progress01?: ValueSlot;
  };
}

// ============================================================================
// Step: Signal Eval
// ============================================================================

/**
 * SignalEval Step
 *
 * Evaluates signal expressions and writes their outputs to slots.
 */
export interface StepSignalEval extends StepBase {
  kind: "signalEval";

  /** Signal outputs to evaluate this frame */
  outputs: Array<{ sigId: SigExprId; slot: ValueSlot }>;
}

// ============================================================================
// Step: Node Evaluation
// ============================================================================

/**
 * Node Eval Step
 *
 * Evaluates a single node (block) by reading inputs and writing outputs.
 */
export interface StepNodeEval extends StepBase {
  kind: "nodeEval";

  /** Index of the node being evaluated */
  nodeIndex: number;

  /** Input value slots */
  inputSlots: ValueSlot[];

  /** Output value slots to write */
  outputSlots: ValueSlot[];

  /** State cells read by this node */
  stateReads?: StateId[];

  /** State cells written by this node */
  stateWrites?: StateId[];
}

// ============================================================================
// Step: Materialization
// ============================================================================

/**
 * Materialize Step
 *
 * Evaluates a FieldExpr for a specific domain, producing a buffer.
 */
export interface StepMaterialize extends StepBase {
  kind: "materialize";

  /** Materialization specification */
  materialization: MaterializationIR;
}

/** Materialization specification */
export interface MaterializationIR {
  /** Unique materialization identifier */
  id: string;

  /** Field expression ID to materialize */
  fieldExprId: string;

  /** Domain reference */
  domainSlot: ValueSlot;

  /** Output buffer slot */
  outBufferSlot: ValueSlot;

  /** Buffer format */
  format: BufferFormat;

  /** Cache policy */
  policy: "perFrame" | "onDemand";
}

/** Buffer format specification */
export interface BufferFormat {
  /** Component count (e.g., 1 for scalar, 2 for vec2) */
  components: number;

  /** Element type */
  elementType: "f32" | "f64" | "i32" | "u32" | "u8";
}

// ============================================================================
// Step: Render Assembly
// ============================================================================

/**
 * Render Assemble Step
 *
 * Assembles final RenderFrameIR from materialized buffers and batch descriptors.
 */
export interface StepRenderAssemble extends StepBase {
  kind: "renderAssemble";

  /** Instance2D batches */
  instance2dBatches?: Instance2DBatch[];

  /** Path batches */
  pathBatches?: PathBatch[];

  /** Output slot for final RenderFrameIR */
  outFrameSlot: ValueSlot;
}

/** Instance2D batch descriptor */
export interface Instance2DBatch {
  kind: "instance2d";
  count: number;
  domainSlot: ValueSlot;
  posXYSlot: ValueSlot;
  sizeSlot: ValueSlot;
  colorRGBASlot: ValueSlot;
  opacitySlot: ValueSlot;
  zOrder?: number;
  zOrderSlot?: ValueSlot;
}

/** Path batch descriptor */
export interface PathBatch {
  kind: "path";
  count: number;
  domainSlot: ValueSlot;
  cmdsSlot: ValueSlot;
  paramsSlot: ValueSlot;
  cmdStartSlot: ValueSlot;
  cmdLenSlot: ValueSlot;
  pointStartSlot: ValueSlot;
  pointLenSlot: ValueSlot;
  fillColorSlot?: ValueSlot;
  strokeColorSlot?: ValueSlot;
  strokeWidthSlot?: ValueSlot;
  opacitySlot?: ValueSlot;
  draw: { stroke: boolean; fill: boolean };
  fillRule?: "nonzero" | "evenodd";
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
  miterLimit?: number;
  dash?: { pattern: number[]; offset?: number } | null;
  zOrder?: number;
  zOrderSlot?: ValueSlot;
}

// ============================================================================
// Step: Debug Probe
// ============================================================================

/**
 * Debug Probe Step
 *
 * Inserted for debugging/tracing. Can be enabled/disabled without recompiling.
 */
export interface StepDebugProbe extends StepBase {
  kind: "debugProbe";

  /** Debug probe specification */
  probe: DebugProbeIR;
}

/** Debug probe specification */
export interface DebugProbeIR {
  /** Probe identifier */
  id: string;

  /** Slots to probe */
  slots: ValueSlot[];

  /** Probe mode */
  mode: "value" | "trace" | "breakpoint";
}

// ============================================================================
// Dependency Index
// ============================================================================

/**
 * Dependency Index
 *
 * Tracks dependencies between steps and slots.
 */
export interface DependencyIndexIR {
  /** Maps slot to the step that produces it */
  slotProducerStep: Record<ValueSlot, string>;

  /** Maps slot to steps that consume it */
  slotConsumers: Record<ValueSlot, string[]>;

  /** Field expression dependencies */
  exprDependsOnExpr?: Record<string, string[]>;

  /** Field expression slot dependencies */
  exprDependsOnSlots?: Record<string, ValueSlot[]>;
}

// ============================================================================
// Determinism Contract
// ============================================================================

/**
 * Determinism Contract
 *
 * Specifies what inputs are allowed to affect ordering and results.
 */
export interface DeterminismIR {
  /** Allowed inputs that can affect ordering */
  allowedOrderingInputs: Array<
    | { kind: "publisherIdTieBreak" }
    | { kind: "topoStableNodeIdTieBreak" }
  >;

  /** Stable tie-breaker for topological sorts */
  topoTieBreak: "nodeIdLex" | "nodeIndex";
}

// ============================================================================
// Caching Policy
// ============================================================================

/**
 * Caching Policy IR
 *
 * Per-step and per-materialization caching hints.
 */
export interface CachingIR {
  /** Per-step caching hints */
  stepCache: Record<string, CacheKeySpec>;

  /** Field materialization caching */
  materializationCache: Record<string, CacheKeySpec>;
}

/**
 * Cache Key Specification
 */
export type CacheKeySpec =
  | { kind: "none" }
  | { kind: "perFrame" }
  | { kind: "untilInvalidated"; deps: CacheDep[] };

/**
 * Cache Dependency
 */
export type CacheDep =
  | { kind: "slot"; slot: ValueSlot }
  | { kind: "timeModel" }
  | { kind: "seed" }
  | { kind: "stateCell"; stateId: StateId }
  | { kind: "external"; id: string };
