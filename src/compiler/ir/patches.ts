/**
 * Patch Transformation Types
 *
 * Intermediate representations of the patch as it moves through compilation passes.
 * Each pass transforms the patch, adding information and validating constraints.
 *
 * Pass Flow:
 * Patch -> NormalizedPatch (from graph/normalize.ts)
 *       -> TypedPatch (Pass 2)
 *       -> TimeResolvedPatch (Pass 3)
 *       -> DepGraph (Pass 4)
 *       -> AcyclicOrLegalGraph (Pass 5)
 *       -> LoweredIR (Pass 6)
 *
 * IMPORTANT: The compiler receives NormalizedPatch from the Graph Normalizer.
 * It never sees raw Patch directly.
 */

import type { SigExprId } from "./types";
import type { SignalType, DomainRef } from "../../core/canonical-types";
import type { TimeModelIR } from "./schedule";

// Re-export from graph/normalize for convenience - these are the authoritative types
export type { BlockIndex, NormalizedPatch, NormalizedEdge } from "../../graph/normalize";
export type { Block, Edge, Patch, PortRef } from "../../graph/Patch";
import type { BlockIndex, NormalizedPatch, NormalizedEdge } from "../../graph/normalize";
import type { Block } from "../../graph/Patch";

// =============================================================================
// Transform Steps (for future edge transforms)
// =============================================================================

/**
 * Transform step on an edge (adapters and lenses).
 */
export type TransformStep = AdapterStep | LensStep;

export interface AdapterStep {
  readonly kind?: 'adapter';
  readonly adapterId?: string;
  readonly adapter?: string;
  readonly params?: Record<string, unknown>;
}

export interface LensStep {
  readonly kind: 'lens';
  readonly lens: LensInstance;
}

export interface LensInstance {
  readonly lensId: string;
  readonly enabled?: boolean;
  readonly params: Record<string, LensBinding>;
}

export type LensBinding = { kind: 'literal'; value: unknown };

// =============================================================================
// Typed Patch - Pass 2
// =============================================================================

/**
 * Typed patch with resolved types for all edges and defaults.
 *
 * Pass 2 resolves TypeDesc for every connection and validates type compatibility.
 * Extends NormalizedPatch from graph/normalize.ts.
 */
export interface TypedPatch extends NormalizedPatch {
  /** Type descriptors for each block output: Map<BlockId, Map<PortId, SignalType | DomainRef>> */
  readonly blockOutputTypes: ReadonlyMap<string, ReadonlyMap<string, SignalType | DomainRef>>;
}

// =============================================================================
// Time-Resolved Patch - Pass 3
// =============================================================================

/**
 * Patch with time signals resolved and validated.
 *
 * Pass 3 determines the time model and generates derived time signals.
 */
export interface TimeResolvedPatch extends TypedPatch {
  /** Time model (authoritative for the patch) */
  readonly timeModel: TimeModelIR;

  /** Derived time signals available to all blocks */
  readonly timeSignals: TimeSignals;
}

/**
 * Derived time signals generated from the time model.
 */
export interface TimeSignals {
  /** Signal expression ID for tModelMs (model time) */
  readonly tModelMs: SigExprId;

  /** Signal expression ID for phaseA (primary phase) */
  readonly phaseA?: SigExprId;

  /** Signal expression ID for phaseB (secondary phase) */
  readonly phaseB?: SigExprId;

  /** Signal expression ID for progress01 (finite only) */
  readonly progress01?: SigExprId;
}

// =============================================================================
// Dependency Graph - Pass 4
// =============================================================================

/**
 * Node in the dependency graph.
 */
export type DepNode = { readonly kind: "BlockEval"; readonly blockIndex: BlockIndex };

/**
 * Edge in the dependency graph.
 */
export interface DepEdge {
  readonly from: DepNode;
  readonly to: DepNode;
}

/**
 * Complete dependency graph.
 */
export interface DepGraph {
  readonly nodes: readonly DepNode[];
  readonly edges: readonly DepEdge[];
}

/**
 * Dependency graph with time model (output of Pass 4).
 */
export interface DepGraphWithTimeModel {
  readonly graph: DepGraph;
  readonly timeModel: TimeModelIR;

  /** Blocks threaded through from NormalizedPatch */
  readonly blocks: readonly Block[];

  /** Edges threaded through from NormalizedPatch */
  readonly edges: readonly NormalizedEdge[];
}

// =============================================================================
// Cycle Validation - Pass 5
// =============================================================================

/**
 * Strongly connected component in the dependency graph.
 */
export interface SCC {
  readonly nodes: readonly DepNode[];
  readonly hasStateBoundary: boolean;
}

/**
 * Illegal cycle error.
 */
export interface IllegalCycleError {
  readonly kind: "IllegalCycle";
  readonly nodes: readonly BlockIndex[];
}

/**
 * Graph with cycle validation results.
 */
export interface AcyclicOrLegalGraph {
  readonly graph: DepGraph;
  readonly sccs: readonly SCC[];
  readonly errors: readonly IllegalCycleError[];

  /** Time model from Pass 3, threaded through for Pass 6 */
  readonly timeModel: TimeModelIR;

  /** Blocks threaded through for downstream passes */
  readonly blocks: readonly Block[];

  /** Edges threaded through for downstream passes */
  readonly edges: readonly NormalizedEdge[];
}

// =============================================================================
// Helper Type Guards
// =============================================================================

/**
 * Type guard for BlockEval nodes.
 */
export function isBlockEval(node: DepNode): node is { kind: "BlockEval"; blockIndex: BlockIndex } {
  return node.kind === "BlockEval";
}
