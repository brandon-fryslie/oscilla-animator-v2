/**
 * Patch Transformation Types
 *
 * Intermediate representations of the patch as it moves through compilation passes.
 * Each pass transforms the patch, adding information and validating constraints.
 *
 * Pass Flow:
 * Patch -> NormalizedPatch (from compiler/frontend/normalize-indexing.ts)
 *       -> TypedPatch (Pass 2)
 *       -> TimeResolvedPatch (Pass 3)
 *       -> DepGraph (Pass 4)
 *       -> AcyclicOrLegalGraph (Pass 5)
 *       -> UnlinkedIRFragments (Pass 6)
 *
 * IMPORTANT: The compiler receives NormalizedPatch from the Graph Normalizer.
 * It never sees raw Patch directly.
 */

import type { ValueExprId } from "./Indices";
import type { CanonicalType } from "../../core/canonical-types";
import type { CardinalityAcceptance } from "../../core/canonical-types/cardinality";
import type { TimeModelIR } from "./schedule";

export type { BlockIndex, NormalizedPatch, NormalizedEdge } from "../frontend/normalize-indexing";
export type { Block, Edge, Patch } from "../../graph/Patch";
import type { BlockIndex, NormalizedPatch, NormalizedEdge } from "../frontend/normalize-indexing";
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
// Type-Resolved Patch - Pass 1 output
// =============================================================================

/**
 * Key for a port in the type map.
 * Format: `${blockIndex}:${portName}:${'in' | 'out'}`
 */
export type PortKey = `${number}:${string}:${'in' | 'out'}`;

/**
 * Key for a per-edge type on a collect port.
 * Format: `${blockIndex}:${portName}:${edgeIndex}`
 * where edgeIndex is the sorted position among edges targeting this collect port.
 */
export type CollectEdgeKey = `${number}:${string}:${number}`;

/**
 * Patch with all port types resolved.
 * The portTypes map is the single source of truth for all port types.
 */
export interface TypeResolvedPatch extends NormalizedPatch {
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
  /**
   * Per-edge types for collect ports.
   * Collect ports opt out of union-find unification — each incoming edge
   * gets its own independently validated CanonicalType.
   */
  readonly collectEdgeTypes?: ReadonlyMap<CollectEdgeKey, CanonicalType>;
  /**
   * Per-port cardinality acceptance from CT/ICT declarations.
   * // [LAW:one-source-of-truth] Threaded from TypeFacts via bridge.
   */
  readonly portAcceptance?: ReadonlyMap<PortKey, CardinalityAcceptance>;
}

// =============================================================================
// Typed Patch - Pass 2
// =============================================================================

/**
 * Typed patch - pass2 validated view over TypeResolvedPatch.
 *
 * Pass 2 validates edge compatibility using resolved types from pass1.
 * The validated patch shape is identical to TypeResolvedPatch.
 */
export type TypedPatch = TypeResolvedPatch;

// =============================================================================
// Time-Resolved Patch - Pass 3
// =============================================================================

/**
 * Patch with time channels resolved and validated.
 *
 * Pass 3 determines the time model and generates derived time channels.
 */
export interface TimeResolvedPatch extends TypedPatch {
  /** Time model (authoritative for the patch) */
  readonly timeModel: TimeModelIR;

  /** Derived time channels available to all blocks */
  readonly timeChannels: TimeChannels;
}

/**
 * Derived time channels generated from the time model.
 */
export interface TimeChannels {
  /** One-cardinality expression ID for tModelMs (model time) */
  readonly tModelMs: ValueExprId;

  /** One-cardinality expression ID for phaseA (primary phase) */
  readonly phaseA?: ValueExprId;

  /** One-cardinality expression ID for phaseB (secondary phase) */
  readonly phaseB?: ValueExprId;

  /** One-cardinality expression ID for dt (delta time) */
  readonly dt?: ValueExprId;

  /** Event expression ID for pulse (fires on phase wrap) */
  readonly pulse: ValueExprId | null;

  /** One-cardinality expression ID for palette (phase-derived color) */
  readonly palette?: ValueExprId;

  /** One-cardinality expression ID for energy (phase-derived energy) */
  readonly energy?: ValueExprId;
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

  /** Port types from pass1 - THE source of truth */
  readonly portTypes: TypeResolvedPatch['portTypes'];

  /** Per-edge types for collect ports (threaded from TypeResolvedPatch) */
  readonly collectEdgeTypes?: TypeResolvedPatch['collectEdgeTypes'];

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

  /** Port types from pass1 - THE source of truth */
  readonly portTypes: TypeResolvedPatch['portTypes'];

  /** Per-edge types for collect ports (threaded from TypeResolvedPatch) */
  readonly collectEdgeTypes?: TypeResolvedPatch['collectEdgeTypes'];

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
