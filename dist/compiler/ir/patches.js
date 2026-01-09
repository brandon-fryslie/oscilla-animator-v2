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
// =============================================================================
// Helper Type Guards
// =============================================================================
/**
 * Type guard for BlockEval nodes.
 */
export function isBlockEval(node) {
    return node.kind === "BlockEval";
}
