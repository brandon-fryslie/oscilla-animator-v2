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
  | 'I_SILENT_VALUE_USED' // Unconnected input using default value

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
  | { code: 'E_CARDINALITY_MISMATCH'; inputCardinality: string; outputCardinality: string }
  | { code: 'E_INSTANCE_MISMATCH'; instanceA: string; instanceB: string; portA: string; portB: string }
  | { code: 'E_LANE_COUPLED_DISALLOWED'; blockType: string; reason: string }
  | { code: 'E_IMPLICIT_BROADCAST_DISALLOWED'; signalPort: string; fieldContext: string }
  | { code: 'E_PAYLOAD_NOT_ALLOWED'; port: string; payload: string; allowedPayloads: string[] }
  | { code: 'E_PAYLOAD_COMBINATION_NOT_ALLOWED'; inputPayloads: string[]; blockType: string }
  | { code: 'E_UNIT_MISMATCH'; port: string; expectedUnit: string; actualUnit: string }
  | { code: 'E_IMPLICIT_CAST_DISALLOWED'; fromPayload: string; toPayload: string; port: string }
  | undefined;

// =============================================================================
// Diagnostic Actions (Deferred to Sprint 2+)
// =============================================================================

/**
 * DiagnosticAction represents an automated or semi-automated fix.
 * Actions are idempotent (safe to replay).
 *
 * Sprint 1: No actions implemented.
 * Sprint 2+: Quick fixes like "Insert Adapter", "Add TimeRoot", etc.
 */
export interface DiagnosticAction {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly isPreferred?: boolean;
}

// =============================================================================
// Full Diagnostic Interface
// =============================================================================

/**
 * Diagnostic represents a single issue, warning, or informational message.
 *
 * Key properties:
 * - id: Stable, deterministic identifier (code + target + revision + signature)
 * - code: Diagnostic type (enables filtering, grouping, actions)
 * - severity: Impact level (fatal/error/warn/info/hint)
 * - domain: Source phase (authoring/compile/runtime/perf)
 * - primaryTarget: Main entity this diagnostic refers to
 * - affectedTargets: Additional related entities (optional)
 * - title: Short, user-facing summary (1-2 words)
 * - message: Detailed explanation (1-2 sentences)
 * - payload: Code-specific structured data (optional)
 * - actions: Available fixes/improvements (Sprint 2+)
 * - scope: Context (patch revision, compile ID, runtime session)
 * - metadata: Tracking info (first seen, last seen, count)
 */
export interface Diagnostic {
  readonly id: string;
  readonly code: DiagnosticCode;
  readonly severity: Severity;
  readonly domain: Domain;
  readonly primaryTarget: TargetRef;
  readonly affectedTargets?: readonly TargetRef[];
  readonly title: string;
  readonly message: string;
  readonly payload?: DiagnosticPayload;
  readonly actions?: readonly DiagnosticAction[];
  readonly scope: {
    readonly patchRevision: number;
    readonly compileId?: string;
    readonly runtimeSessionId?: string;
  };
  readonly metadata: {
    readonly firstSeenAt: number;
    readonly lastSeenAt: number;
    readonly occurrenceCount: number;
  };
}

// =============================================================================
// Helper: Create Diagnostic
// =============================================================================

/**
 * Helper function to create a Diagnostic with sensible defaults.
 * Automatically generates stable ID and initializes metadata.
 */
export function createDiagnostic(
  options: Omit<Diagnostic, 'id' | 'metadata'> & {
    signature?: string;
  }
): Diagnostic {
  const { signature, ...rest } = options;
  const now = Date.now();

  return {
    id: '', // Will be set by generateDiagnosticId in diagnosticId.ts
    ...rest,
    metadata: {
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
    },
  };
}

// =============================================================================
// Filter Options
// =============================================================================

/**
 * DiagnosticFilter defines criteria for querying diagnostics.
 */
export interface DiagnosticFilter {
  readonly severity?: Severity | Severity[];
  readonly domain?: Domain | Domain[];
  readonly code?: DiagnosticCode | DiagnosticCode[];
  readonly targetKind?: TargetRef['kind'];
  readonly patchRevision?: number;
}
