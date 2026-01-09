Here is the single canonical version of this module, rewritten to match the “one spec, no options” contract we just locked:
	•	irVersion → 1 (number literal) (not string)
	•	outputs is mandatory (runtime reads render output from here, not render.sinks)
	•	constants is JSON-only (no typed arrays, no ConstPool)
	•	defaultSources removed (you said these are resolved into normal blocks pre-compile)
	•	slotMeta entries include offset (required) (runtime must not compute offsets)
	•	debugIndex is mandatory and typed (not unknown, not optional)
	•	render.sinks may remain as compile-time metadata, but it is not output selection.

Drop-in replacement (entire file):

/**
 * Compiled Program IR - Top-Level Container (CANONICAL)
 *
 * Single compiler output contract. Runtime consumes only this structure.
 * No legacy schema. No closures. No hidden behavior.
 *
 * References:
 * - design-docs/12-Compiler-Final/02-IR-Schema.md §3
 * - design-docs/12-Compiler-Final/14-Compiled-IR-Program-Contract.md §1-9
 */

import type { TypeTable, ValueSlot, TypeDesc } from "./types";
import type { TimeModelIR, ScheduleIR } from "./schedule";
import type { StateLayout } from "./stores";
import type { SignalExprTable } from "./signalExpr";
import type { FieldExprTable } from "./fieldExpr";
import type { EventExprTable } from "./signalExpr"; // EventExprTable lives in signalExpr.ts
import type { CameraTable, MeshTable, CameraId } from "./types3d";

// ============================================================================
// Top-Level Compiled Program (CANONICAL)
// ============================================================================

export interface CompiledProgramIR {
  // ============================================================================
  // Identity & Versioning
  // ============================================================================

  /** Stable patch ID */
  readonly patchId: string;

  /** Deterministic seed */
  readonly seed: number;

  /** IR schema version (MUST be literal 1) */
  readonly irVersion: 1;

  // ============================================================================
  // Time
  // ============================================================================

  /** Exactly one TimeModel per program */
  readonly timeModel: TimeModelIR;

  // ============================================================================
  // Types
  // ============================================================================

  /** All types referenced by expr tables / slots */
  readonly types: TypeTable;

  // ============================================================================
  // Execution Tables
  // ============================================================================

  readonly signalExprs: SignalExprTable;
  readonly fieldExprs: FieldExprTable;
  readonly eventExprs: EventExprTable;

  // ============================================================================
  // Constants (JSON-only)
  // ============================================================================

  readonly constants: {
    readonly json: readonly unknown[];
  };

  // ============================================================================
  // State
  // ============================================================================

  readonly stateLayout: StateLayout;

  // ============================================================================
  // Slots (authoritative memory layout + debug/type metadata)
  // ============================================================================

  readonly slotMeta: readonly SlotMetaEntry[];

  // ============================================================================
  // Render & 3D Metadata (NOT used for output selection)
  // ============================================================================

  readonly render: RenderIR;
  readonly cameras: CameraTable;
  readonly meshes: MeshTable;
  readonly primaryCameraId?: CameraId;

  // ============================================================================
  // Schedule (runtime executes only this)
  // ============================================================================

  readonly schedule: ScheduleIR;

  // ============================================================================
  // Outputs (runtime reads render output ONLY from here)
  // ============================================================================

  readonly outputs: readonly OutputSpecIR[];

  // ============================================================================
  // Debug Index (mandatory; enables stable debugging under graph churn)
  // ============================================================================

  readonly debugIndex: DebugIndexIR;

  // ============================================================================
  // Optional diagnostics (pure metadata; never required for execution)
  // ============================================================================

  readonly sourceMap?: SourceMapIR;
  readonly warnings?: readonly CompilerWarning[];
}

// ============================================================================
// Outputs
// ============================================================================

/**
 * The runtime MUST extract the render product from program.outputs[0].
 * Exactly one output is expected for now.
 */
export interface OutputSpecIR {
  readonly kind: "renderFrame";
  readonly slot: ValueSlot; // ValueStore slot containing RenderFrameIR object
}

// ============================================================================
// Slot Metadata
// ============================================================================

export interface SlotMetaEntry {
  /** Slot id */
  readonly slot: ValueSlot;

  /** Storage backing */
  readonly storage: "f64" | "f32" | "i32" | "u32" | "object";

  /**
   * Byte/element offset into the backing store for this slot.
   * REQUIRED. Runtime MUST NOT compute offsets.
   */
  readonly offset: number;

  /** Type descriptor for validation/debug */
  readonly type: TypeDesc;

  /** Optional debug label */
  readonly debugName?: string;
}

// ============================================================================
// Render IR (metadata only; not output selection)
// ============================================================================

export interface RenderIR {
  /** Compile-time sink metadata; runtime output selection uses program.outputs */
  readonly sinks: readonly RenderSinkIR[];
}

export interface RenderSinkIR {
  readonly sinkType: string;
  readonly inputs: Record<string, ValueSlot>;
}

// ============================================================================
// Debug Index (mandatory)
// ============================================================================

export interface DebugIndexIR {
  /**
   * Stable mapping from schedule step -> source block.
   * Debug UIs group/label execution using this, not program.nodes.
   */
  readonly stepToBlock: ReadonlyMap<string, string>;

  /**
   * Stable mapping from produced slot -> source block.
   * Used for “where did this value come from?”
   */
  readonly slotToBlock: ReadonlyMap<ValueSlot, string>;

  /** Optional human labels */
  readonly labels?: ReadonlyMap<string, string>;
}

// ============================================================================
// Diagnostics
// ============================================================================

export interface SourceMapIR {
  /** Maps expr-node id → source BlockId (if you still have expr ids) */
  readonly nodeToBlock?: Record<string, string>;

  /** Maps value slot → (node id, port name) */
  readonly slotToPort?: Record<number, { nodeId: string; port: string }>;
}

export interface CompilerWarning {
  readonly severity: "info" | "warn";
  readonly category: "unused" | "performance" | "type-coercion" | "other";
  readonly message: string;
  readonly source?: {
    readonly blockId?: string;
    readonly busId?: string;
    readonly portName?: string;
  };
}

/** @deprecated */
export type CompiledProgram = CompiledProgramIR;

Notes on the deltas you’ll need elsewhere (so engineers don’t improvise)
	1.	Remove ConstPool usage everywhere: runtime const reads become program.constants.json[id].
	2.	Stop reading output from program.render.sinks: runtime MUST use program.outputs[0].
	3.	Delete defaultSources from IR: since you resolve them into real patch blocks pre-compile.
	4.	slotMeta.offset must be set by compiler slot allocator: runtime cannot infer it.

If you paste your current RuntimeState slot allocation code (the part that builds typed arrays / object arrays), I’ll tell you exactly how to compute and assign offset deterministically during compilation so runtime becomes trivial.