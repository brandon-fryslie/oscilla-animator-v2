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
import type { TypeDesc, SigExprId } from "./types";
import type { TimeModelIR } from "./schedule";
export type { BlockIndex, NormalizedPatch, NormalizedEdge } from "../../graph/normalize";
export type { Block, Edge, Patch, PortRef } from "../../graph/Patch";
import type { BlockIndex, NormalizedPatch } from "../../graph/normalize";
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
export type LensBinding = {
    kind: 'literal';
    value: unknown;
};
/**
 * Typed patch with resolved types for all edges and defaults.
 *
 * Pass 2 resolves TypeDesc for every connection and validates type compatibility.
 * Extends NormalizedPatch from graph/normalize.ts.
 */
export interface TypedPatch extends NormalizedPatch {
    /** Type descriptors for each block output: Map<BlockId, Map<PortId, TypeDesc>> */
    readonly blockOutputTypes: ReadonlyMap<string, ReadonlyMap<string, TypeDesc>>;
    /** Type descriptors for bus outputs (if any buses exist) */
    readonly busOutputTypes?: ReadonlyMap<string, TypeDesc>;
}
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
    /** Signal expression ID for phase01 (cyclic only) */
    readonly phase01?: SigExprId;
    /** Signal expression ID for wrapEvent (cyclic only) */
    readonly wrapEvent?: SigExprId;
    /** Signal expression ID for progress01 (finite only) */
    readonly progress01?: SigExprId;
}
/**
 * Node in the dependency graph.
 */
export type DepNode = {
    readonly kind: "BlockEval";
    readonly blockIndex: BlockIndex;
};
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
}
/**
 * Type guard for BlockEval nodes.
 */
export declare function isBlockEval(node: DepNode): node is {
    kind: "BlockEval";
    blockIndex: BlockIndex;
};
