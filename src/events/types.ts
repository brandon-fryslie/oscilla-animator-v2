/**
 * Event System - Core Event Types
 *
 * Defines all editor events for application-wide coordination:
 *
 * **Diagnostic Events** (existing):
 * - GraphCommitted, CompileBegin, CompileEnd, ProgramSwapped, RuntimeHealthSnapshot
 * - ParamChanged, BlockLowered
 *
 * **Patch Events** (new - emitted by PatchStore):
 * - BlockAdded, BlockRemoved, BlockUpdated
 * - EdgeAdded, EdgeRemoved, PatchReset
 *
 * **Runtime Events** (new - emitted by RuntimeService):
 * - PlaybackStateChanged, RuntimeError
 *
 * **Selection Events** (new - emitted by SelectionStore):
 * - SelectionChanged, HoverChanged
 *
 * **UI Events** (new - emitted by UI components):
 * - PanelLayoutChanged, ViewportChanged
 *
 * **Editor State Events** (new - emitted by EditorStateStore):
 * - EditorStateChanged
 *
 * Events use a discriminated union for type-safe event handling.
 *
 * Spec Reference: design-docs/_new/01-Event-System.md
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
// PATCH EVENTS - Emitted by PatchStore
// =============================================================================

/**
 * Emitted when a block is added to the patch.
 *
 * Triggers:
 * - Drag from block library
 * - Paste/duplicate operations
 * - Undo of block removal
 *
 * Spec: design-docs/_new/01-Event-System.md
 */
export interface BlockAddedEvent {
  readonly type: 'BlockAdded';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly blockId: string;
  readonly blockType: string;
}

/**
 * Emitted when a block is removed from the patch.
 *
 * Triggers:
 * - Delete key or context menu delete
 * - Undo of block addition
 *
 * Note: Connected edges are removed first, emitting EdgeRemoved events.
 */
export interface BlockRemovedEvent {
  readonly type: 'BlockRemoved';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly blockId: string;
}

/**
 * Emitted when a block is updated (connections, params, properties).
 *
 * Triggers:
 * - Wire connected or disconnected
 * - Parameter value changed
 * - Default source value changed
 * - Display name changed
 * - Any patch-relevant property changed
 *
 * This consolidates multiple change types into a single event.
 */
export interface BlockUpdatedEvent {
  readonly type: 'BlockUpdated';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly blockId: string;
  readonly changeType: 'connection' | 'param' | 'defaultSource' | 'displayName' | 'other';
  /** Optional: specific property that changed */
  readonly property?: string;
}

/**
 * Emitted when an edge is added to the patch.
 *
 * Triggers:
 * - User connects two ports via drag
 * - Paste operation includes edges
 */
export interface EdgeAddedEvent {
  readonly type: 'EdgeAdded';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly edgeId: string;
  readonly sourceBlockId: string;
  readonly targetBlockId: string;
}

/**
 * Emitted when an edge is removed from the patch.
 *
 * Triggers:
 * - User disconnects wire
 * - Block removal cascades to edge removal
 */
export interface EdgeRemovedEvent {
  readonly type: 'EdgeRemoved';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly edgeId: string;
}

/**
 * Emitted when the entire patch is replaced.
 *
 * Triggers:
 * - New file created
 * - File loaded from disk
 * - Full patch import
 *
 * Listeners should clear transient state and re-sync.
 */
export interface PatchResetEvent {
  readonly type: 'PatchReset';
  readonly patchId: string;
  readonly patchRevision: number;
}

// =============================================================================
// RUNTIME EVENTS - Emitted by RuntimeService
// =============================================================================

/**
 * Emitted when playback state changes.
 *
 * Triggers:
 * - Play button pressed
 * - Pause button pressed
 * - Stop button pressed
 */
export interface PlaybackStateChangedEvent {
  readonly type: 'PlaybackStateChanged';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly state: 'playing' | 'paused' | 'stopped';
  readonly previousState?: 'playing' | 'paused' | 'stopped';
}

/**
 * Emitted when a runtime error occurs.
 *
 * Triggers:
 * - NaN detected in computation
 * - Infinity detected in computation
 * - Other runtime anomalies
 */
export interface RuntimeErrorEvent {
  readonly type: 'RuntimeError';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly errorType: 'nan' | 'infinity' | 'overflow' | 'other';
  readonly blockId?: string;
  readonly fieldName?: string;
  readonly message: string;
}

// =============================================================================
// SELECTION EVENTS - Emitted by SelectionStore
// =============================================================================

/**
 * Selection target types.
 */
export type SelectionTarget =
  | { type: 'block'; blockId: string }
  | { type: 'edge'; edgeId: string }
  | { type: 'port'; blockId: string; portKey: string }
  | { type: 'none' };

/**
 * Emitted when the selection changes.
 *
 * Triggers:
 * - User clicks a block
 * - User clicks an edge
 * - User clicks canvas (deselect)
 * - Multi-select operations
 */
export interface SelectionChangedEvent {
  readonly type: 'SelectionChanged';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly selection: SelectionTarget | readonly SelectionTarget[];
  readonly previousSelection?: SelectionTarget | readonly SelectionTarget[];
}

/**
 * Hover target types.
 */
export type HoverTarget =
  | { type: 'block'; blockId: string }
  | { type: 'edge'; edgeId: string }
  | { type: 'port'; blockId: string; portKey: string; isInput: boolean }
  | null;

/**
 * Emitted when the hover target changes.
 *
 * Triggers:
 * - Mouse enters a block
 * - Mouse enters a port
 * - Mouse leaves hovered element
 *
 * Note: May be debounced to prevent excessive events.
 */
export interface HoverChangedEvent {
  readonly type: 'HoverChanged';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly hovered: HoverTarget;
}

// =============================================================================
// UI EVENTS - Emitted by UI components/stores
// =============================================================================

/**
 * Panel layout information.
 */
export interface PanelLayout {
  readonly panels: ReadonlyArray<{
    readonly id: string;
    readonly visible: boolean;
    readonly position?: { x: number; y: number; width: number; height: number };
  }>;
}

/**
 * Emitted when panel layout changes.
 *
 * Triggers:
 * - Dockview panels rearranged
 * - Panel shown/hidden
 */
export interface PanelLayoutChangedEvent {
  readonly type: 'PanelLayoutChanged';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly layout: PanelLayout;
}

/**
 * Graph editor viewport information.
 */
export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/**
 * Emitted when viewport changes.
 *
 * Triggers:
 * - User pans the graph editor
 * - User zooms in/out
 * - Fit-to-view operations
 */
export interface ViewportChangedEvent {
  readonly type: 'ViewportChanged';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly viewport: Viewport;
}

// =============================================================================
// EDITOR STATE EVENTS - Emitted by EditorStateStore
// =============================================================================

/**
 * Editor location types.
 */
export type EditorLocation = 'node' | 'inspector' | 'dialog';

/**
 * Editor information for coordination.
 */
export interface EditorInfo {
  readonly id: string;
  readonly editorType: 'displayName' | 'param' | 'expression' | 'other';
  readonly location: EditorLocation;
}

/**
 * Emitted when editor state changes for coordination.
 *
 * Used to prevent conflicting edits when multiple editors are open.
 *
 * Lifecycle:
 * 1. editStarted - Editor gains focus
 * 2. validityChanged - Editor value validated (may be invalid)
 * 3. editEnded - Editor loses focus or commits
 *
 * Spec: design-docs/_new/01-Event-System.md (Editor State Coordination)
 */
export interface EditorStateChangedEvent {
  readonly type: 'EditorStateChanged';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly action: 'editStarted' | 'validityChanged' | 'editEnded';
  readonly editor?: EditorInfo;
  readonly isValid?: boolean;
  readonly error?: string;
}

// =============================================================================
// EditorEvent Discriminated Union
// =============================================================================

export type EditorEvent =
  // Diagnostic events (existing)
  | GraphCommittedEvent
  | CompileBeginEvent
  | CompileEndEvent
  | ProgramSwappedEvent
  | RuntimeHealthSnapshotEvent
  | ParamChangedEvent
  | BlockLoweredEvent
  // Patch events (new)
  | BlockAddedEvent
  | BlockRemovedEvent
  | BlockUpdatedEvent
  | EdgeAddedEvent
  | EdgeRemovedEvent
  | PatchResetEvent
  // Runtime events (new)
  | PlaybackStateChangedEvent
  | RuntimeErrorEvent
  // Selection events (new)
  | SelectionChangedEvent
  | HoverChangedEvent
  // UI events (new)
  | PanelLayoutChangedEvent
  | ViewportChangedEvent
  // Editor state events (new)
  | EditorStateChangedEvent;
