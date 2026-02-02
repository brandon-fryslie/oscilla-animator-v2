/**
 * Diagnostics System - Core Types
 *
 * Defines the foundational types for the diagnostics system:
 * - TargetRef: Discriminated union for identifying diagnostic targets
 * - Diagnostic: Full diagnostic interface with stable IDs
 * - DiagnosticCode: Enumeration of all diagnostic codes
 * - Severity: Diagnostic severity levels
 * - Domain: Classification of diagnostic sources
 *
 * Spec Reference: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/07-diagnostics-system.md
 */

// =============================================================================
// TargetRef - Discriminated Union for Diagnostic Targets
// =============================================================================

/**
 * TargetRef identifies what entity a diagnostic refers to.
 * Uses discriminated union for type safety and exhaustiveness checking.
 *
 * Seven kinds:
 * - block: Individual block
 * - port: Specific port on a block
 * - bus: Bus entity (removed in Bus-Block Unification, kept for compatibility)
 * - binding: Publisher/subscriber binding
 * - timeRoot: TimeRoot block (specialized block reference)
 * - graphSpan: Multiple blocks (e.g., cycle, island, disconnected subgraph)
 * - composite: Composite definition or instance
 */
export type TargetRef =
  | { kind: 'block'; blockId: string }
  | { kind: 'port'; blockId: string; portId: string }
  | { kind: 'bus'; busId: string }
  | {
      kind: 'binding';
      bindingId: string;
      busId: string;
      blockId: string;
      direction: 'publish' | 'subscribe';
    }
  | { kind: 'timeRoot'; blockId: string }
  | {
      kind: 'graphSpan';
      blockIds: string[];
      spanKind?: 'cycle' | 'island' | 'subgraph';
    }
  | { kind: 'composite'; compositeDefId: string; instanceId?: string };

// =============================================================================
// Severity Levels
// =============================================================================

/**
 * Diagnostic severity levels (ordered from most to least severe).
 *
 * - fatal: Unrecoverable error (system cannot proceed)
 * - error: Compilation/runtime failure (must fix to run)
 * - warn: Potential problem (runs but may not behave as expected)
 * - info: Informational message (helpful context)
 * - hint: Suggestion for improvement (purely advisory)
 */
export type Severity = 'fatal' | 'error' | 'warn' | 'info' | 'hint';

// =============================================================================
// Domain Classification
// =============================================================================

/**
 * Domain indicates the phase/subsystem that raised the diagnostic.
 *
 * - authoring: Graph structure validation (runs immediately on edit)
 * - compile: Type checking, cycle detection (runs before program swap)
 * - runtime: Execution-time issues (NaN, Inf, performance)
 * - perf: Performance warnings and profiling insights
 */
export type Domain = 'authoring' | 'compile' | 'runtime' | 'perf';

// =============================================================================
// Diagnostic Codes
// =============================================================================

/**
 * DiagnosticCode is a stable, unique identifier for each diagnostic type.
 * Codes are organized by category for readability.
 *
 * Sprint 1: P0 codes (time, topology, types, graph quality)
 * Sprint 2: Runtime diagnostics, bus warnings
 */
export type DiagnosticCode =
  // --- Time & Topology Errors ---
  | 'E_TIME_ROOT_MISSING' // No TimeRoot block found
  | 'E_TIME_ROOT_MULTIPLE' // Multiple TimeRoot blocks found

  // --- Type System Errors ---
  | 'E_TYPE_MISMATCH' // Port types cannot unify
  | 'E_DOMAIN_MISMATCH' // Domain cardinalities conflict
  | 'E_AXIS_INVALID' // Axis invariant violation (Item #20)

  // --- Cardinality Errors (Sprint 2A - Cardinality-Generic Blocks) ---
  | 'E_CARDINALITY_MISMATCH' // Block output cardinality differs from required preserved cardinality
  | 'E_INSTANCE_MISMATCH' // Two many inputs unify to different InstanceRefs
  | 'E_LANE_COUPLED_DISALLOWED' // Block is lane-coupled but used in generic context
  | 'E_IMPLICIT_BROADCAST_DISALLOWED' // Signal consumed in Field context without explicit broadcast

  // --- Payload Errors (Sprint 2B - Payload-Generic Blocks) ---
  | 'E_PAYLOAD_NOT_ALLOWED' // Payload type not in block's allowedPayloads for port
  | 'E_PAYLOAD_COMBINATION_NOT_ALLOWED' // Input payload tuple not in block's combination table
  | 'E_UNIT_MISMATCH' // Units present but disallowed by block's unit contract
  | 'E_IMPLICIT_CAST_DISALLOWED' // Attempt to coerce payload without explicit cast block

  // --- Const Block Errors ---
  | 'E_CONST_VALUE_INVALID' // Const block value doesn't match resolved payload type

  // --- Graph Structure Errors ---
  | 'E_CYCLE_DETECTED' // Cycle with no stateful boundary
  | 'E_MISSING_INPUT' // Required input not connected
  | 'E_UNKNOWN_BLOCK_TYPE' // Block type not registered

  // --- Graph Quality Warnings ---
  | 'W_GRAPH_DISCONNECTED_BLOCK' // Block not reachable from TimeRoot
  | 'W_GRAPH_UNUSED_OUTPUT' // Block output has no consumers
  | 'W_BLOCK_UNREACHABLE_ERROR' // Block has error but is not reachable from render (Error Isolation)
  | 'W_FLAG_DOWNGRADED' // Compiler error downgraded to warning by diagnostic flag setting

  // --- Bus Warnings (Sprint 2 - Compile Stream) ---
  | 'W_BUS_EMPTY' // Bus has publishers but no listeners
  | 'W_BUS_NO_PUBLISHERS' // Bus has listeners but no publishers (silent value)

  // --- Performance Diagnostics (Sprint 2 - Runtime Stream) ---
  | 'P_NAN_DETECTED' // NaN value produced during evaluation
  | 'P_INFINITY_DETECTED' // Infinity value produced during evaluation
  | 'P_FRAME_BUDGET_EXCEEDED' // Frame eval exceeded time budget

  // --- Expression DSL Errors (Sprint 3 - Expression Integration) ---
  | 'E_EXPR_SYNTAX' // Expression syntax error (parse failure)
  | 'E_EXPR_TYPE' // Expression type error (type check failure)
  | 'E_EXPR_COMPILE' // Expression compilation error (IR generation failure)

  // --- Authoring Hints ---
  | 'I_SILENT_VALUE_USED' // Unconnected input using default value (pre-normalization only)

  // --- Compile Info ---
  | 'I_COMPILE_SUCCESS'; // Compilation successful (info)

// =============================================================================
// Diagnostic Payload (Extensible per Code)
// =============================================================================

/**
 * DiagnosticPayload provides code-specific structured data.
 * Each DiagnosticCode may define its own payload schema.
 *
 * Sprint 1: Minimal payloads (mostly undefined).
 * Sprint 2+: Rich payloads for runtime metrics, type details, etc.
 */
export type DiagnosticPayload =
  | { code: 'E_TYPE_MISMATCH'; expected: string; actual: string }
  | { code: 'E_CYCLE_DETECTED'; cycleBlocks: string[] }
  | { code: 'W_GRAPH_DISCONNECTED_BLOCK'; distance: number }
  | { code: 'W_BLOCK_UNREACHABLE_ERROR'; originalError: string; originalCode: string }
  | { code: 'E_CARDINALITY_MISMATCH'; inputCardinality: string; outputCardinality: string }
  | { code: 'E_INSTANCE_MISMATCH'; instanceA: string; instanceB: string; portA: string; portB: string }
  | { code: 'E_LANE_COUPLED_DISALLOWED'; blockType: string; reason: string }
  | { code: 'E_IMPLICIT_BROADCAST_DISALLOWED'; signalPort: string; fieldContext: string }
  | { code: 'E_PAYLOAD_NOT_ALLOWED'; port: string; payload: string; allowedPayloads: string[] }
  | { code: 'E_PAYLOAD_COMBINATION_NOT_ALLOWED'; inputPayloads: string[]; blockType: string }
  | { code: 'E_UNIT_MISMATCH'; port: string; expectedUnit: string; actualUnit: string }
  | { code: 'E_IMPLICIT_CAST_DISALLOWED'; fromPayload: string; toPayload: string; port: string }
  | { code: 'E_AXIS_INVALID'; axisKind: string; expectedType: string; actualType: string } // Item #20
  | { code: 'W_FLAG_DOWNGRADED'; originalCode: string; configuredSeverity: string }
  | undefined;

// =============================================================================
// Diagnostic Actions
// =============================================================================

/**
 * Reference to a specific port on a block.
 * Used by actions that target ports (e.g., addAdapter).
 */
export interface PortTargetRef {
  readonly blockId: string;
  readonly portId: string;
  readonly portKind: 'input' | 'output';
}

/**
 * DiagnosticAction represents an automated or user-initiated fix for a diagnostic issue.
 *
 * Actions follow the Action Determinism Contract:
 * - Serializable: Can be sent over network or saved to disk
 * - Replayable: Same action + same state = same result
 * - Safe: All references by ID, not mutable object pointers
 *
 * Each action variant must specify:
 * - Exact targets (by ID)
 * - Exact operation parameters
 * - User-facing label for UI buttons
 *
 * @see design-docs/.../07-diagnostics-system.md:368-379 for spec
 * @see design-docs/.../07-diagnostics-system.md:835-854 for Action Determinism Contract
 */
export type DiagnosticAction =
  | GoToTargetAction
  | InsertBlockAction
  | RemoveBlockAction
  | AddAdapterAction
  | CreateTimeRootAction
  | MuteDiagnosticAction
  | OpenDocsAction;

/**
 * Navigate to a specific target in the UI (block, port, edge, etc.)
 * Used for "jump to problem" functionality.
 *
 * @example
 * { kind: 'goToTarget', label: 'Go to Block', target: { kind: 'block', blockId: 'abc123' } }
 */
export interface GoToTargetAction {
  readonly kind: 'goToTarget';
  readonly label: string;
  readonly target: TargetRef;
}

/**
 * Insert a new block into the patch.
 * Used for adding missing blocks (e.g., TimeRoot, Adapter).
 *
 * @example
 * { kind: 'insertBlock', label: 'Add InfiniteTimeRoot', blockType: 'InfiniteTimeRoot' }
 * @example
 * { kind: 'insertBlock', label: 'Insert After', blockType: 'Gain', position: 'after', nearBlockId: 'abc123' }
 */
export interface InsertBlockAction {
  readonly kind: 'insertBlock';
  readonly label: string;
  readonly blockType: string;
  readonly position?: 'before' | 'after';
  readonly nearBlockId?: string;
}

/**
 * Remove a block from the patch.
 * Used for cleaning up disconnected or problematic blocks.
 *
 * @example
 * { kind: 'removeBlock', label: 'Remove Disconnected Block', blockId: 'abc123' }
 */
export interface RemoveBlockAction {
  readonly kind: 'removeBlock';
  readonly label: string;
  readonly blockId: string;
}

/**
 * Add an adapter block between two ports to fix type mismatches.
 * Used for automatic type coercion (e.g., Signal → Value, Field → Signal).
 *
 * @example
 * { kind: 'addAdapter', label: 'Insert Adapter', fromPort: { blockId: 'a', portId: 'out', portKind: 'output' }, adapterType: 'SignalToValue' }
 */
export interface AddAdapterAction {
  readonly kind: 'addAdapter';
  readonly label: string;
  readonly fromPort: PortTargetRef;
  readonly adapterType: string;
}

/**
 * Create a time root block (required for patch execution).
 * Used when patch is missing a TimeRoot.
 *
 * @example
 * { kind: 'createTimeRoot', label: 'Add InfiniteTimeRoot', timeRootKind: 'Infinite' }
 */
export interface CreateTimeRootAction {
  readonly kind: 'createTimeRoot';
  readonly label: string;
  readonly timeRootKind: 'Infinite';
}

/**
 * Mute/hide a specific diagnostic (user dismissal).
 * Used when user wants to suppress warnings they consider acceptable.
 *
 * @example
 * { kind: 'muteDiagnostic', label: 'Mute Warning', diagnosticId: 'diag-xyz' }
 */
export interface MuteDiagnosticAction {
  readonly kind: 'muteDiagnostic';
  readonly label: string;
  readonly diagnosticId: string;
}

/**
 * Open documentation in external browser or help panel.
 * Used for "Learn More" links on diagnostics.
 *
 * @example
 * { kind: 'openDocs', label: 'Learn More', docUrl: 'https://docs.example.com/signals' }
 */
export interface OpenDocsAction {
  readonly kind: 'openDocs';
  readonly label: string;
  readonly docUrl: string;
}

// =============================================================================
// Type Guards for DiagnosticAction
// =============================================================================

export function isGoToTargetAction(action: DiagnosticAction): action is GoToTargetAction {
  return action.kind === 'goToTarget';
}

export function isInsertBlockAction(action: DiagnosticAction): action is InsertBlockAction {
  return action.kind === 'insertBlock';
}

export function isRemoveBlockAction(action: DiagnosticAction): action is RemoveBlockAction {
  return action.kind === 'removeBlock';
}

export function isAddAdapterAction(action: DiagnosticAction): action is AddAdapterAction {
  return action.kind === 'addAdapter';
}

export function isCreateTimeRootAction(action: DiagnosticAction): action is CreateTimeRootAction {
  return action.kind === 'createTimeRoot';
}

export function isMuteDiagnosticAction(action: DiagnosticAction): action is MuteDiagnosticAction {
  return action.kind === 'muteDiagnostic';
}

export function isOpenDocsAction(action: DiagnosticAction): action is OpenDocsAction {
  return action.kind === 'openDocs';
}

// =============================================================================
// Full Diagnostic Interface
// =============================================================================

/**
 * Diagnostic - Complete diagnostic with stable ID, metadata, and scope.
 *
 * Design principles:
 * - Stable ID for deduplication and tracking across revisions
 * - Structured target (TargetRef) for precise UI navigation
 * - Scope tracking (patchRevision, compileId) for version awareness
 * - Metadata for occurrence counting and staleness detection
 * - Extensible payload for code-specific structured data
 */
export interface Diagnostic {
  /** Stable ID format: "CODE:targetStr:revN[:signature]" */
  readonly id: string;

  /** Diagnostic code (e.g., E_TYPE_MISMATCH) */
  readonly code: DiagnosticCode;

  /** Severity level */
  readonly severity: Severity;

  /** Domain classification */
  readonly domain: Domain;

  /** Primary target (what the diagnostic points to) */
  readonly primaryTarget: TargetRef;

  /** Short title (1 line) */
  readonly title: string;

  /** Detailed message (multi-line OK) */
  readonly message: string;

  /** Scope tracking */
  readonly scope: {
    readonly patchRevision: number; // Patch version where this diagnostic was raised
    readonly compileId?: string; // Optional compile ID for compile-time diagnostics
  };

  /** Metadata for tracking and staleness */
  readonly metadata: {
    readonly firstSeenAt: number; // Unix timestamp (ms)
    readonly lastSeenAt: number; // Unix timestamp (ms)
    readonly occurrenceCount: number; // How many times this diagnostic has been raised
  };

  /** Optional structured payload */
  readonly payload?: DiagnosticPayload;

  /** Optional actions for resolution */
  readonly actions?: readonly DiagnosticAction[];
}

// =============================================================================
// DiagnosticFilter
// =============================================================================

/**
 * DiagnosticFilter - Query interface for retrieving diagnostics.
 *
 * Sprint 1: Minimal filters (severity, domain, target kind).
 * Sprint 2+: Rich filters (date range, occurrence count, etc.).
 */
export interface DiagnosticFilter {
  readonly severity?: readonly Severity[];
  readonly domain?: readonly Domain[];
  readonly code?: DiagnosticCode | DiagnosticCode[];
  readonly targetKind?: TargetRef['kind'];
  readonly blockId?: string; // Filter by specific block
  readonly patchRevision?: number; // Filter by specific patch revision
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a Diagnostic object with default metadata.
 * The id field should be set separately using generateDiagnosticId.
 */
export function createDiagnostic(params: {
  code: DiagnosticCode;
  severity: Severity;
  domain: Domain;
  primaryTarget: TargetRef;
  title: string;
  message: string;
  scope: { patchRevision: number; compileId?: string };
  payload?: DiagnosticPayload;
  actions?: DiagnosticAction[];
}): Omit<Diagnostic, 'id'> {
  const now = Date.now();
  return {
    code: params.code,
    severity: params.severity,
    domain: params.domain,
    primaryTarget: params.primaryTarget,
    title: params.title,
    message: params.message,
    scope: params.scope,
    metadata: {
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
    },
    payload: params.payload,
    actions: params.actions,
  };
}
