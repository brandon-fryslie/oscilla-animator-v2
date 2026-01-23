/**
 * Event System - Core Event Types
 *
 * Defines the five core editor events for the diagnostics system:
 * 1. GraphCommitted - Patch mutation committed
 * 2. CompileBegin - Compilation started
 * 3. CompileEnd - Compilation finished (success or failure)
 * 4. ProgramSwapped - New compiled program activated
 * 5. RuntimeHealthSnapshot - Runtime health metrics
 *
 * Events use a discriminated union for type-safe event handling.
 *
 * Spec Reference: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/12-event-hub.md
 */

import type { Diagnostic } from '../diagnostics/types';

// =============================================================================
// GraphCommitted Event
// =============================================================================

/**
 * Emitted when a graph mutation is committed to the PatchStore.
 *
 * Triggers:
 * - User edits (add/remove/modify block/edge)
 * - Macro expansion
 * - Import/paste operations
 * - Undo/redo
 *
 * DiagnosticHub Action:
 * - Run authoring validators
 * - Update authoring snapshot
 */
export interface GraphCommittedEvent {
  readonly type: 'GraphCommitted';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly reason: 'userEdit' | 'macroExpand' | 'import' | 'undo' | 'redo';
  readonly diffSummary: {
    readonly blocksAdded: number;
    readonly blocksRemoved: number;
    readonly edgesChanged: number;
  };
  readonly affectedBlockIds?: readonly string[];
}

// =============================================================================
// CompileBegin Event
// =============================================================================

/**
 * Emitted when compilation starts.
 *
 * Triggers:
 * - GraphCommitted (automatic recompile)
 * - Manual compile button
 * - Application startup
 *
 * DiagnosticHub Action:
 * - Set pendingCompileRevision
 * - Clear stale compile diagnostics (optional)
 */
export interface CompileBeginEvent {
  readonly type: 'CompileBegin';
  readonly compileId: string;
  readonly patchId: string;
  readonly patchRevision: number;
  readonly trigger: 'graphCommitted' | 'manual' | 'startup';
}

// =============================================================================
// CompileEnd Event
// =============================================================================

/**
 * Emitted when compilation finishes (success or failure).
 *
 * Contains diagnostics from compilation (type errors, missing inputs, etc.).
 *
 * DiagnosticHub Action:
 * - **Replace** compile snapshot for this revision (not merge!)
 * - Increment diagnostics revision
 * - Trigger UI updates
 */
export interface CompileEndEvent {
  readonly type: 'CompileEnd';
  readonly compileId: string;
  readonly patchId: string;
  readonly patchRevision: number;
  readonly status: 'success' | 'failure';
  readonly durationMs: number;
  readonly diagnostics: readonly Diagnostic[];
}

// =============================================================================
// ProgramSwapped Event
// =============================================================================

/**
 * Emitted when a newly compiled program is activated in the runtime.
 *
 * SwapMode:
 * - hard: Full restart (state cleared)
 * - soft: Hot reload (state preserved where possible)
 *
 * DiagnosticHub Action:
 * - Update activeRevision pointer
 * - Clear runtime diagnostics from previous revision (optional)
 */
export interface ProgramSwappedEvent {
  readonly type: 'ProgramSwapped';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly compileId: string;
  readonly swapMode: 'hard' | 'soft';
  /** Instance counts from the new program's schedule (optional diagnostic info) */
  readonly instanceCounts?: ReadonlyMap<string, number>;
}

// =============================================================================
// RuntimeHealthSnapshot Event
// =============================================================================

/**
 * Emitted periodically during runtime execution.
 *
 * Contains runtime diagnostics (NaN, Inf, performance issues).
 *
 * DiagnosticHub Action:
 * - Merge runtime diagnostics (update counts, expiry)
 * - Emit diagnosticsDelta for incremental updates
 *
 * Sprint 1: Not fully implemented (deferred to Sprint 2).
 */
export interface RuntimeHealthSnapshotEvent {
  readonly type: 'RuntimeHealthSnapshot';
  readonly patchId: string;
  readonly activePatchRevision: number;
  readonly tMs: number;
  readonly frameBudget: {
    readonly fpsEstimate: number;
    readonly avgFrameMs: number;
    readonly worstFrameMs?: number;
  };
  readonly evalStats: {
    readonly fieldMaterializations: number;
    readonly nanCount: number;
    readonly infCount: number;
  };
  readonly assemblerStats?: {
    readonly avgGroupingMs: number;
    readonly avgSlicingMs: number;
    readonly avgTotalMs: number;
    readonly cacheHits: number;
    readonly cacheMisses: number;
  };
  readonly diagnosticsDelta?: {
    readonly raised: readonly Diagnostic[];
    readonly resolved: readonly string[];
  };
}

// =============================================================================
// EditorEvent Discriminated Union
// =============================================================================

/**
 * EditorEvent is the discriminated union of all editor events.
 *
 * Use the 'type' field to discriminate between event kinds.
 * TypeScript will narrow the type based on the discriminator.
 *
 * Example:
 * ```typescript
 * function handleEvent(event: EditorEvent) {
 *   switch (event.type) {
 *     case 'CompileEnd':
 *       console.log(`Compiled in ${event.durationMs}ms`);
 *       break;
 *     case 'GraphCommitted':
 *       console.log(`Graph updated: ${event.patchRevision}`);
 *       break;
 *     // ... other cases
 *   }
 * }
 * ```
 */
// =============================================================================
// ParamChanged Event
// =============================================================================

/**
 * Emitted when a block's parameters are updated.
 *
 * Triggers:
 * - User edits block params via inspector
 * - Slider changes
 * - Programmatic param updates
 *
 * DiagnosticHub Action:
 * - Log to LogPanel for param flow visibility
 */
export interface ParamChangedEvent {
  readonly type: 'ParamChanged';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly blockId: string;
  readonly blockType: string;
  readonly paramKey: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

// =============================================================================
// BlockLowered Event
// =============================================================================

/**
 * Emitted when a block is lowered during Pass 6 compilation.
 *
 * Triggers:
 * - Block lowering during compilation
 * - Instance-creating blocks (e.g., Array) produce instanceCount
 *
 * DiagnosticHub Action:
 * - Log instance creation for compiler visibility
 */
export interface BlockLoweredEvent {
  readonly type: 'BlockLowered';
  readonly compileId: string;
  readonly patchRevision: number;
  readonly blockId: string;
  readonly blockType: string;
  readonly instanceId?: string;
  readonly instanceCount?: number;
}

// =============================================================================
// EditorEvent Discriminated Union
// =============================================================================

export type EditorEvent =
  | GraphCommittedEvent
  | CompileBeginEvent
  | CompileEndEvent
  | ProgramSwappedEvent
  | RuntimeHealthSnapshotEvent
  | ParamChangedEvent
  | BlockLoweredEvent;
