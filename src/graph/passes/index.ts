/**
 * Graph Normalization Passes
 *
 * Type and query re-exports for backward compatibility.
 *
 * NOTE: The normalization pipeline has moved to src/compiler/frontend/ as part
 * of the Frontend/Backend split. This file provides re-exports only.
 * New code should import from src/compiler/frontend/ directly.
 *
 * // [LAW:single-enforcer] Default source insertion is handled by the fixpoint
 * // engine (compileFrontend → finalizeNormalizationFixpoint). The old
 * // pass1DefaultSources / runNormalizationPasses pipeline has been deleted.
 */

// =============================================================================
// Re-export Types
// =============================================================================

export type { NormalizedPatch, NormalizedEdge, BlockIndex } from '../../compiler/frontend/normalize-indexing';
export type { AdapterError } from '../../compiler/frontend/normalize-adapters';
export type { CompositeExpansionResult, ExpansionDiagnostic, ExpansionProvenance } from '../../compiler/frontend/composite-expansion';

// Unified error type
import type { AdapterError } from '../../compiler/frontend/normalize-adapters';
import type { IndexingError } from '../../compiler/frontend/normalize-indexing';
export type NormError = AdapterError | IndexingError;

// =============================================================================
// Re-export Individual Passes (for testing)
// =============================================================================

export { expandComposites } from '../../compiler/frontend/composite-expansion';
export { pass2Adapters } from '../../compiler/frontend/normalize-adapters';
export { pass3Indexing, getInputEdges, getOutputEdges } from '../../compiler/frontend/normalize-indexing';
