/**
 * Step-Through Schedule Debugger — Type Definitions
 *
 * Pure types used by the stepped executor, session controller, and store.
 * No logic — only type definitions.
 */

import type { Step, StateSlotId, StableStateId } from '../compiler/ir/types';
import type { ValueSlot, BlockId, PortId } from '../compiler/ir/program';
import type { CanonicalType } from '../core/canonical-types';
import type { InstanceId } from '../core/ids';

// =============================================================================
// Execution Phase
// =============================================================================

/**
 * Which phase of the two-phase execution model the debugger is paused at.
 */
export type ExecutionPhase =
  | 'pre-frame'
  | 'phase1'
  | 'phase-boundary'
  | 'phase2'
  | 'post-frame';

// =============================================================================
// Slot Value (read-only snapshot of a slot's contents)
// =============================================================================

export type SlotValue =
  | { readonly kind: 'scalar'; readonly value: number; readonly type: CanonicalType }
  | { readonly kind: 'buffer'; readonly buffer: ArrayBufferView; readonly count: number; readonly type: CanonicalType }
  | { readonly kind: 'event'; readonly fired: boolean }
  | { readonly kind: 'object'; readonly ref: unknown };

// =============================================================================
// State Slot Value (read-only snapshot of a state.state[] entry)
// =============================================================================

/**
 * Snapshot of a state slot value after a Phase 2 stateWrite/fieldStateWrite.
 *
 * State slots live in `state.state[]` (Float64Array), indexed by StateSlotId.
 * They persist across frames (unlike ValueSlot values which are per-frame).
 * The `stateId` provides human-readable identification (e.g., "osc1:phase").
 */
export type StateSlotValue =
  | { readonly kind: 'scalar'; readonly value: number; readonly stateId: StableStateId }
  | { readonly kind: 'field'; readonly values: readonly number[]; readonly stateId: StableStateId; readonly laneCount: number };

// =============================================================================
// Value Anomaly (NaN / Infinity detection)
// =============================================================================

export interface ValueAnomaly {
  readonly slot: ValueSlot;
  readonly kind: 'nan' | 'infinity' | 'neg-infinity';
  readonly blockId: BlockId | null;
  readonly portId: PortId | null;
}

// =============================================================================
// Step Snapshot
// =============================================================================

/**
 * Snapshot of the runtime state captured after each schedule step executes.
 */
export interface StepSnapshot {
  /** Step index in the schedule (-1 for phase markers) */
  readonly stepIndex: number;
  /** The step that was executed (null for phase markers) */
  readonly step: Step | null;
  /** Current execution phase */
  readonly phase: ExecutionPhase;
  /** Total number of steps in the schedule */
  readonly totalSteps: number;
  /** Source block ID (from debugIndex.stepToBlock) */
  readonly blockId: BlockId | null;
  /** Human-readable block name (from debugIndex.blockMap) */
  readonly blockName: string | null;
  /** Source port ID (from debugIndex.stepToPort) */
  readonly portId: PortId | null;
  /** Current frame ID */
  readonly frameId: number;
  /** Absolute time in milliseconds */
  readonly tMs: number;
  /** Slots written by this step (slot -> value snapshot) */
  readonly writtenSlots: ReadonlyMap<ValueSlot, SlotValue>;
  /** State slots written by this step (Phase 2 stateWrite/fieldStateWrite) */
  readonly writtenStateSlots: ReadonlyMap<StateSlotId, StateSlotValue>;
  /** Anomalies detected in written values */
  readonly anomalies: readonly ValueAnomaly[];
  /** Previous frame's slot values for comparison (null on first frame) */
  readonly previousFrameValues: ReadonlyMap<ValueSlot, number> | null;
}

// =============================================================================
// Breakpoints
// =============================================================================

export type Breakpoint =
  | { readonly kind: 'step-index'; readonly index: number }
  | { readonly kind: 'block-id'; readonly blockId: BlockId }
  | { readonly kind: 'phase-boundary' }
  | { readonly kind: 'anomaly' }
  | { readonly kind: 'slot-condition'; readonly slot: ValueSlot; readonly label: string; readonly predicate: (v: number) => boolean }
  | { readonly kind: 'value-delta'; readonly slot: ValueSlot; readonly threshold: number };

// =============================================================================
// Session Mode
// =============================================================================

export type SessionMode = 'idle' | 'paused' | 'running' | 'completed';

// =============================================================================
// Lane Identity (F5: Continuity State Integration)
// =============================================================================

/**
 * Identity information for a single lane within a field (per-instance-element).
 *
 * Enriches "lane 37 = 0.5" with context like "element #37 from spiral instance".
 */
export interface LaneIdentity {
  /** Which instance this lane belongs to */
  readonly instanceId: InstanceId;
  /** Human-readable instance label (from debugIndex.blockMap or instance decl) */
  readonly instanceLabel: string;
  /** Lane index within the instance's domain */
  readonly laneIndex: number;
  /** Total lane count for this instance */
  readonly totalLanes: number;
  /** Optional: domain element identity from continuity (e.g., "element #37") */
  readonly elementId?: string;
}

// =============================================================================
// Frame Summary (E5: Non-technical user ergonomics)
// =============================================================================

/**
 * Per-block summary derived from step history after a frame completes.
 * Groups steps by source block and aggregates metrics for non-technical display.
 */
export interface BlockSummary {
  readonly blockId: BlockId | null;
  readonly blockName: string;
  readonly stepCount: number;
  readonly anomalyCount: number;
  readonly portNames: readonly string[];
  /** Min/max of scalar slot values written by this block, or null if none */
  readonly scalarRange: { readonly min: number; readonly max: number } | null;
  /** Total lane count from buffer slots (field materialization), or null */
  readonly fieldLaneCount: number | null;
  /** Step kinds produced by this block */
  readonly stepKinds: ReadonlySet<string>;
}

/**
 * Human-readable summary of an entire frame's execution.
 * Derived purely from StepSnapshot history — no new data sources.
 */
export interface FrameSummary {
  readonly totalSteps: number;
  readonly blocks: readonly BlockSummary[];
  readonly totalAnomalies: number;
  readonly phase1Steps: number;
  readonly phase2Steps: number;
}

// =============================================================================
// Block-Grouped History (E5: Block-centric view)
// =============================================================================

/**
 * A group of steps belonging to a single block, for the block-centric view.
 */
export interface BlockGroup {
  readonly blockId: BlockId | null;
  readonly blockName: string;
  readonly steps: readonly StepSnapshot[];
  readonly anomalyCount: number;
}

// =============================================================================
// Expression Tree View Model (E3: DAG visualization)
// =============================================================================

/**
 * View model for a single node in the expression DAG tree.
 *
 * Built by StepDebugStore.buildExprTree() from the compiled program's
 * ValueExpr table + debugIndex provenance. The UI component receives only
 * this type — never CompiledProgramIR or ValueExpr directly.
 */
export interface ExprTreeNode {
  /** ValueExprId (as number, for keying) */
  readonly id: number;
  /** Expression kind label (e.g. 'kernel:map', 'const', 'event:pulse') */
  readonly label: string;
  /** Source block display name (from debugIndex.blockMap), or null */
  readonly blockName: string | null;
  /** Current scalar value (from runtime cache), or null if not a cached scalar */
  readonly value: number | null;
  /** Whether value contains NaN or Infinity */
  readonly isAnomaly: boolean;
  /** Child nodes (built recursively, cycle-safe via visited set) */
  readonly children: readonly ExprTreeNode[];
}
