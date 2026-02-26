/**
 * Patch Transformation Types
 *
 * Intermediate representations of the patch as it moves through compilation passes.
 * Each pass transforms the patch, adding information and validating constraints.
 *
 * Pass Flow:
 * Patch -> NormalizedPatch (from compiler/frontend/normalize-indexing.ts)
 *       -> TypedPatch (Pass 2)
 *       -> DepGraph (Pass 3)
 *       -> AcyclicOrLegalGraph (Pass 4)
 *       -> UnlinkedIRFragments (Pass 5)
 *
 * IMPORTANT: The compiler receives NormalizedPatch from the Graph Normalizer.
 * It never sees raw Patch directly.
 */

import type { CanonicalType } from "../../core/canonical-types";
import type { CardinalityAcceptance } from "../../core/canonical-types/cardinality";
import type { CombineMode } from "../../types";

export type { BlockIndex } from "./BlockIndex";
export type { NormalizedPatch, NormalizedEdge } from "./NormalizedPatch";
export type { Block, Edge, Patch } from "../../graph/Patch";
import type { BlockIndex } from "./BlockIndex";
import type { NormalizedPatch, NormalizedEdge } from "./NormalizedPatch";
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
 * Backend input policy metadata keyed by compiler port key.
 * This is compiled at the frontend boundary from editor/graph metadata.
 */
export interface InputPortPolicy {
  readonly combineMode: CombineMode;
}

/**
 * Patch with all port types resolved.
 * The portTypes map is the single source of truth for all port types.
 */
export interface TypeResolvedPatch extends NormalizedPatch {
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
  readonly inputPortPolicies: ReadonlyMap<PortKey, InputPortPolicy>;
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
// Dependency Graph - Pass 3
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
  /** Port types from pass1 - THE source of truth */
  readonly portTypes: TypeResolvedPatch['portTypes'];
  /** Input policies from frontend normalization (e.g., combineMode). */
  readonly inputPortPolicies: TypeResolvedPatch['inputPortPolicies'];

  /** Per-edge types for collect ports (threaded from TypeResolvedPatch) */
  readonly collectEdgeTypes?: TypeResolvedPatch['collectEdgeTypes'];

  /** Blocks threaded through from NormalizedPatch */
  readonly blocks: readonly Block[];

  /** Edges threaded through from NormalizedPatch */
  readonly edges: readonly NormalizedEdge[];
}

// =============================================================================
// Cycle Validation - Pass 4
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

  /** Port types from pass1 - THE source of truth */
  readonly portTypes: TypeResolvedPatch['portTypes'];
  /** Input policies from frontend normalization (e.g., combineMode). */
  readonly inputPortPolicies: TypeResolvedPatch['inputPortPolicies'];

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
