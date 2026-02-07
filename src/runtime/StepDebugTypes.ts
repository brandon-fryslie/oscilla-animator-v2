/**
 * Step-Through Schedule Debugger — Type Definitions
 *
 * Pure types used by the stepped executor, session controller, and store.
 * No logic — only type definitions.
 */

import type { Step } from '../compiler/ir/types';
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
